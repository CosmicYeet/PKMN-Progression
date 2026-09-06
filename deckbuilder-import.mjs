const IGNORED_LINE=/^(?:##|Pokemon\s*\(\d+\)|Pokémon\s*\(\d+\)|Trainer\s*\(\d+\)|Energy\s*\(\d+\)|Total:\s*\d+)/i;

export function parseTcgOneDeck(text){
  const entries=[];
  const errors=[];
  let declaredTotal=null;
  String(text||'').split(/\r?\n/).forEach((raw,index)=>{
    const line=raw.trim();
    if(!line)return;
    const totalMatch=line.match(/^Total:\s*(\d+)/i);
    if(totalMatch){declaredTotal=Number(totalMatch[1]);return}
    if(IGNORED_LINE.test(line))return;
    const match=line.match(/^(\d+)\s+(.+?)\s+([A-Z0-9-]+)\s+(\S+)$/i);
    if(!match||Number(match[1])<1){errors.push({lineNumber:index+1,line});return}
    entries.push({quantity:Number(match[1]),name:match[2].trim(),setCode:match[3].toUpperCase(),number:match[4]});
  });
  return {entries,errors,declaredTotal,actualTotal:entries.reduce((sum,entry)=>sum+entry.quantity,0)}
}

function setCodeIndex(setCodeMap){const index=new Map();for(const [setId,code] of Object.entries(setCodeMap)){const key=String(code).toUpperCase();if(!index.has(key))index.set(key,[]);index.get(key).push(setId)}return index}
function sameName(a,b){return String(a||'').localeCompare(String(b||''),undefined,{sensitivity:'base'})===0}
function unknownId(entry){const slug=entry.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,36)||'card';return `import-${entry.setCode.toLowerCase()}-${entry.number.toLowerCase()}-${slug}`}

export function resolveTcgOneEntries(entries,setCodeMap,ownedCards=[]){
  const codes=setCodeIndex(setCodeMap);
  const owned=new Map(ownedCards.map(card=>[card.id,card]));
  const resolved=new Map();
  for(const entry of entries){
    const setIds=codes.get(entry.setCode)||[];
    const candidates=setIds.map(setId=>`${setId}-${entry.number}`);
    const exact=candidates.find(id=>owned.has(id)&&sameName(owned.get(id).name,entry.name));
    const present=exact||candidates.find(id=>owned.has(id));
    const id=present||candidates[0]||unknownId(entry);
    const previous=resolved.get(id);
    const card={
      id,
      name:entry.name,
      quantity:(previous?.quantity||0)+entry.quantity,
      setCode:entry.setCode,
      number:entry.number,
      imported:true,
      imageUnavailable:!setIds.length,
      mappingWarning:setIds.length?'':`Unknown TCG ONE set code ${entry.setCode}`
    };
    resolved.set(id,previous?{...previous,quantity:card.quantity}:card);
  }
  return [...resolved.values()]
}

export function validateDeckCards(deckCards,ownedCards,basicEnergyNames){
  const owned=new Map(ownedCards.map(card=>[card.id,Math.max(0,Number(card.count)||0)]));
  const nameTotals=new Map();
  for(const card of deckCards){const key=card.name.toLowerCase();nameTotals.set(key,(nameTotals.get(key)||0)+card.quantity)}
  return deckCards.map(card=>{
    const issues=[];
    const isBasic=basicEnergyNames.has(card.name.toLowerCase());
    if(card.mappingWarning)issues.push(card.mappingWarning);
    if(!isBasic){
      const available=owned.get(card.id)||0;
      if(!available)issues.push('Not in this trainer’s collection');
      else if(card.quantity>available)issues.push(`Own ${available}; deck uses ${card.quantity}`);
      const nameTotal=nameTotals.get(card.name.toLowerCase())||0;
      if(nameTotal>4)issues.push(`Four-copy limit exceeded (${nameTotal} total)`);
    }
    return {...card,issues}
  })
}

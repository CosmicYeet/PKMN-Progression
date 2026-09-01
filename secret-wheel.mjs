// Pure wheel logic, shared by the page and the Node tests.
export const DEFAULT_OPTIONS = [
  {label: 'One bonus pack', chance: 25, description: 'Open 1 pack of the current set.'},
  {label: 'Double dip', chance: 15, description: 'Open 2 packs of the current set.'},
  {label: 'Back to Base', chance: 10, description: 'Open 3 packs of Base Set.'},
  {label: 'Jungle expedition', chance: 10, description: 'Open 1 pack of Jungle.'},
  {label: 'Fossil find', chance: 10, description: 'Open 1 pack of Fossil.'},
  {label: 'Ban nomination', chance: 10, description: 'Nominate a card for a ban. A majority trainer vote is still required.'},
  {label: 'Trading post', chance: 10, description: 'Propose swapping 1 spare card with a willing trainer. Both must agree.'},
  {label: 'Lucky escape', chance: 10, description: 'Nothing happens. Your collection is safe... for now.'}
];

export function validateOptions(options) {
  if (!options.length) throw new Error('Add at least one option with a positive chance.');
  if (options.length > 40) throw new Error('Use no more than 40 active options.');
  const labels = new Set();
  const cleaned = options.map(option => {
    const label = String(option.label ?? '').trim();
    const chance = Number(option.chance);
    if (!label || label.length > 100) throw new Error('Each option needs a name of 1–100 characters.');
    if (labels.has(label.toLowerCase())) throw new Error('Option names must be unique: ' + label);
    labels.add(label.toLowerCase());
    if (!Number.isFinite(chance) || chance <= 0 || chance > 100) {
      throw new Error('Chance must be greater than 0 and at most 100 for: ' + label);
    }
    return {label, chance, description: String(option.description ?? '').trim().slice(0, 1000)};
  });
  const total = cleaned.reduce((sum, option) => sum + option.chance, 0);
  if (Math.abs(total - 100) > 0.000001) {
    throw new Error('Chances must total 100%. Current total: ' + Number(total.toFixed(6)) + '%.');
  }
  return cleaned;
}

export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) { row.push(field); field = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += char;
  }
  if (quoted) throw new Error('The spreadsheet response contains an unfinished quoted value.');
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export function optionsFromCSV(text) {
  const rows = parseCSV(text).filter(row => row.some(cell => cell.trim()));
  const header = rows.shift()?.map(cell => cell.replace(/^\uFEFF/, '').trim().toLowerCase());
  if (!header || header[0] !== 'option' || header[1] !== 'chance (%)' || header[2] !== 'description') {
    throw new Error('Wheel!A1:C1 must be: Option, Chance (%), Description.');
  }
  const options = rows.map((row, index) => {
    const raw = (row[1] ?? '').trim();
    // Accept plain numbers (25) or formatted percentages (25%), never blanks.
    if (!/^\d+(?:\.\d+)?\s*%?$/.test(raw)) throw new Error('Enter a numeric chance on Wheel row ' + (index + 2) + '.');
    return {label: row[0], chance: Number(raw.replace('%', '').trim()), description: row[2] ?? ''};
  });
  // 0% is an explicit way to disable an option without deleting the row.
  return validateOptions(options.filter(option => option.chance !== 0));
}

export function selectIndex(options, random) {
  if (!Number.isFinite(random) || random < 0 || random >= 1) throw new Error('Random value must be in [0, 1).');
  let cumulative = 0;
  const target = random * options.reduce((sum, option) => sum + option.chance, 0);
  for (let index = 0; index < options.length; index++) {
    cumulative += options[index].chance;
    if (target < cumulative) return index;
  }
  return options.length - 1;
}

export function landingRotation(options, index, currentRotation) {
  const total = options.reduce((sum, option) => sum + option.chance, 0);
  const before = options.slice(0, index).reduce((sum, option) => sum + option.chance, 0);
  const middle = (before + options[index].chance / 2) / total * 360;
  const target = (360 - middle) % 360;
  return currentRotation + 5 * 360 + ((target - currentRotation % 360 + 360) % 360);
}

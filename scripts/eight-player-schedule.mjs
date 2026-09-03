// Deterministic, dependency-free schedule data. Importing this file has no side effects.
export const PLAYERS = ['Keith','Ronnie','Justin G','Michael','Justin V','Ryan','Noah','Prov'];
export const COMPLETED = [
  [1,'Keith','Ronnie',2,1],
  [1,'Ronnie','Justin G',0,2],
  [1,'Justin G','Michael',2,0],
  [1,'Michael','Justin V',2,1],
  [1,'Justin V','Ryan',1,2],
  [1,'Ryan','Noah',0,2]
];
export const HEADERS = ['Week','Player 1','Player 2','Player 1 Score','Player 2 Score'];
export function makeSchedule() {
  // This labeling makes the first two circle-method rounds exactly the agreed
  // Week 1 cycle, including Keith–Prov and Noah–Prov. Only row display order differs.
  let rotation = ['Keith','Noah','Michael','Justin V','Ryan','Justin G','Prov','Ronnie'];
  const rounds = [];
  for(let round=0;round<7;round++) {
    rounds.push(Array.from({length:4},(_,i)=>[rotation[i],rotation[7-i]]));
    rotation=[rotation[0],rotation[7],...rotation.slice(1,7)];
  }
  const output = [...COMPLETED.map(row=>[...row]),[1,'Noah','Prov',null,null],[1,'Keith','Prov',null,null]];
  for(let week=2;week<=15;week++) {
    for(const round of [((week-1)*2)%7,((week-1)*2+1)%7]) {
      for(const [p1,p2] of rounds[round]) output.push([week,p1,p2,null,null]);
    }
  }
  return output;
}

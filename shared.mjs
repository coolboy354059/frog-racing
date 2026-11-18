export const carts = [
  ['Cherry Rocket','#fb5148',40,14,9,0], ['Lily Cruiser','#83d754',38,16,11,15],
  ['Honey Hopper','#ffd052',39,17,9,25], ['Blue Dart','#44a5fe',42,12,8,40],
  ['Plum Buggy','#bf83fa',38,15,12,35], ['Tangerine Turbo','#ff934a',41,13,9,55],
  ['Bubble Racer','#5cdeec',39,15,10,45], ['Petal Pilot','#ff88b3',37,18,12,30],
  ['Midnight Meteor','#7085af',43,11,8,65],
  ['Acorn Buggy','#bc7145',36,19,13,20], ['Dragonfly GT','#24bfa0',42,14,10,75],
  ['Comet Cab','#ffbd32',40,16,11,60], ['Glacier Glide','#99daff',41,15,12,85],
  ['Volcano Viper','#e64827',44,12,9,100], ['Jupiter Express','#db9158',45,11,8,125]
];
// Radius harmonics shape each closed circuit. Heights, colors and scenery vary by venue.
export const tracks = [
  ['Lily Pond Loop',115,88,12,2,3,'#83d8df','#81ba75','#4a945b','#477e79','🌷'],
  ['Sunset Canyon',137,88,25,3,7,'#ffa96d','#dfaa70','#b37751','#99553c','🌵'],
  ['Pinecone Pass',102,123,20,4,10,'#a4cfed','#85ad89','#487858','#3c6965','🌲'],
  ['Firefly Marsh',122,92,31,3,4,'#524c86','#507965','#375c53','#323e68','✨'],
  ['Frostcap Circuit',143,102,22,5,9,'#acdbf4','#deedf2','#a5cdd8','#7294b3','❄️']
];
const N=256, TAU=Math.PI*2, clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const wrap=(x,n)=>((x%n)+n)%n;
export function makeCircuit(index){
  const track=tracks[index], points=[];
  let length=0;
  for(let i=0;i<=N;i++){
    const a=i/N*TAU,r=track[3]*Math.cos(a*track[4]);
    const p={x:(track[1]+r)*Math.cos(a),z:(track[2]+r)*Math.sin(a),y:track[5]*Math.sin(a*2)};
    if(i) length+=Math.hypot(p.x-points[i-1].x,p.z-points[i-1].z);
    points.push({...p,s:length});
  }
  return { points,length,locationAt };
function locationAt(s,lane=0){
  s=wrap(s,length);
  let lo=0,hi=N;
  while(hi-lo>1){const mid=(hi+lo)>>1;if(points[mid].s>s)hi=mid;else lo=mid;}
  const a=points[lo],b=points[hi],ds=b.s-a.s,t=(s-a.s)/ds,fx=(b.x-a.x)/ds,fz=(b.z-a.z)/ds;
  return {x:a.x+(b.x-a.x)*t+fz*lane,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t-fx*lane,fx,fz};
}
}
export const halfWidth=6.3;
export const padLane=i=>i%2?2.6:-2.6;
export const coinsPerLap=12;
export function trackCoin(index,length){
  const lanes=[0,-2.8,2.8,0,2.8,-2.8];
  return {s:(index+.5)*length/coinsPerLap,lane:lanes[index%lanes.length]};
}
export function drive(player, circuit, mask, dt){
  const {locationAt,length}=circuit, cart=carts[player.id];
  const gas=mask&1, brake=mask&2, steer=Number(Boolean(mask&8))-Number(Boolean(mask&4));
  const a=locationAt(player.s),b=locationAt(player.s+6);
  const bend=(a.fz*b.fx-a.fx*b.fz)/6;
  player.lane=clamp(player.lane+(steer*cart[4]*Math.min(1,player.v/7)-bend*player.v*player.v*.13)*dt,-9,9);
  const off=Math.abs(player.lane)>halfWidth;
  player.boost=Math.max(0,player.boost-dt);
  const cap=off?19:cart[2]+(player.boost?12:0);
  const acceleration=brake?-31:player.boost?24:gas?cart[3]:-6;
  player.v=clamp(player.v+(player.v>cap?Math.min(-23,acceleration):acceleration)*dt,0,Math.max(cap,player.v));
  const previous=player.s;
  player.s+=player.v*dt;
  // Each coin has one crossing point per racer per lap.
  const spacing=length/coinsPerLap;
  const first=Math.floor(previous/spacing-.5)+1;
  const last=Math.min(3*coinsPerLap-1,Math.floor(player.s/spacing-.5));
  for(let i=first;i<=last;i++){
    if(Math.abs(player.lane-trackCoin(i,length).lane)<=1.5){
      player.pickups=(player.pickups||0)+1;
    }
  }
  const section=Math.floor(player.s/(length/4)),into=player.s-section*length/4;
  if(into>=46&&into<52&&Math.abs(player.lane-padLane(section))<1.65&&player.lastPad!==section){player.boost=1.7;player.lastPad=section;}
}

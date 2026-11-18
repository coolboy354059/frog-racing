'use strict';
const $ = id => document.getElementById(id);
const canvas = $('world'), ctx = canvas.getContext('2d');
import { carts, tracks, makeCircuit, drive, halfWidth, padLane, coinsPerLap, trackCoin } from './shared.mjs?v=garage-2';
import { walletSnapshot, buyCart, earnCoins } from './wallet.mjs';
const TAU=Math.PI*2,clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),wrap=(n,m)=>((n%m)+m)%m;
let circuit, track, points, length, locationAt, cart, racers=[], player, state='garage',last=0,clock=0,countdown=3,preview=0,boost=0;
let keys=new Set(),camera,focal,width,height,center,horizon;
function buildTrack(){track=tracks[$('track').selectedIndex];circuit=makeCircuit($('track').selectedIndex);({points,length,locationAt}=circuit);}
function populate(select,items){items.forEach(row=>select.add(new Option(row[0])));}
populate($('cart'),carts);populate($('track'),tracks);
let purchasing=false;
function garageBalance(){try{return walletSnapshot();}catch{return null;}}
function ownsChoice(){return $('cart').selectedIndex===0||garageBalance()?.owned.has($('cart').selectedIndex);}
function refreshGarage(){
  const wallet=garageBalance(),id=$('cart').selectedIndex,owned=id===0||wallet?.owned.has(id),price=carts[id][5];
  $('balance').textContent=wallet?'🪙 '+wallet.balance.toLocaleString()+' shared coins':'Coin wallet unavailable';
  for(let i=0;i<carts.length;i++){
    const unlocked=i===0||wallet?.owned.has(i);
    $('cart').options[i].textContent=carts[i][0]+(unlocked?'':' · '+carts[i][5]+' coins');
  }
  $('buy').hidden=owned;$('buy').disabled=purchasing||!wallet||wallet.balance<price||!navigator.locks;
  $('buy').textContent=wallet&&wallet.balance<price?'Need '+(price-wallet.balance)+' more coins':'Buy for '+price+' coins';
  $('start').disabled=!owned||purchasing;$('online').disabled=!owned||purchasing;
}
$('buy').onclick=async()=>{
  if(purchasing)return;
  const id=$('cart').selectedIndex;purchasing=true;refreshGarage();
  try{
    const bought=await buyCart(id,carts[id][5]);
    $('result').textContent=bought?carts[id][0]+' unlocked!':'You need more coins.';
  }catch{$('result').textContent='Purchase could not be saved. Check browser storage and try again.';}
  finally{purchasing=false;refreshGarage();}
};
addEventListener('storage',e=>{if(e.key===null||e.key==='frogJumperWalletCoins'||e.key==='frogRacingOwnedCarts')refreshGarage();});
let countedPickups=0,coinSaveFailed=false;
function creditPickups(total){
  if(total<=countedPickups)return;
  const amount=total-countedPickups;
  countedPickups=total;
  Promise.resolve().then(()=>earnCoins(amount)).then(refreshGarage).catch(()=>{coinSaveFailed=true;});
}
function rewardFinish(rank){
  const coins=rank===1?15:rank<=3?10:5;
  const result=$('result').textContent;
  Promise.resolve().then(()=>earnCoins(coins)).then(()=>{
    refreshGarage();if($('result').textContent===result)$('result').textContent+=' · +'+coins+' coins';
  }).catch(()=>{if($('result').textContent===result)$('result').textContent+=' · Reward could not be saved';});
}
function selectCart(){refreshGarage();cart=carts[$('cart').selectedIndex];$('spec').textContent=Math.round(cart[2]*3.6)+' km/h · '+(cart[4]>=11?'Quick steering':cart[2]>=41?'High top speed':'All-round handling');}
selectCart();buildTrack();
$('cart').onchange=selectCart;$('track').onchange=buildTrack;
function grid(){
  player={id:$('cart').selectedIndex,s:0,lane:0,v:0,boost:0,lastPad:-1};
  racers=Array.from({length:8},(_,i)=>(player.id+i+1)%carts.length).map((id,i)=>({id,s:4+Math.floor(i/2)*4.4,lane:i%2?2.4:-2.4,v:0}));
}
function start(){
  if(!connection&&!ownsChoice()){refreshGarage();return;}
  countedPickups=0;coinSaveFailed=false;
  $('online').hidden=true;grid();clock=0;countdown=3;boost=0;keys.clear();state='race';
  $('panel').hidden=true;$('hud').hidden=false;$('touch').hidden=false;$('pause').textContent='Pause';
}
function togglePause(){
  if(connection){return;}
  if(state!=='race'&&state!=='paused')return;
  state=state==='race'?'paused':'race';keys.clear();$('pause').textContent=state==='paused'?'Resume':'Pause';
  $('back').hidden=state!=='paused';$('start').hidden=state==='paused';$('setup').hidden=state==='paused';$('panel').hidden=state!=='paused';
  $('touch').hidden=state==='paused';
  $('result').textContent=state==='paused'?'Race paused':'';
}
function garage(){cancelChallenge();disconnect();$('room').hidden=true;$('online').hidden=false;state='garage';keys.clear();$('setup').hidden=false;$('panel').hidden=false;$('start').hidden=false;$('back').hidden=true;$('hud').hidden=true;$('touch').hidden=true;$('result').textContent='';$('start').textContent='Start race →';}
$('start').onclick=start;$('pause').onclick=togglePause;$('back').onclick=garage;
const driveKeys=['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d'];
addEventListener('keydown',e=>{const k=e.key.toLowerCase();if((state==='race'||state==='paused')&&k==='p'&&!e.repeat)togglePause();if(state==='race'&&driveKeys.includes(k)){e.preventDefault();keys.add(k);}});
addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
addEventListener('blur',()=>{keys.clear();if(connection)sendInput(true);else if(state==='race')togglePause();});
for(const b of document.querySelectorAll('[data-key]')){
  b.onpointerdown=e=>{b.setPointerCapture(e.pointerId);keys.add(b.dataset.key);};
  b.onlostpointercapture=()=>keys.delete(b.dataset.key);
}
const held=(a,b)=>keys.has(a)||keys.has(b);
const place=()=>1+(connection?departedFinishers:0)+racers.filter(r=>r.s>player.s).length;
const ordinal=p=>p+(['','st','nd','rd'][p]||'th');
function inputMask(){return Number(held('arrowup','w'))+2*held('arrowdown','s')+4*held('arrowleft','a')+8*held('arrowright','d');}
function step(dt){
  if(state==='garage'||state==='lobby'){preview+=dt*5;return;}
  if(state!=='race')return;
  if(connection){onlineStep(dt);return;}
  if(countdown>0){countdown-=dt;return;}
  clock+=dt;
  drive(player,circuit,inputMask(),dt);creditPickups(player.pickups||0);boost=player.boost;
  racers.forEach((r,i)=>{
    const target=31+i*.8+2*Math.sin(clock*.4+i);
    r.v=Math.min(target,r.v+dt*(10+i*.5));r.s+=r.v*dt;
    r.lane=(i%2?2.4:-2.4)+1.2*Math.sin(r.s*.024+i);
    if(Math.abs(r.s-player.s)<2.6&&Math.abs(r.lane-player.lane)<1.65&&player.v>r.v){
      player.v=r.v*.92;player.lane=clamp(player.lane+(player.lane>=r.lane?.35:-.35),-9,9);
    }
  });
  if(player.s>=3*length){
    $('online').hidden=false;state='finish';$('result').textContent='Finished '+ordinal(place())+' of 9 · '+clock.toFixed(1)+' seconds';rewardFinish(place());
    $('panel').hidden=false;$('setup').hidden=false;$('start').textContent='Race again →';$('back').hidden=false;$('hud').hidden=true;$('touch').hidden=true;
  }
}
// Transform world coordinates into a chase camera with a near clipping plane.
function view(p){const dx=p.x-camera.x,dz=p.z-camera.z;return [dx*camera.fz-dz*camera.fx,p.y-camera.y,dx*camera.fx+dz*camera.fz];}
function screen(p){return [center+p[0]*focal/p[2],horizon-p[1]*focal/p[2]];}
function polygon(coords,color){
  const verts=coords.map(view),out=[];
  for(let i=0;i<verts.length;i++){
    const a=verts[(i+verts.length-1)%verts.length],b=verts[i];
    if((a[2]>1)!==(b[2]>1)){const t=(1-a[2])/(b[2]-a[2]);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,1]);}
    if(b[2]>1)out.push(b);
  }
  if(out.length<3)return;ctx.beginPath();out.map(screen).forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=color;ctx.fill();
}
function billboard(p,draw){
  const v=view(p);if(v[2]<1.5)return;const [x,y]=screen(v),k=focal/v[2];
  ctx.save();ctx.translate(x,y);ctx.scale(k,k);draw();ctx.restore();
}
function ellipse(x,y,rx,ry,color){ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);ctx.fill();}
// Track-local coordinates use x across the road, y up and z along the circuit.
const modelCache=new Map();
function makeModel(build){
  const faces=[];
  function face(points,color,inside){
    const [a,b,c]=points,u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]);
    const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    const center=a.map((_,i)=>points.reduce((n,p)=>n+p[i],0)/points.length);
    const magnitude=Math.hypot(...normal);if(magnitude<.00001)return;
    const outward=normal.reduce((n,v,i)=>n+v*(center[i]-inside[i]),0)>=0?1:-1;
    faces.push({points,center,normal:normal.map(n=>n*outward/magnitude),rgb:parseInt(color.slice(1),16)});
  }
  function body(x,y,z,rings,color,n=8,axis='y'){
    const inside=[x,y,z];
    const rows=rings.map(([along,rx,rz])=>Array.from({length:n},(_,i)=>{
      const angle=(i+.5)*TAU/n,across=rx*Math.cos(angle),depth=rz*Math.sin(angle);
      return axis==='x'?[x+along,y+across,z+depth]:[x+across,y+along,z+depth];
    }));
    face(rows[0],color,inside);face(rows.at(-1),color,inside);
    for(let j=1;j<rows.length;j++)for(let i=0;i<n;i++){
      const k=(i+1)%n;face([rows[j-1][i],rows[j-1][k],rows[j][k],rows[j][i]],color,inside);
    }
  }
  function oval(x,y,z,w,h,d,color,n=8){
    body(x,y,z,[[-h,w*.33,d*.33],[-h*.48,w*.88,d*.88],[h*.22,w,d],[h*.78,w*.67,d*.67],[h,w*.26,d*.26]],color,n);
  }
  function box(x,y,z,w,h,d,color){
    body(x,y,z,[[-h,w*Math.SQRT2,d*Math.SQRT2],[h,w*Math.SQRT2,d*Math.SQRT2]],color,4);
  }
  build({body,oval,box});return faces;
}
function drawModel(p,faces){
  const dx=camera.x-p.x,dz=camera.z-p.z;
  const eyeX=dx*p.fz-dz*p.fx,eyeZ=dx*p.fx+dz*p.fz,eyeY=camera.y-p.y;
  const lightX=-.44*p.fz-.36*p.fx,lightZ=-.44*p.fx+.36*p.fz;
  const base=view(p),right=p.fz*camera.fz+p.fx*camera.fx,turn=p.fx*camera.fz-p.fz*camera.fx;
  if(base[2]<-8)return;
  const visible=[];
  for(const f of faces){
    const [x,y,z]=f.center,[nx,ny,nz]=f.normal;
    if(nx*(eyeX-x)+ny*(eyeY-y)+nz*(eyeZ-z)<=0)continue;
    visible.push([base[2]-x*turn+z*right,f,Math.max(.52,.71+.34*(nx*lightX+ny*.82+nz*lightZ))]);
  }
  visible.sort((a,b)=>b[0]-a[0]);
  for(const [,f,light] of visible){
    const rgb=f.rgb;
    const shade=v=>Math.min(255,Math.round(v*light));
    const color='rgb('+shade(rgb>>16)+','+shade((rgb>>8)&255)+','+shade(rgb&255)+')';
    ctx.beginPath();let clipped=false;
    for(let i=0;i<f.points.length;i++){
      const [x,y,z]=f.points[i],depth=base[2]-x*turn+z*right;
      if(depth<1){clipped=true;break;}
      const k=focal/depth,sx=center+(base[0]+x*right+z*turn)*k,sy=horizon-(base[1]+y)*k;
      if(i)ctx.lineTo(sx,sy);else ctx.moveTo(sx,sy);
    }
    if(clipped){polygon(f.points.map(([x,y,z])=>({x:p.x+x*p.fz+z*p.fx,y:p.y+y,z:p.z-x*p.fx+z*p.fz})),color);continue;}
    ctx.closePath();ctx.fillStyle=color;ctx.fill();
  }
}
function cartModel(id){
  const key='kart'+id;if(modelCache.has(key))return modelCache.get(key);
  const color=carts[id][1];
  const mesh=makeModel(({body,oval,box})=>{
    for(const side of [-1,1])for(const axle of [-.85,.88]){
      body(side,.43,axle,[[-.23,.36,.36],[-.16,.45,.45],[.16,.45,.45],[.23,.36,.36]],'#29353e',8,'x');
      body(side*1.235,.43,axle,[[-.018,.22,.22],[.018,.22,.22]],'#b8c6bf',8,'x');
    }
    body(0,.57,0,[[-.25,.94,1.46],[.09,1.14,1.61],[.33,.88,1.33]],color);
    box(0,.90,.90,.78,.045,.30,color);box(0,.96,.90,.14,.022,.30,'#fff3c9');
    box(0,1,-1.06,.49,.19,.09,'#293a40');box(0,1.22,-1.12,1.06,.07,.23,color);
    for(const side of [-1,1])box(side*.57,.66,-1.39,.15,.07,.04,'#ff9d70');
    oval(0,1.14,0,.55,.57,.47,'#449d50');
    oval(0,1.77,0,.75,.45,.57,'#78d567');
    for(const side of [-1,1]){
      oval(side*.43,2.06,.10,.26,.29,.25,'#8cde70');
      oval(side*.45,2.12,.25,.18,.18,.16,'#fff5ce');
      oval(side*.46,2.14,.365,.095,.12,.075,'#273e37',6);
      oval(side*.48,1.16,.30,.14,.15,.43,'#71c65c',6);
    }
    if(id===9)oval(0,.80,-.89,.86,.27,.44,'#88532d');
    if(id===10)for(const side of [-1,1])oval(side*1.07,.85,.2,.50,.07,.64,'#a5ebdb');
    if(id===11)box(0,1.12,.88,.36,.17,.2,'#ffdb65');
    if(id===12)for(const side of [-1,1])box(side*1.01,.19,0,.13,.09,1.55,'#b6ebff');
    if(id===13)for(const side of [-1,1])box(side*.82,.91,-.80,.15,.32,.45,'#ffab37');
    if(id===14)oval(0,.81,0,1.43,.10,1.50,'#ffda8f');
  });modelCache.set(key,mesh);return mesh;
}
function kart(r){
  const p=locationAt(r.s,r.lane);
  polygon([[-1.25,-1.39],[1.25,-1.39],[1.25,1.39],[-1.25,1.39]].map(([x,z])=>({
    x:p.x+x*p.fz+z*p.fx,y:p.y+.015,z:p.z-x*p.fx+z*p.fz
  })),'rgba(30,45,40,.32)');
  drawModel(p,cartModel(r.id));
}
function scenery(s,i){
  const lane=(i%2?1:-1)*(10+(i*17)%15),p=locationAt(s,lane);
  const venue=tracks.indexOf(track),variant=i%4,key='scenery'+venue+'/'+variant;
  if(!modelCache.has(key))modelCache.set(key,makeModel(({body,oval,box})=>{
    if(venue===1){
      if(variant===0){oval(0,1.55,0,3.2,2.1,2.4,'#bf754e',6);return;}
      oval(0,2.25,0,.58,2.45,.61,'#529255',7);
      for(const side of [-1,1]){box(side*.72,1.8+side*.4,0,.54,.24,.26,'#4c8952');oval(side*1.15,2.42+side*.4,0,.28,.71,.32,'#69a65d',6);}
    }else if(venue===0&&variant%2===0){
      oval(0,.05,0,3.3,.13,2.5,'#54a5ac');oval(0,.25,0,1.4,.13,1.12,'#78bb62');
      for(let k=0;k<5;k++)oval(Math.cos(k*TAU/5)*.48,.58,Math.sin(k*TAU/5)*.48,.41,.39,.37,'#ffb3cb',6);
      oval(0,.77,0,.35,.32,.34,'#ffcf65',6);
    }else if(venue===3&&variant%2===0){
      for(const side of [-1,1]){box(side*.84,1.3,0,.07,1.35,.09,'#8b955c');oval(side*.84,2.48,0,.19,.52,.19,'#996d47',6);}
      oval(0,2.9,.3,.23,.24,.21,'#ffe185',6);
    }else{
      box(0,1,0,.32,1,.32,'#78563f');
      for(let k=0;k<3;k++){const radius=2.4-.47*k;
        body(0,2.9+k*1.30,0,[[-1.46,radius,radius],[1.5,.07,.07]],venue===4&&k>0?'#eef9ff':k===1?'#508d65':'#39765b',7);}
    }
  }));
  drawModel(p,modelCache.get(key));
}
function strip(s,e,l,r,c){polygon([locationAt(s,l),locationAt(e,l),locationAt(e,r),locationAt(s,r)],c);}
function paint(){
  width=canvas.clientWidth;height=canvas.clientHeight;
  const ratio=Math.min(devicePixelRatio||1,1.5),w=Math.round(width*ratio),h=Math.round(height*ratio);
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  ctx.setTransform(ratio,0,0,ratio,0,0);
  const demo=state==='garage'||state==='lobby'||state==='finish';
  const subject=demo?{id:$('cart').selectedIndex,s:preview,lane:0}:player;
  const p=locationAt(subject.s,subject.lane*.68);
  const ahead=locationAt(subject.s+7),behind=locationAt(subject.s-4);
  const heading=Math.atan2(ahead.x-behind.x,ahead.z-behind.z);
  const yaw=heading+(demo?.54+.10*Math.sin(preview*.045):0);
  const fx=Math.sin(yaw),fz=Math.cos(yaw),back=demo?6.7:8.5;
  camera={x:p.x-fx*back,y:p.y+(demo?3.05:3.65),z:p.z-fz*back,fx,fz};
  center=width*(demo&&width>680?.69:.5);horizon=height*.34;focal=Math.min(width*.9,height*.98);
  const sky=ctx.createLinearGradient(0,0,0,horizon+30);sky.addColorStop(0,track[6]);sky.addColorStop(1,track===tracks[3]?'#aa82a6':'#fff1c9');
  ctx.fillStyle=sky;ctx.fillRect(0,0,width,height);
  ellipse(width*.8,height*.14,height*.055,height*.055,track===tracks[3]?'#fff6d8':'#ffeba2');
  for(let j=0;j<2;j++){
    ctx.beginPath();ctx.moveTo(0,height);
    for(let x=0;x<=width+6;x+=6){const angle=x/height+Math.atan2(camera.fx,camera.fz);ctx.lineTo(x,horizon-height*(.05+.045*Math.sin(angle*6+j)+.025*Math.cos(angle*11-j)) +j*height*.04);}
    ctx.lineTo(width,height);ctx.fillStyle=j?track[8]:track[9];ctx.fill();
  }
  const span=4,base=Math.floor(subject.s/span)*span,objects=[];
  const group=demo?[subject]:[player,...racers];
  if(!demo){
    const spacing=length/coinsPerLap;
    const first=Math.max(0,Math.floor(subject.s/spacing-.5)+1);
    for(let i=first;i<3*coinsPerLap;i++){
      const coin=trackCoin(i,length);if(coin.s>base+140)break;
      objects.push({s:coin.s-.3,draw:()=>{
        if(!modelCache.has('coin'))modelCache.set('coin',makeModel(({body})=>{
          body(0,0,0,[[-.105,.46,.46],[-.06,.52,.52],[.06,.52,.52],[.105,.46,.46]],'#ffbf29',12,'x');
          for(const side of [-1,1])body(side*.11,0,0,[[-.012,.31,.31],[.012,.31,.31]],'#ffe885',8,'x');
        }));
        const p=locationAt(coin.s,coin.lane),angle=clock*2.7+i;
        p.y+=1.25+.1*Math.sin(angle);p.fx=Math.sin(angle);p.fz=Math.cos(angle);
        drawModel(p,modelCache.get('coin'));
      }});
    }
  }
  for(const r of group){let ahead=wrap(r.s-subject.s+10,length)-10;if(ahead<145)objects.push({s:subject.s+ahead-1.65,draw:()=>kart(r)});}
  for(let s=base+140;s>=base-12;s-=span){
    const i=Math.floor(wrap(s,length)/span),e=s+span;
    strip(s,e,-45,45,track[7]);strip(s,e,-7,7,i%4<2?'#ff815f':'#fff1ce');
    strip(s,e,-halfWidth,halfWidth,i%2?'#46515a':'#48545c');
    if(i%4===0)strip(s,e,-.07,.07,'#dfdfbc');
    const sec=Math.floor(s/(length/4)),pad=sec*length/4+46;
    if(s<pad+6&&e>pad)strip(Math.max(s,pad),Math.min(e,pad+6),padLane(sec)-1.65,padLane(sec)+1.65,'#ffcf39');
    if(Math.floor(s/length)!==Math.floor(e/length) ){const line=Math.ceil(s/length)*length;for(let k=0;k<12;k++)strip(line,line+.9,-6+k,-5+k,k%2?'#183a37':'#fff7d6');}
    if(i%3===0)scenery(s,i);
    objects.filter(o=>o.s>=s&&o.s<e).sort((a,b)=>b.s-a.s).forEach(o=>o.draw());
  }
  $('msg').hidden=state!=='race'||(countdown<=0&&boost<=0);
  if(!$('msg').hidden)$('msg').textContent=countdown>0?Math.ceil(countdown):'BOOST!';
  if(state==='race')drawMap(subject,group);
  if(state==='race')$('stats').textContent=ordinal(place())+' / '+(connection?fieldSize:9)+'   ·   Lap '+clamp(Math.floor(player.s/length)+1,1,3)+' / 3   ·   '+Math.round(player.v*3.6)+' km/h   ·   🪙 '+countedPickups+(coinSaveFailed?' (save failed)':'');
}
function frame(now){const dt=Math.min((now-last)/1000,.2);last=now;for(let left=dt;left>0;left-=1/60)step(Math.min(left,1/60));paint();requestAnimationFrame(frame);}
requestAnimationFrame(frame);

function drawMap(subject,group){
  if(height<350||width<350)return;
  const size=Math.min(width*.21,height*.24,138),scale=size/370;
  ctx.save();ctx.translate(width-size/2-14,80+size/2);
  ctx.fillStyle='#102e29d9';ctx.beginPath();ctx.roundRect(-size/2,-size/2,size,size,12);ctx.fill();
  ctx.scale(scale,scale);ctx.strokeStyle='#bdd2ba';ctx.lineWidth=5;ctx.beginPath();
  points.forEach((p,i)=>i?ctx.lineTo(p.x,p.z):ctx.moveTo(p.x,p.z));ctx.stroke();
  for(const car of [...group.filter(r=>r!==subject),subject]){
    const p=locationAt(car.s);ellipse(p.x,p.z,car===subject?12:7,car===subject?12:7,car===subject?'#f8ff97':carts[car.id][1]);
  }
  ctx.restore();
}
let connection=null,uid=0,departedFinishers=0,fieldSize=0,lastSent=-1,lastSend=0,targets=new Map();
function disconnect(){
  const old=connection;connection=null;targets.clear();if(old)old.close();
}
function lobby(){
  if(!ownsChoice()){garage();return;}
  garage();state='lobby';$('setup').hidden=true;$('start').hidden=true;$('online').hidden=true;
  $('back').hidden=false;$('room').hidden=false;$('entry').hidden=false;$('roomcode').textContent='';
  $('launch').hidden=true;$('roomInfo').textContent='Create a room on your selected circuit, or join a friend.';
}
let challengeVersion=0,widgetId=null,libraryPromise=null;
function cancelChallenge(){
  challengeVersion++;
  if(widgetId!==null){window.turnstile.remove(widgetId);widgetId=null;}
  $('create').disabled=false;$('join').disabled=false;
}
function turnstileLibrary(){
  if(window.turnstile?.render)return Promise.resolve(window.turnstile);
  if(libraryPromise)return libraryPromise;
  libraryPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    const timer=setTimeout(failed,12000);
    function failed(){
      clearTimeout(timer);script.remove();libraryPromise=null;
      reject(new Error('Verification could not load'));
    }
    script.onload=()=>{clearTimeout(timer);window.turnstile?resolve(window.turnstile):failed();};
    script.onerror=failed;
    script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    document.head.append(script);
  });
  return libraryPromise;
}
async function connect(create){
  const code=$('code').value.trim().toUpperCase();
  if(!create&&!/^[A-HJ-NP-Z2-9]{6}$/.test(code)){$('roomInfo').textContent='Enter the six-letter or number code from your friend.';return;}
  cancelChallenge();
  const version=challengeVersion;
  $('create').disabled=true;$('join').disabled=true;
  $('roomInfo').textContent='Checking with Cloudflare…';
  function retry(){
    if(version!==challengeVersion)return;
    cancelChallenge();$('roomInfo').textContent='Verification could not finish. Select Create room or Join room to try again.';
  }
  try{
    const api=await turnstileLibrary();
    if(version!==challengeVersion)return;
    widgetId=api.render($('challenge'),{
      sitekey:'0x4AAAAAAGG-wlrhggplLItg',action:'race_room',size:'flexible',
      callback:token=>{
        if(version!==challengeVersion)return;
        cancelChallenge();openRoom(create,code,token);
      },
      'expired-callback':retry,'timeout-callback':retry,'error-callback':retry
    });
  }catch{retry();}
}
function openRoom(create,code,token){
  disconnect();$('entry').hidden=true;$('roomInfo').textContent='Connecting…';
  const path=create?'create':'room/'+code;
  const ws=new WebSocket('wss://frog-racing-rooms.teodorc2000.workers.dev/'+path+'?catalog=2&track='+$('track').selectedIndex+'&cart='+$('cart').selectedIndex,['frog-racing','proof.'+btoa(token).replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_')]);
  connection=ws;const timeout=setTimeout(()=>{if(connection===ws&&ws.readyState!==1)ws.close();},12000);
  ws.onmessage=e=>{
    if(connection!==ws)return;
    const msg=JSON.parse(e.data);
    if(msg.type==='welcome'){
      clearTimeout(timeout);uid=msg.uid;$('track').selectedIndex=msg.track;buildTrack();
      $('roomcode').textContent=msg.code;
    }else if(msg.type==='lobby'){
      $('roomInfo').textContent=track[0]+' · '+msg.count+' / 9 racers. '+(msg.count<2?'Share the code with a friend.':uid===msg.host?'Ready when you are!':'Waiting for the host to start.');
      $('launch').hidden=uid!==msg.host||msg.count<2;
    }else if(msg.type==='start'){
      start();departedFinishers=0;fieldSize=msg.total;racers=[];targets.clear();lastSend=0;lastSent=-1;
      $('room').hidden=true;$('pause').textContent='Leave race';
    }else if(msg.type==='frame'){
      departedFinishers=msg.departedFinishers||0;clock=Math.max(0,msg.time);countdown=Math.max(0,-msg.time);targets=new Map(msg.cars.map(r=>[r.uid,r]));
      const mine=targets.get(uid);if(!mine)return;
      if(player.uid!==uid)player={...mine};
      const previous=new Map(racers.map(r=>[r.uid,r]));
      racers=msg.cars.filter(r=>r.uid!==uid).map(r=>previous.get(r.uid)||{...r});
      creditPickups(mine.pickups||0);boost=mine.boost;
      if(mine.rank){garage();$('result').textContent='Finished '+ordinal(mine.rank)+' of '+fieldSize+' · '+mine.time.toFixed(1)+' seconds';rewardFinish(mine.rank);}
    }
  };
  ws.onclose=e=>{
    clearTimeout(timeout);if(connection!==ws)return;connection=null;
    if(state==='lobby'){lobby();$('roomInfo').textContent=e.reason||'Could not enter the room. Check the code and try again.';}
    else{garage();$('result').textContent=e.reason||'Connection lost. Return to Race with friends to make a new room.';}
  };
}
function sendInput(force=false){
  if(connection?.readyState!==1||state!=='race')return;
  const mask=inputMask(),now=performance.now();
  if(force||mask!==lastSent||now-lastSend>350){connection.send(String(mask));lastSent=mask;lastSend=now;}
}
function onlineStep(dt){
  sendInput();const blend=1-Math.exp(-dt*24);
  for(const r of [player,...racers]){
    const target=targets.get(r.uid);if(!target)continue;
    r.s+=(target.s-r.s)*blend;r.lane+=(target.lane-r.lane)*blend;r.v=target.v;
  }
}
$('online').onclick=lobby;$('create').onclick=()=>connect(true);$('join').onclick=()=>connect(false);
$('launch').onclick=()=>{if(connection?.readyState===1)connection.send('start');};
$('pause').onclick=()=>connection?garage():togglePause();

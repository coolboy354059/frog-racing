'use strict';
const $ = id => document.getElementById(id);
const canvas = $('world'), ctx = canvas.getContext('2d');
import { carts, tracks, makeCircuit, drive, halfWidth, padLane } from './shared.mjs';
const TAU=Math.PI*2,clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),wrap=(n,m)=>((n%m)+m)%m;
let circuit, track, points, length, locationAt, cart, racers=[], player, state='garage',last=0,clock=0,countdown=3,preview=0,boost=0;
let keys=new Set(),camera,focal,width,height,center,horizon;
function buildTrack(){track=tracks[$('track').selectedIndex];circuit=makeCircuit($('track').selectedIndex);({points,length,locationAt}=circuit);}
function populate(select,items){items.forEach(row=>select.add(new Option(row[0])));}
populate($('cart'),carts);populate($('track'),tracks);
function selectCart(){cart=carts[$('cart').selectedIndex];$('spec').textContent=Math.round(cart[2]*3.6)+' km/h · '+(cart[4]>=11?'Quick steering':cart[2]>=41?'High top speed':'All-round handling');}
selectCart();buildTrack();
$('cart').onchange=selectCart;$('track').onchange=buildTrack;
function grid(){
  player={id:$('cart').selectedIndex,s:0,lane:0,v:0,boost:0,lastPad:-1};
  racers=carts.map((_,id)=>id).filter(id=>id!==player.id).map((id,i)=>({id,s:4+Math.floor(i/2)*4.4,lane:i%2?2.4:-2.4,v:0}));
}
function start(){
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
  drive(player,circuit,inputMask(),dt);boost=player.boost;
  racers.forEach((r,i)=>{
    const target=31+i*.8+2*Math.sin(clock*.4+i);
    r.v=Math.min(target,r.v+dt*(10+i*.5));r.s+=r.v*dt;
    r.lane=(i%2?2.4:-2.4)+1.2*Math.sin(r.s*.024+i);
    if(Math.abs(r.s-player.s)<2.6&&Math.abs(r.lane-player.lane)<1.65&&player.v>r.v){
      player.v=r.v*.92;player.lane=clamp(player.lane+(player.lane>=r.lane?.35:-.35),-9,9);
    }
  });
  if(player.s>=3*length){
    $('online').hidden=false;state='finish';$('result').textContent='Finished '+ordinal(place())+' of 9 · '+clock.toFixed(1)+' seconds';
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
function kart(r){
  const p=locationAt(r.s,r.lane),color=carts[r.id][1];
  // Build the chassis and spoiler in track-local 3D coordinates.
  function corner(x,y,z){return {x:p.x+p.fz*x+p.fx*z,y:p.y+y,z:p.z-p.fx*x+p.fz*z};}
  function block(x,y,z,w,h,d,paint){
    const corners=[[-w,-d],[w,-d],[w,d],[-w,d]].map(([dx,dz])=>corner(x+dx,y,z+dz));
    const top=corners.map(v=>({...v,y:v.y+h}));
    const faces=corners.map((v,i)=>{const j=(i+1)%4;return [v,corners[j],top[j],top[i]];});
    faces.sort((a,b)=>view(b[0])[2]-view(a[0])[2]);faces.forEach(face=>polygon(face,paint));polygon(top,paint);
  }
  billboard(p,()=>ellipse(0,-.02,1.35,.25,'#354442'));
  for(const x of [-1,1])for(const z of [-.85,.85])block(x,.09,z,.22,.63,.42,'#253436');
  block(0,.38,0,.96,.5,1.35,color);block(0,.89,.77,.19,.04,.49,'#fff6d8');
  billboard(corner(0,.83,.04),()=>{
    ellipse(0,-.35,.62,.53,'#409655');ellipse(0,-.99,.77,.54,'#6acb64');
    for(const x of [-.45,.45]){ellipse(x,-1.36,.29,.32,'#81d76d');ellipse(x,-1.47,.17,.14,'#fbf8cd');ellipse(x,-1.48,.08,.10,'#253830');}
    ellipse(0,-.89,.48,.11,'#a4df84');
  });
  block(0,.9,-1.02,.57,.25,.12,'#233f40');
  block(0,1.15,-1.08,1.12+(r.id%3)*.09,.10,.24,color);
}
function scenery(s,i){
  const lane=(i%2?1:-1)*(10+((i*17)%15)),p=locationAt(s,lane);
  billboard(p,()=>{
    if(track===tracks[0]||track===tracks[3]){ellipse(0,0,3.4,.64,'#559f9e');ellipse(-.7,-.12,1,.23,'#83c871');}
    if(track===tracks[2]||track===tracks[4]||i%9===0){
      ctx.fillStyle='#695548';ctx.fillRect(-.22,-3,.44,3);
      for(let j=0;j<2;j++){ctx.fillStyle=j?track[8]:track[9];ctx.beginPath();ctx.moveTo(0,-6-j);ctx.lineTo(2.1-j*.4,-1-j*2);ctx.lineTo(-2.1+j*.4,-1-j*2);ctx.fill();}
    }else{ctx.font='3.5px system-ui';ctx.textAlign='center';ctx.fillText(track[10],0,0);}
  });
}
function strip(s,e,l,r,c){polygon([locationAt(s,l),locationAt(e,l),locationAt(e,r),locationAt(s,r)],c);}
function paint(){
  width=canvas.clientWidth;height=canvas.clientHeight;
  const ratio=Math.min(devicePixelRatio||1,1.5),w=Math.round(width*ratio),h=Math.round(height*ratio);
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  ctx.setTransform(ratio,0,0,ratio,0,0);
  const demo=state==='garage'||state==='lobby'||state==='finish';
  const subject=demo?{id:$('cart').selectedIndex,s:preview,lane:0}:player;
  const p=locationAt(subject.s,subject.lane*.6),dir=locationAt(subject.s+3);
  const back=demo?6.8:8.5;
  camera={x:p.x-dir.fx*back,y:p.y+(demo?2.8:3.4),z:p.z-dir.fz*back,fx:dir.fx,fz:dir.fz};
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
  if(state==='race')$('stats').textContent=ordinal(place())+' / '+(connection?fieldSize:9)+'   ·   Lap '+clamp(Math.floor(player.s/length)+1,1,3)+' / 3   ·   '+Math.round(player.v*3.6)+' km/h';
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
  const ws=new WebSocket('wss://frog-racing-rooms.teodorc2000.workers.dev/'+path+'?track='+$('track').selectedIndex+'&cart='+$('cart').selectedIndex,['frog-racing','proof.'+btoa(token).replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_')]);
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
      boost=mine.boost;
      if(mine.rank){garage();$('result').textContent='Finished '+ordinal(mine.rank)+' of '+fieldSize+' · '+mine.time.toFixed(1)+' seconds';}
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

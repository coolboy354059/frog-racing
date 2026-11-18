import { makeCircuit, drive } from './shared.mjs';
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const origin='https://coolboy354059.github.io';
async function checkAdmission(req,secret){
  if(!secret)return false;
  const protocols=(req.headers.get('Sec-WebSocket-Protocol')||'').split(',').map(p=>p.trim());
  if(!protocols.includes('frog-racing'))return false;
  const proof=protocols.find(p=>p.startsWith('proof.'))?.slice(6);
  if(!proof||proof.length>2731||!/^[A-Za-z0-9_-]+$/.test(proof))return false;
  try{
    const token=atob(proof.replace(/-/g,'+').replace(/_/g,'/'));
    const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
      method:'POST',body:new URLSearchParams({secret,response:token}),signal:AbortSignal.timeout(8000)
    });
    if(!response.ok)return false;
    const result=await response.json();
    return result.success===true&&result.hostname===new URL(origin).hostname&&result.action==='race_room';
  }catch{return false;}
}
export default {
  async fetch(req, env){
    const url=new URL(req.url), path=url.pathname;
    if(path==='/health')return Response.json({game:'Frog Racing',protocol:1});
    if(req.headers.get('Upgrade')?.toLowerCase()!=='websocket'||req.headers.get('Origin')!==origin)return new Response('Game connection required',{status:403});
    const create=path==='/create';
    if(!create&&!/^\/room\/[A-HJ-NP-Z2-9]{6}$/.test(path))return new Response('Unknown room',{status:404});
    if(!await checkAdmission(req,env.TURNSTILE_SECRET))return new Response('Room verification required',{status:403});
    const code=create?Array.from(crypto.getRandomValues(new Uint8Array(6)),n=>alphabet[n%32]).join(''):path.slice(6);
    url.searchParams.set('code',code);
    const roomRequest=new Request(url,req);
    roomRequest.headers.set('Sec-WebSocket-Protocol','frog-racing');
    return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(roomRequest);
  }
};
export class RaceRoom{
  constructor(){this.members=new Map();this.phase='empty';this.next=0;this.host=null;this.tickTimer=null;this.expiry=null;}
  fetch(req){
    const url=new URL(req.url),create=url.pathname==='/create';
    if(create&&this.phase==='empty'){
      this.phase='lobby';this.code=url.searchParams.get('code');this.track=this.index(url,'track',5);
      this.circuit=makeCircuit(this.track);this.expiry=setTimeout(()=>this.end('Room expired'),10*60*1000);
    }else if(create||this.phase!=='lobby'||this.members.size>=9)return new Response('Room unavailable',{status:409});
    const [client,socket]=Object.values(new WebSocketPair());socket.accept();
    const uid=++this.next,car={uid,id:this.index(url,'cart',9),s:0,lane:0,v:0,boost:0,lastPad:-1,rank:0};
    if(!this.members.size)this.host=uid;
    this.members.set(uid,{socket,car,mask:0,stamp:0});
    socket.addEventListener('message',e=>this.message(uid,e.data));
    const leave=()=>this.leave(uid);
    socket.addEventListener('close',leave);socket.addEventListener('error',leave);
    socket.send(JSON.stringify({type:'welcome',uid,code:this.code,track:this.track}));this.lobby();
    return new Response(null,{status:101,webSocket:client,headers:{'Sec-WebSocket-Protocol':'frog-racing'}});
  }
  index(url,key,max){const n=Number(url.searchParams.get(key));return Number.isInteger(n)&&n>=0&&n<max?n:0;}
  send(packet){const data=JSON.stringify(packet);for(const m of this.members.values()){try{m.socket.send(data);}catch{}}}
  lobby(){this.send({type:'lobby',host:this.host,count:this.members.size});}
  message(uid,data){
    const m=this.members.get(uid);if(!m||typeof data!=='string'||data.length>80)return;
    if(data==='start'&&this.phase==='lobby'&&uid===this.host&&this.members.size>=2){
      this.phase='race';this.elapsed=-3;this.finishers=0;this.total=this.members.size;
      let i=0;for(const entry of this.members.values()){entry.car.lane=(i++-(this.total-1)/2)*Math.min(2.4,10/this.total);}
      this.send({type:'start',total:this.total});this.last=Date.now();this.snapshot();
      this.tickTimer=setInterval(()=>this.tick(),80);return;
    }
    if(this.phase==='race'&&/^([0-9]|1[0-5])$/.test(data)){m.mask=Number(data);m.stamp=Date.now();}
  }
  tick(){
    const now=Date.now(),dt=Math.min(.25,(now-this.last)/1000);this.last=now;
    const before=this.elapsed;this.elapsed+=dt;
    const active=Math.max(0,this.elapsed)-Math.max(0,before),finish=[];
    for(const m of this.members.values()){
      const car=m.car;if(car.rank||active<=0)continue;
      const prev=car.s,mask=now-m.stamp<1100?m.mask:0;
      for(let t=0;t<active;t+=.025)drive(car,this.circuit,mask,Math.min(.025,active-t));
      const line=this.circuit.length*3;
      if(car.s>=line){car.time=Math.max(0,before)+active*(line-prev)/(car.s-prev);car.s=line;car.v=0;finish.push(car);}
    }
    finish.sort((a,b)=>a.time-b.time).forEach(car=>car.rank=++this.finishers);
    this.snapshot();
    if([...this.members.values()].every(m=>m.car.rank))this.end('Race complete');
  }
  snapshot(){this.send({type:'frame',time:this.elapsed,departedFinishers:this.finishers-[...this.members.values()].filter(m=>m.car.rank).length,cars:[...this.members.values()].map(m=>m.car)});}
  leave(uid){
    if(!this.members.delete(uid))return;
    if(!this.members.size){this.end('Room closed');return;}
    if(this.phase==='lobby'){if(uid===this.host)this.host=this.members.keys().next().value;this.lobby();}
    else if(this.phase==='race')this.snapshot();
  }
  end(reason){
    clearInterval(this.tickTimer);clearTimeout(this.expiry);
    const clients=[...this.members.values()];this.members.clear();this.phase='empty';
    for(const m of clients){try{m.socket.close(1000,reason);}catch{}}
  }
}

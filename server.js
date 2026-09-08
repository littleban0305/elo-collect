const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const DB_FILE = path.join(ROOT, 'data.json');
const PORT = Number(process.env.PORT || 3000);
const SESSION_COOKIE = 'elo_session';

const initialItems = [
  {id:1,name:'AK-47 | Slate',category:'Rifle',value:520,stock:10,img:'https://placehold.co/640x480/png?text=AK-47+Slate',status:'AVAILABLE'},
  {id:2,name:'USP-S | Cortex',category:'Pistol',value:460,stock:12,img:'https://placehold.co/640x480/png?text=USP-S+Cortex',status:'AVAILABLE'},
  {id:3,name:'M4A1-S | Basilisk',category:'Rifle',value:380,stock:15,img:'https://placehold.co/640x480/png?text=M4A1-S+Basilisk',status:'AVAILABLE'},
  {id:4,name:'AWP | Atheris',category:'Sniper',value:350,stock:18,img:'https://placehold.co/640x480/png?text=AWP+Atheris',status:'AVAILABLE'}
];

function initialDb(){
  return {
    version:3,
    users:[
      {id:'u_demo',username:'elo_demo',displayName:'ELO Demo',credits:1000,createdAt:new Date().toISOString(),role:'USER'},
      {id:'u_alice',username:'alice',displayName:'Alice',credits:720,createdAt:new Date().toISOString(),role:'USER'}
    ],
    items:structuredClone(initialItems),
    holdings:[],
    ledger:[],
    transactions:[]
  };
}
function loadDb(){
  if(!fs.existsSync(DB_FILE)){const db=initialDb();saveDb(db);return db;}
  try{
    const db=JSON.parse(fs.readFileSync(DB_FILE,'utf8'));
    if(!Array.isArray(db.users)) throw new Error('legacy');
    return db;
  }catch{
    const db=initialDb();saveDb(db);return db;
  }
}
function saveDb(db){ fs.writeFileSync(DB_FILE,JSON.stringify(db,null,2)); }
function json(res,status,payload){
  const body=JSON.stringify(payload);
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(body);
}
function readBody(req){
  return new Promise((resolve,reject)=>{
    let raw='';
    req.on('data',chunk=>{raw+=chunk;if(raw.length>1e6){req.destroy();reject(new Error('Payload too large'));}});
    req.on('end',()=>{try{resolve(raw?JSON.parse(raw):{})}catch(e){reject(new Error('Invalid JSON'))}});
    req.on('error',reject);
  });
}
function ref(prefix){return `${prefix}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;}
function parseCookies(req){
  const out={};
  const header=req.headers.cookie||'';
  for(const part of header.split(';')){
    const i=part.indexOf('=');if(i<0)continue;
    out[part.slice(0,i).trim()]=decodeURIComponent(part.slice(i+1).trim());
  }
  return out;
}
function session(req){
  const id=parseCookies(req)[SESSION_COOKIE];
  if(!id)return null;
  return db.sessions?.[id] || null;
}
function setSession(res,userId){
  const id=crypto.randomUUID();
  db.sessions ||= {};
  db.sessions[id]={userId,createdAt:Date.now()};
  saveDb(db);
  res.setHeader('Set-Cookie',`${SESSION_COOKIE}=${encodeURIComponent(id)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800`);
}
function publicState(userId){
  const user=db.users.find(u=>u.id===userId);
  if(!user)throw new Error('User not found');
  return {
    user:{id:user.id,username:user.username,displayName:user.displayName,role:user.role},
    credits:user.credits,
    items:db.items,
    holdings:db.holdings.filter(h=>h.userId===userId),
    ledger:db.ledger.filter(x=>x.userId===userId),
    transactions:db.transactions.filter(x=>x.userId===userId).slice(-50).reverse()
  };
}
function requireUser(req,res){
  const s=session(req);
  if(!s){json(res,401,{ok:false,error:'請先登入 Demo 帳號'});return null;}
  const user=db.users.find(u=>u.id===s.userId);
  if(!user){json(res,401,{ok:false,error:'登入狀態已失效'});return null;}
  return user;
}

let db=loadDb();
db.sessions ||= {};
saveDb(db);

async function api(req,res,url){
  try{
    if(req.method==='POST'&&url.pathname==='/api/auth/dev-login'){
      const input=await readBody(req);
      const user=db.users.find(u=>u.id===String(input.userId||'')) || db.users[0];
      setSession(res,user.id);
      return json(res,200,{ok:true,message:`已登入 ${user.displayName}`,state:publicState(user.id),users:db.users.map(u=>({id:u.id,username:u.username,displayName:u.displayName}))});
    }
    if(req.method==='POST'&&url.pathname==='/api/auth/logout'){
      const id=parseCookies(req)[SESSION_COOKIE];
      if(id&&db.sessions)delete db.sessions[id];
      saveDb(db);
      res.setHeader('Set-Cookie',`${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
      return json(res,200,{ok:true});
    }
    if(req.method==='GET'&&url.pathname==='/api/auth/users'){
      return json(res,200,{ok:true,users:db.users.map(u=>({id:u.id,username:u.username,displayName:u.displayName}))});
    }
    if(req.method==='GET'&&url.pathname==='/api/state'){
      const user=requireUser(req,res);if(!user)return;
      return json(res,200,publicState(user.id));
    }
    if(req.method==='POST'&&url.pathname==='/api/credits/grant'){
      const user=requireUser(req,res);if(!user)return;
      const amount=500;user.credits+=amount;
      const r=ref('DEV');db.ledger.push({userId:user.id,kind:'開發模式加值',amount,balance:user.credits,ref:r,createdAt:new Date().toISOString()});
      db.transactions.push({id:crypto.randomUUID(),userId:user.id,type:'CREDIT_GRANT',status:'COMPLETED',amount,ref:r,createdAt:new Date().toISOString()});
      saveDb(db);return json(res,200,{ok:true,message:'已增加 500 Credits（僅 Demo）',state:publicState(user.id)});
    }
    if(req.method==='POST'&&url.pathname==='/api/redeem'){
      const user=requireUser(req,res);if(!user)return;
      const input=await readBody(req);const id=Number(input.itemId);
      const item=db.items.find(x=>x.id===id);
      if(!item)return json(res,404,{ok:false,error:'找不到收藏品'});
      if(item.stock<=0)return json(res,409,{ok:false,error:'目前沒有庫存'});
      if(user.credits<item.value)return json(res,409,{ok:false,error:'Credits 不足'});
      const now=new Date().toISOString();
      user.credits-=item.value;item.stock--;
      const holdingId=crypto.randomUUID(),r=ref('RED');
      db.holdings.push({holdingId,userId:user.id,itemId:item.id,name:item.name,category:item.category,value:item.value,img:item.img,status:'OWNED',createdAt:now});
      db.ledger.push({userId:user.id,kind:'確定性兌換',amount:-item.value,balance:user.credits,ref:r,itemId:item.id,createdAt:now});
      db.transactions.push({id:crypto.randomUUID(),userId:user.id,type:'REDEEM',status:'COMPLETED',amount:-item.value,itemId:item.id,holdingId,ref:r,createdAt:now});
      saveDb(db);return json(res,200,{ok:true,message:`已兌換 ${item.name}`,state:publicState(user.id)});
    }
    if(req.method==='POST'&&url.pathname==='/api/reset'){
      const user=requireUser(req,res);if(!user)return;
      const fresh=initialDb();
      const freshUser=fresh.users.find(u=>u.id===user.id) || fresh.users[0];
      // Keep current user identity, but reset only its wallet and personal history plus shared inventory.
      user.credits=freshUser.credits;
      db.items=structuredClone(initialItems);
      db.holdings=db.holdings.filter(h=>h.userId!==user.id);
      db.ledger=db.ledger.filter(x=>x.userId!==user.id);
      db.transactions=db.transactions.filter(x=>x.userId!==user.id);
      saveDb(db);return json(res,200,{ok:true,message:'你的 Demo 已重置',state:publicState(user.id)});
    }
    return json(res,404,{ok:false,error:'Not Found'});
  }catch(err){return json(res,500,{ok:false,error:'Server error',detail:err.message});}
}

const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  if(url.pathname.startsWith('/api/'))return api(req,res,url);
  let filePath=path.join(ROOT,url.pathname==='/'?'index.html':url.pathname);
  if(!filePath.startsWith(ROOT))return json(res,403,{error:'Forbidden'});
  fs.readFile(filePath,(err,data)=>{if(err){res.writeHead(404);return res.end('Not Found');}res.writeHead(200,{'Content-Type':mime[path.extname(filePath)]||'application/octet-stream'});res.end(data);});
});
server.listen(PORT,()=>console.log(`ELO Collect V0.3 running at http://localhost:${PORT}`));

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const DB_FILE = path.join(ROOT, 'data.json');
const PORT = Number(process.env.PORT || 3000);
const BASE_URL = String(process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const STEAM_RETURN_URL = String(process.env.STEAM_RETURN_URL || `${BASE_URL}/auth/steam/callback`);
const STEAM_OPENID_ENDPOINT = 'https://steamcommunity.com/openid/login';
const STEAM_API_KEY = String(process.env.STEAM_WEB_API_KEY || '');
const SESSION_COOKIE = 'elo_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const STEAM_AUTH_TTL_MS = 10 * 60 * 1000;

const initialItems = [
  {id:'item_ak_slate',name:'AK-47 | Slate',category:'Rifle',value:520,stock:10,img:'https://placehold.co/640x480/png?text=AK-47+Slate',status:'AVAILABLE'},
  {id:'item_usp_cortex',name:'USP-S | Cortex',category:'Pistol',value:460,stock:12,img:'https://placehold.co/640x480/png?text=USP-S+Cortex',status:'AVAILABLE'},
  {id:'item_m4_basilisk',name:'M4A1-S | Basilisk',category:'Rifle',value:380,stock:15,img:'https://placehold.co/640x480/png?text=M4A1-S+Basilisk',status:'AVAILABLE'},
  {id:'item_awp_atheris',name:'AWP | Atheris',category:'Sniper',value:350,stock:18,img:'https://placehold.co/640x480/png?text=AWP+Atheris',status:'AVAILABLE'}
];

function now(){ return new Date().toISOString(); }
function id(prefix='id'){ return `${prefix}_${crypto.randomBytes(6).toString('hex')}`; }
function publicSteamProfile(user){
  return user.steam ? {
    steamId: user.steam.steamId,
    personaName: user.steam.personaName || null,
    avatar: user.steam.avatar || null,
    profileUrl: user.steam.profileUrl || `https://steamcommunity.com/profiles/${user.steam.steamId}`,
    linkedAt: user.steam.linkedAt || null
  } : null;
}

function initialDb(){
  const t = now();
  return {
    version: 2,
    users: [
      {id:'u_demo',username:'elo_demo',displayName:'ELO Demo',credits:1000,role:'USER',status:'ACTIVE',createdAt:t,steam:null},
      {id:'u_alice',username:'alice',displayName:'Alice',credits:720,role:'USER',status:'ACTIVE',createdAt:t,steam:null},
      {id:'u_admin',username:'admin',displayName:'ELO Admin',credits:0,role:'ADMIN',status:'ACTIVE',createdAt:t,steam:null}
    ],
    items: structuredClone(initialItems),
    holdings: [],
    ledger: [],
    transactions: [],
    audit: [],
    sessions: {},
    steamAuth: {},
    settings: {currency:'Credits',version:'V1.1.0',steamLogin:true}
  };
}
function loadDb(){
  if(!fs.existsSync(DB_FILE)){ const db=initialDb(); saveDb(db); return db; }
  try{
    const db=JSON.parse(fs.readFileSync(DB_FILE,'utf8'));
    if(!Array.isArray(db.users) || !Array.isArray(db.items)) throw new Error('invalid db');
    db.holdings ||= []; db.ledger ||= []; db.transactions ||= []; db.audit ||= []; db.sessions ||= {}; db.steamAuth ||= {};
    db.settings ||= {currency:'Credits',version:'V1.1.0',steamLogin:true};
    for(const u of db.users){ if(!Object.prototype.hasOwnProperty.call(u,'steam'))u.steam=null; }
    return db;
  }catch{
    const db=initialDb(); saveDb(db); return db;
  }
}
function saveDb(db){
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db,null,2));
  fs.renameSync(tmp, DB_FILE);
}
let db=loadDb();

function publicUser(user){
  return {
    id:user.id,username:user.username,displayName:user.displayName,role:user.role,status:user.status,
    steam: publicSteamProfile(user)
  };
}
function publicItem(item){ return {...item}; }
function parseCookies(req){
  const out={};
  for(const part of String(req.headers.cookie||'').split(';')){
    const i=part.indexOf('='); if(i<0) continue;
    out[part.slice(0,i).trim()] = decodeURIComponent(part.slice(i+1).trim());
  }
  return out;
}
function setCookie(res,name,value,maxAge){
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${name}=${encodeURIComponent(value)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${Math.floor(maxAge)}${secure}`);
}
function clearCookie(res,name){ setCookie(res,name,'',0); }
function currentUser(req){
  const sid=parseCookies(req)[SESSION_COOKIE];
  const s=sid ? db.sessions[sid] : null;
  if(!s) return null;
  if(Date.now() - s.createdAt > SESSION_TTL_MS){ delete db.sessions[sid]; saveDb(db); return null; }
  const u=db.users.find(x=>x.id===s.userId);
  if(!u || u.status!=='ACTIVE') return null;
  return u;
}
function createSession(res,userId){
  const sid=crypto.randomUUID();
  db.sessions[sid]={userId,createdAt:Date.now()};
  saveDb(db);
  setCookie(res,SESSION_COOKIE,sid,SESSION_TTL_MS/1000);
}
function sendJson(res,status,payload){
  const body=JSON.stringify(payload);
  res.writeHead(status,{
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff',
    'X-Frame-Options':'DENY',
    'Referrer-Policy':'same-origin',
    'Permissions-Policy':'camera=(), microphone=(), geolocation=()'
  });
  res.end(body);
}
function sendError(res,status,message,code='ERROR'){ sendJson(res,status,{ok:false,error:message,code}); }
function htmlRedirect(res,status,url){
  res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
  res.end(`<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${String(url).replace(/"/g,'&quot;')}"><a href="${String(url).replace(/"/g,'&quot;')}">繼續</a>`);
}
function readBody(req){
  return new Promise((resolve,reject)=>{
    let raw='';
    req.on('data',c=>{ raw+=c; if(raw.length>1_000_000){ req.destroy(); reject(new Error('Payload too large')); } });
    req.on('end',()=>{ if(!raw)return resolve({}); try{resolve(JSON.parse(raw));}catch{reject(new Error('Invalid JSON'));} });
    req.on('error',reject);
  });
}
function audit(actor,action,target,meta={}){
  db.audit.push({id:id('audit'),actorUserId:actor?.id||'SYSTEM',action,target,meta,createdAt:now()});
  if(db.audit.length>5000) db.audit=db.audit.slice(-5000);
}
function userState(user){
  return {
    user:publicUser(user),
    credits:user.credits,
    steam:publicSteamProfile(user),
    items:db.items.map(publicItem),
    holdings:db.holdings.filter(h=>h.userId===user.id).slice().reverse(),
    ledger:db.ledger.filter(x=>x.userId===user.id).slice().reverse().slice(0,100),
    transactions:db.transactions.filter(x=>x.userId===user.id).slice().reverse().slice(0,100)
  };
}
function adminState(){
  return {
    users:db.users.map(publicUser),
    items:db.items.map(publicItem),
    holdings:db.holdings.slice().reverse().slice(0,100),
    transactions:db.transactions.slice().reverse().slice(0,200),
    ledger:db.ledger.slice().reverse().slice(0,200),
    audit:db.audit.slice().reverse().slice(0,200),
    stats:{users:db.users.length,activeUsers:db.users.filter(u=>u.status==='ACTIVE').length,items:db.items.length,inventoryValue:db.items.reduce((s,x)=>s+x.value*x.stock,0),holdings:db.holdings.length,pending:db.transactions.filter(t=>t.status==='PENDING').length,steamLinkedUsers:db.users.filter(u=>u.steam?.steamId).length}
  };
}
function requireUser(req,res){
  const u=currentUser(req); if(!u) sendError(res,401,'請先登入','AUTH_REQUIRED'); return u;
}
function requireAdmin(req,res){
  const u=requireUser(req,res); if(!u)return null; if(u.role!=='ADMIN'){sendError(res,403,'需要管理員權限','FORBIDDEN');return null;} return u;
}
function cleanupSteamAuth(){
  let changed=false;
  const cutoff=Date.now()-STEAM_AUTH_TTL_MS;
  for(const [state,entry] of Object.entries(db.steamAuth)){
    if(entry.createdAt < cutoff){ delete db.steamAuth[state]; changed=true; }
  }
  if(changed) saveDb(db);
}
function steamLoginUrl(state){
  const returnUrl = new URL(STEAM_RETURN_URL);
  returnUrl.searchParams.set('state',state);
  const params = new URLSearchParams({
    'openid.ns':'http://specs.openid.net/auth/2.0',
    'openid.mode':'checkid_setup',
    'openid.return_to':returnUrl.toString(),
    'openid.realm':`${new URL(STEAM_RETURN_URL).origin}/`,
    'openid.ns.sreg':'http://openid.net/extensions/sreg/1.1',
    'openid.identity':'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id':'http://specs.openid.net/auth/2.0/identifier_select'
  });
  return `${STEAM_OPENID_ENDPOINT}?${params}`;
}
function parseSteamId(claimedId){
  const m=String(claimedId||'').match(/^https?:\/\/steamcommunity\.com\/openid\/id\/(\d+)\/?$/);
  return m ? m[1] : null;
}
async function verifySteamOpenId(query){
  const verification = new URLSearchParams();
  for(const [key,value] of Object.entries(query)){
    if(key.startsWith('openid.')) verification.set(key,String(value));
  }
  verification.set('openid.mode','check_authentication');
  const response = await fetch(STEAM_OPENID_ENDPOINT,{
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:verification.toString(),
    redirect:'error'
  });
  if(!response.ok) throw new Error(`Steam 驗證服務回應 ${response.status}`);
  const text = await response.text();
  return /\bis_valid\s*:\s*true\b/i.test(text);
}
async function fetchSteamProfile(steamId){
  if(!STEAM_API_KEY)return null;
  try{
    const u = new URL('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/');
    u.searchParams.set('key',STEAM_API_KEY);
    u.searchParams.set('steamids',steamId);
    const r=await fetch(u,{redirect:'error'});
    if(!r.ok)return null;
    const data=await r.json();
    const p=data?.response?.players?.[0];
    if(!p)return null;
    return {personaName:p.personaname||null,avatar:p.avatarfull||p.avatarmedium||p.avatar||null,profileUrl:p.profileurl||null};
  }catch{return null;}
}
function findOrCreateSteamUser(steamId,profile){
  let u=db.users.find(x=>x.steam?.steamId===steamId);
  if(!u){
    const base=`steam_${steamId}`;
    let username=base;
    let suffix=1;
    while(db.users.some(x=>x.username===username)){username=`${base}_${suffix++}`;}
    u={id:id('user'),username,displayName:profile?.personaName || `Steam User ${steamId.slice(-5)}`,credits:0,role:'USER',status:'ACTIVE',createdAt:now(),steam:null};
    db.users.push(u);
  }
  if(u.status!=='ACTIVE') throw new Error('此帳號目前無法登入');
  u.steam={steamId,personaName:profile?.personaName || u.displayName,avatar:profile?.avatar || null,profileUrl:profile?.profileUrl || `https://steamcommunity.com/profiles/${steamId}`,linkedAt:u.steam?.linkedAt || now()};
  u.displayName=profile?.personaName || u.displayName;
  return u;
}

async function api(req,res,url){
  try{
    if(req.method==='POST' && url.pathname==='/api/auth/dev-login'){
      const b=await readBody(req); const u=db.users.find(x=>x.id===String(b.userId||''));
      if(!u || u.status!=='ACTIVE') return sendError(res,404,'找不到可登入的 Demo 帳號','USER_NOT_FOUND');
      createSession(res,u.id); audit(u,'LOGIN_DEV',u.id); saveDb(db);
      return sendJson(res,200,{ok:true,state:userState(u),users:db.users.map(publicUser)});
    }
    if(req.method==='GET' && url.pathname==='/api/auth/users') return sendJson(res,200,{ok:true,users:db.users.filter(u=>u.status==='ACTIVE').map(publicUser)});
    if(req.method==='POST' && url.pathname==='/api/auth/logout'){
      const sid=parseCookies(req)[SESSION_COOKIE]; if(sid) delete db.sessions[sid]; saveDb(db); clearCookie(res,SESSION_COOKIE); return sendJson(res,200,{ok:true});
    }
    if(req.method==='GET' && url.pathname==='/api/state'){
      const u=requireUser(req,res); if(!u)return; return sendJson(res,200,{ok:true,...userState(u)});
    }
    if(req.method==='POST' && url.pathname==='/api/credits/grant'){
      const u=requireUser(req,res); if(!u)return; const amount=500; u.credits+=amount; const r=id('DEV');
      db.ledger.push({id:id('led'),userId:u.id,kind:'DEMO_GRANT',amount,balance:u.credits,ref:r,createdAt:now()});
      db.transactions.push({id:id('tx'),userId:u.id,type:'CREDIT_GRANT',status:'COMPLETED',amount,ref:r,createdAt:now()}); audit(u,'CREDIT_GRANT',u.id,{amount}); saveDb(db);
      return sendJson(res,200,{ok:true,message:'已增加 500 Credits（Demo）',state:userState(u)});
    }
    if(req.method==='POST' && url.pathname==='/api/redeem'){
      const u=requireUser(req,res); if(!u)return; const b=await readBody(req); const item=db.items.find(x=>x.id===String(b.itemId||''));
      if(!item)return sendError(res,404,'找不到收藏品','ITEM_NOT_FOUND');
      if(item.status!=='AVAILABLE'||item.stock<=0)return sendError(res,409,'目前沒有庫存','OUT_OF_STOCK');
      if(!Number.isInteger(item.value)||item.value<=0)return sendError(res,500,'商品價格資料無效','INVALID_PRICE');
      if(u.credits<item.value)return sendError(res,409,'Credits 不足','INSUFFICIENT_CREDITS');
      const key=String(b.requestId||''); if(key && db.transactions.some(t=>t.requestId===key)) return sendError(res,409,'這筆請求已處理','DUPLICATE_REQUEST');
      const t=now(), refNo=id('RED'), holdingId=id('holding');
      u.credits-=item.value; item.stock--;
      db.holdings.push({holdingId,userId:u.id,itemId:item.id,name:item.name,category:item.category,value:item.value,img:item.img,status:'OWNED',createdAt:t});
      db.ledger.push({id:id('led'),userId:u.id,kind:'DIRECT_REDEEM',amount:-item.value,balance:u.credits,ref:refNo,itemId:item.id,createdAt:t});
      db.transactions.push({id:id('tx'),userId:u.id,type:'REDEEM',status:'COMPLETED',amount:-item.value,itemId:item.id,holdingId,ref:refNo,requestId:key||null,createdAt:t});
      audit(u,'REDEEM',item.id,{value:item.value,holdingId}); saveDb(db);
      return sendJson(res,200,{ok:true,message:`已兌換 ${item.name}`,state:userState(u)});
    }
    if(req.method==='POST' && url.pathname==='/api/reset'){
      const u=requireUser(req,res); if(!u)return; u.credits=u.id==='u_alice'?720:1000; db.items=structuredClone(initialItems);
      db.holdings=db.holdings.filter(h=>h.userId!==u.id); db.ledger=db.ledger.filter(x=>x.userId!==u.id); db.transactions=db.transactions.filter(x=>x.userId!==u.id);
      audit(u,'RESET_DEMO',u.id); saveDb(db); return sendJson(res,200,{ok:true,message:'你的 Demo 已重置',state:userState(u)});
    }
    // Admin
    if(req.method==='GET' && url.pathname==='/api/admin/state'){ const a=requireAdmin(req,res); if(!a)return; return sendJson(res,200,{ok:true,...adminState()}); }
    if(req.method==='POST' && url.pathname==='/api/admin/item'){
      const a=requireAdmin(req,res); if(!a)return; const b=await readBody(req);
      const name=String(b.name||'').trim(); const category=String(b.category||'').trim(); const value=Number(b.value); const stock=Math.max(0,Math.floor(Number(b.stock)||0)); const img=String(b.img||'').trim();
      if(!name||!category||!Number.isFinite(value)||value<=0||value>1_000_000) return sendError(res,400,'商品欄位無效','VALIDATION_ERROR');
      const item={id:id('item'),name,category,value,stock,img:img||`https://placehold.co/640x480/png?text=${encodeURIComponent(name)}`,status:'AVAILABLE'}; db.items.push(item); audit(a,'CREATE_ITEM',item.id,{name,value,stock}); saveDb(db);
      return sendJson(res,200,{ok:true,item,admin:adminState()});
    }
    if(req.method==='PATCH' && url.pathname.startsWith('/api/admin/item/')){
      const a=requireAdmin(req,res); if(!a)return; const itemId=url.pathname.split('/').pop(); const item=db.items.find(x=>x.id===itemId); if(!item)return sendError(res,404,'找不到商品','ITEM_NOT_FOUND');
      const b=await readBody(req); if(b.name!==undefined)item.name=String(b.name).trim(); if(b.category!==undefined)item.category=String(b.category).trim(); if(b.value!==undefined)item.value=Number(b.value); if(b.stock!==undefined)item.stock=Math.max(0,Math.floor(Number(b.stock))); if(b.status!==undefined)item.status=b.status==='ARCHIVED'?'ARCHIVED':'AVAILABLE'; if(b.img!==undefined)item.img=String(b.img).trim();
      if(!item.name||!item.category||!Number.isFinite(item.value)||item.value<=0) return sendError(res,400,'商品資料無效','VALIDATION_ERROR');
      audit(a,'UPDATE_ITEM',item.id,b); saveDb(db); return sendJson(res,200,{ok:true,admin:adminState()});
    }
    if(req.method==='POST' && url.pathname==='/api/admin/credit'){
      const a=requireAdmin(req,res); if(!a)return; const b=await readBody(req); const u=db.users.find(x=>x.id===String(b.userId||'')); const amount=Number(b.amount);
      if(!u||!Number.isInteger(amount)||Math.abs(amount)>1_000_000) return sendError(res,400,'參數無效','VALIDATION_ERROR');
      if(u.credits+amount<0)return sendError(res,409,'不得讓 Credits 變成負數','NEGATIVE_BALANCE');
      u.credits+=amount; const r=id('ADJ'); db.ledger.push({id:id('led'),userId:u.id,kind:'ADMIN_ADJUSTMENT',amount,balance:u.credits,ref:r,createdAt:now(),actorUserId:a.id}); db.transactions.push({id:id('tx'),userId:u.id,type:'ADMIN_CREDIT_ADJUSTMENT',status:'COMPLETED',amount,ref:r,createdAt:now(),actorUserId:a.id}); audit(a,'CREDIT_ADJUST',u.id,{amount}); saveDb(db); return sendJson(res,200,{ok:true,admin:adminState()});
    }
    if(req.method==='POST' && url.pathname==='/api/admin/user-status'){
      const a=requireAdmin(req,res); if(!a)return; const b=await readBody(req); const u=db.users.find(x=>x.id===String(b.userId||'')); if(!u)return sendError(res,404,'找不到使用者','USER_NOT_FOUND'); if(u.id===a.id)return sendError(res,400,'不能停用目前登入的管理員','SELF_LOCKOUT'); u.status=b.status==='SUSPENDED'?'SUSPENDED':'ACTIVE'; audit(a,'USER_STATUS',u.id,{status:u.status}); saveDb(db); return sendJson(res,200,{ok:true,admin:adminState()});
    }
    return sendError(res,404,'Not Found','NOT_FOUND');
  }catch(err){ console.error(err); return sendError(res,500,'伺服器發生錯誤','SERVER_ERROR'); }
}

const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  cleanupSteamAuth();

  if(req.method==='GET' && url.pathname==='/auth/steam'){
    const state=crypto.randomBytes(24).toString('hex');
    db.steamAuth[state]={createdAt:Date.now(),returnUrl:STEAM_RETURN_URL};
    saveDb(db);
    return res.writeHead(302,{Location:steamLoginUrl(state),'Cache-Control':'no-store'}),res.end();
  }
  if(req.method==='GET' && url.pathname==='/auth/steam/callback'){
    const state=url.searchParams.get('state');
    const pending=state ? db.steamAuth[state] : null;
    delete db.steamAuth[state]; saveDb(db);
    if(!pending || Date.now()-pending.createdAt>STEAM_AUTH_TTL_MS) return htmlRedirect(res,302,'/?steam_error=session');
    if(url.searchParams.get('openid.mode')==='cancel') return htmlRedirect(res,302,'/?steam_error=cancelled');
    try{
      const returnUrl = new URL(pending.returnUrl);
      returnUrl.searchParams.set('state',state);
      if(url.searchParams.get('openid.return_to')!==returnUrl.toString()) throw new Error('return_to mismatch');
      const steamId=parseSteamId(url.searchParams.get('openid.claimed_id'));
      if(!steamId) throw new Error('無效的 SteamID');
      const valid=await verifySteamOpenId(Object.fromEntries(url.searchParams.entries()));
      if(!valid) throw new Error('Steam 身分驗證失敗');
      const profile=await fetchSteamProfile(steamId);
      const u=findOrCreateSteamUser(steamId,profile);
      audit(u,'LOGIN_STEAM',u.id,{steamId});
      createSession(res,u.id);
      saveDb(db);
      return htmlRedirect(res,302,'/?steam_login=success');
    }catch(err){
      console.error('Steam auth error:',err.message);
      return htmlRedirect(res,302,'/?steam_error=verification');
    }
  }

  if(url.pathname.startsWith('/api/')) return api(req,res,url);
  const safePath=decodeURIComponent(url.pathname);
  const filePath=path.normalize(path.join(ROOT, safePath==='/'?'index.html':safePath));
  if(!filePath.startsWith(ROOT)) return sendError(res,403,'Forbidden','FORBIDDEN');
  fs.readFile(filePath,(err,data)=>{ if(err){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});return res.end('Not Found');} res.writeHead(200,{'Content-Type':mime[path.extname(filePath)]||'application/octet-stream','X-Content-Type-Options':'nosniff'}); res.end(data); });
});
server.listen(PORT,()=>console.log(`ELO Collect V1.1 running at ${BASE_URL}`));

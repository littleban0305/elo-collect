const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const DB_FILE = path.join(ROOT, 'data.json');
const PORT = Number(process.env.PORT || 3000);

const initialItems = [
  {id:1,name:'AK-47 | Slate',category:'Rifle',value:520,stock:10,img:'https://placehold.co/640x480/png?text=AK-47+Slate'},
  {id:2,name:'USP-S | Cortex',category:'Pistol',value:460,stock:12,img:'https://placehold.co/640x480/png?text=USP-S+Cortex'},
  {id:3,name:'M4A1-S | Basilisk',category:'Rifle',value:380,stock:15,img:'https://placehold.co/640x480/png?text=M4A1-S+Basilisk'},
  {id:4,name:'AWP | Atheris',category:'Sniper',value:350,stock:18,img:'https://placehold.co/640x480/png?text=AWP+Atheris'}
];

function initialDb(){ return {credits:1000, items:structuredClone(initialItems), holdings:[], ledger:[]}; }
function loadDb(){
  if (!fs.existsSync(DB_FILE)) { const db = initialDb(); saveDb(db); return db; }
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { const db = initialDb(); saveDb(db); return db; }
}
function saveDb(db){ fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
function json(res, status, payload){
  const body = JSON.stringify(payload);
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store'});
  res.end(body);
}
function body(req){
  return new Promise((resolve,reject)=>{
    let raw=''; req.on('data', c=>raw+=c); req.on('end', ()=>{ try{resolve(raw?JSON.parse(raw):{})}catch(e){reject(e)} }); req.on('error',reject);
  });
}
function ref(prefix){ return `${prefix}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`; }

let db = loadDb();

async function api(req,res,url){
  try {
    if(req.method==='GET' && url.pathname==='/api/state') return json(res,200,db);
    if(req.method==='POST' && url.pathname==='/api/credits/grant'){
      db.credits += 500;
      const r=ref('DEV'); db.ledger.push({kind:'開發模式加值',amount:500,balance:db.credits,ref:r,createdAt:new Date().toISOString()});
      saveDb(db); return json(res,200,{ok:true, message:'已增加 500 Credits（僅 Demo）', state:db});
    }
    if(req.method==='POST' && url.pathname==='/api/redeem'){
      const input=await body(req); const id=Number(input.itemId);
      const item=db.items.find(x=>x.id===id);
      if(!item) return json(res,404,{ok:false,error:'找不到收藏品'});
      if(item.stock<=0) return json(res,409,{ok:false,error:'目前沒有庫存'});
      if(db.credits<item.value) return json(res,409,{ok:false,error:'Credits 不足'});
      db.credits -= item.value; item.stock--;
      const r=ref('RED');
      db.holdings.push({...item, holdingId:crypto.randomUUID()});
      db.ledger.push({kind:'確定性兌換',amount:-item.value,balance:db.credits,ref:r,itemId:item.id,createdAt:new Date().toISOString()});
      saveDb(db); return json(res,200,{ok:true,message:`已兌換 ${item.name}`,state:db});
    }
    if(req.method==='POST' && url.pathname==='/api/reset'){
      db=initialDb(); saveDb(db); return json(res,200,{ok:true,message:'Demo 已重置',state:db});
    }
    return json(res,404,{ok:false,error:'Not Found'});
  } catch(err){ return json(res,500,{ok:false,error:'Server error',detail:err.message}); }
}

const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,`http://${req.headers.host}`);
  if(url.pathname.startsWith('/api/')) return api(req,res,url);
  let filePath = path.join(ROOT, url.pathname==='/'?'index.html':url.pathname);
  if(!filePath.startsWith(ROOT)) return json(res,403,{error:'Forbidden'});
  fs.readFile(filePath,(err,data)=>{
    if(err){res.writeHead(404); return res.end('Not Found');}
    res.writeHead(200,{'Content-Type':mime[path.extname(filePath)]||'application/octet-stream'});res.end(data);
  });
});
server.listen(PORT,()=>console.log(`ELO Collect V0.2 running at http://localhost:${PORT}`));

const $=(id)=>document.getElementById(id);
let state=null;
const money=n=>`${Number(n).toLocaleString()} Credits`;
let noticeTimer;
function notify(text){$('notice').textContent=text;$('notice').classList.remove('hidden');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').classList.add('hidden'),3200);}
async function api(path,options={}){const res=await fetch(path,{headers:{'Content-Type':'application/json'},...options});const data=await res.json();if(!res.ok||data.ok===false)throw new Error(data.error||'Request failed');return data;}
function renderUserPicker(users){$('userSelect').innerHTML=users.map(u=>`<option value="${u.id}" ${u.id===state?.user?.id?'selected':''}>${u.displayName} (@${u.username})</option>`).join('');}
function render(){
 if(!state)return;
 $('credits').textContent=money(state.credits);
 $('userName').textContent=state.user.displayName;
 $('userHandle').textContent=`@${state.user.username}`;
 $('inventoryValue').textContent=state.items.reduce((s,i)=>s+i.value*i.stock,0).toLocaleString();
 $('marketGrid').innerHTML=state.items.filter(i=>i.stock>0).map(i=>`<article class="card"><img src="${i.img}" alt="${i.name}"><div class="card-body"><span class="tag">${i.category}</span><h3>${i.name}</h3><div class="meta"><span>${money(i.value)}</span><small>庫存 ${i.stock}</small></div><button ${state.credits<i.value?'disabled':''} onclick="redeem(${i.id})">兌換收藏</button></div></article>`).join('');
 $('collectionCount').textContent=`${state.holdings.length} 件`;
 $('collectionGrid').innerHTML=state.holdings.length?state.holdings.slice().reverse().map(h=>`<article class="card"><img src="${h.img}" alt="${h.name}"><div class="card-body"><span class="tag">OWNED</span><h3>${h.name}</h3><div class="meta"><span>${money(h.value)}</span><small>${h.category}</small></div><button disabled>Steam 提取（V1 預留）</button></div></article>`).join(''):'<div class="notice">還沒有收藏品。去市場挑一件吧。</div>';
 $('ledgerBody').innerHTML=state.ledger.slice().reverse().map(x=>`<tr><td>${x.kind}</td><td class="${x.amount>=0?'plus':'minus'}">${x.amount>=0?'+':''}${x.amount}</td><td>${x.balance}</td><td>${x.ref}</td></tr>`).join('');
 $('txBody').innerHTML=state.transactions.map(x=>`<tr><td>${x.type}</td><td>${x.status}</td><td>${x.amount}</td><td>${x.ref}</td></tr>`).join('');
}
window.redeem=async id=>{try{const data=await api('/api/redeem',{method:'POST',body:JSON.stringify({itemId:id})});state=data.state;render();notify(`${data.message} · 已寫入後端帳本`);}catch(e){notify(e.message);}};
$('grant').onclick=async()=>{try{const d=await api('/api/credits/grant',{method:'POST'});state=d.state;render();notify(d.message);}catch(e){notify(e.message);}};
$('reset').onclick=async()=>{try{const d=await api('/api/reset',{method:'POST'});state=d.state;render();notify(d.message);}catch(e){notify(e.message);}};
$('logout').onclick=async()=>{try{await api('/api/auth/logout',{method:'POST'});location.reload();}catch(e){notify(e.message);}};
$('login').onclick=async()=>{try{const d=await api('/api/auth/dev-login',{method:'POST',body:JSON.stringify({userId:$('userSelect').value})});state=d.state;renderUserPicker(d.users);render();notify(d.message);}catch(e){notify(e.message);}};
document.querySelectorAll('.nav-btn').forEach(b=>b.onclick=()=>{document.querySelectorAll('.nav-btn').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.tab-panel').forEach(x=>x.classList.remove('active'));b.classList.add('active');$(b.dataset.tab).classList.add('active');});
api('/api/auth/users').then(d=>{renderUserPicker(d.users);return api('/api/state')}).then(d=>{state=d;renderUserPicker((d.users)||[]);render();}).catch(()=>{ $('loginGate').classList.remove('hidden'); });

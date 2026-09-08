const initialItems = [
  {id:1,name:'AK-47 | Slate',category:'Rifle',value:520,stock:10,img:'https://placehold.co/640x480/png?text=AK-47+Slate'},
  {id:2,name:'USP-S | Cortex',category:'Pistol',value:460,stock:12,img:'https://placehold.co/640x480/png?text=USP-S+Cortex'},
  {id:3,name:'M4A1-S | Basilisk',category:'Rifle',value:380,stock:15,img:'https://placehold.co/640x480/png?text=M4A1-S+Basilisk'},
  {id:4,name:'AWP | Atheris',category:'Sniper',value:350,stock:18,img:'https://placehold.co/640x480/png?text=AWP+Atheris'}
];
let state = {credits:1000, items:structuredClone(initialItems), holdings:[], ledger:[]};
const $=id=>document.getElementById(id);
function save(){localStorage.setItem('eloCollectDemo',JSON.stringify(state))}
function load(){const x=localStorage.getItem('eloCollectDemo');if(x)state=JSON.parse(x)}
function money(n){return `${n.toLocaleString()} Credits`}
function notify(t){$('notice').textContent=t;$('notice').classList.remove('hidden');clearTimeout(notify.t);notify.t=setTimeout(()=>$('notice').classList.add('hidden'),3200)}
function render(){
  $('credits').textContent=money(state.credits);
  $('inventoryValue').textContent=state.items.reduce((s,i)=>s+i.value*i.stock,0).toLocaleString();
  $('marketGrid').innerHTML=state.items.filter(i=>i.stock>0).map(i=>`<article class="card"><img src="${i.img}" alt=""><div class="card-body"><span class="tag">${i.category}</span><h3>${i.name}</h3><div class="meta"><span>${money(i.value)}</span><small>庫存 ${i.stock}</small></div><button ${state.credits<i.value?'disabled':''} onclick="redeem(${i.id})">兌換收藏</button></div></article>`).join('');
  $('collectionCount').textContent=`${state.holdings.length} 件`;
  $('collectionGrid').innerHTML=state.holdings.length?state.holdings.slice().reverse().map(h=>`<article class="card"><img src="${h.img}" alt=""><div class="card-body"><span class="tag">OWNED</span><h3>${h.name}</h3><div class="meta"><span>${money(h.value)}</span><small>${h.category}</small></div><button disabled>提取流程（V1 預留）</button></div></article>`).join(''):'<div class="notice">還沒有收藏品。去市場挑一件吧。</div>';
  $('ledgerBody').innerHTML=state.ledger.slice().reverse().map(x=>`<tr><td>${x.kind}</td><td class="${x.amount>=0?'plus':'minus'}">${x.amount>=0?'+':''}${x.amount}</td><td>${x.balance}</td><td>${x.ref}</td></tr>`).join('');
}
window.redeem=function(id){const item=state.items.find(i=>i.id===id);if(!item||state.credits<item.value||item.stock<=0)return;state.credits-=item.value;item.stock--;const ref='RED-'+Math.random().toString(36).slice(2,8).toUpperCase();state.holdings.push({...item,stock:undefined});state.ledger.push({kind:'確定性兌換',amount:-item.value,balance:state.credits,ref});save();render();notify(`已兌換 ${item.name} · ${ref}`)}
$('grant').onclick=()=>{state.credits+=500;const ref='DEV-'+Math.random().toString(36).slice(2,8).toUpperCase();state.ledger.push({kind:'開發模式加值',amount:500,balance:state.credits,ref});save();render();notify('已增加 500 Credits（僅 Demo）')}
$('reset').onclick=()=>{state={credits:1000,items:structuredClone(initialItems),holdings:[],ledger:[]};save();render();notify('Demo 已重置')}
document.querySelectorAll('.nav-btn').forEach(b=>b.onclick=()=>{document.querySelectorAll('.nav-btn').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.tab-panel').forEach(x=>x.classList.remove('active'));b.classList.add('active');$(b.dataset.tab).classList.add('active')});
load();render();

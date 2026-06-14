// V35 Admin — Dashboard de gestion des sites
// GET  /              → UI admin (protégée)
// GET  /pages         → liste pages R2 d'un slug
// GET  /page          → contenu d'une page
// POST /save          → sauvegarder page HTML
// POST /section       → mettre à jour une section nommée
// POST /ai-text       → améliorer un texte via content-ai
// POST /generate-image→ générer image via media-gen
// GET  /media         → liste médias d'un slug
// GET  /backups       → liste sauvegardes
// POST /backup        → créer une sauvegarde
// POST /restore       → restaurer une sauvegarde
// GET  /export        → exporter JSON local

const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization'};
const ok=(d,s=200)=>new Response(JSON.stringify({ok:true,...d}),{status:s,headers:{'Content-Type':'application/json',...CORS}});
const err=(m,s=400)=>new Response(JSON.stringify({ok:false,error:m}),{status:s,headers:{'Content-Type':'application/json',...CORS}});

function auth(request,env){
  const h=request.headers.get('Authorization')||'';
  const t=new URL(request.url).searchParams.get('token')||'';
  const token=env.API_TOKEN||'dde0d1b0dfdc9546c0e3464e9939fa4c0fc138e8d5f43df3';
  return h==='Bearer '+token||t===token;
}

async function r2get(env,key){
  const obj=await env.R2.get(key);
  if(!obj)return null;
  return new Response(obj.body).text();
}
async function r2put(env,key,html){
  await env.R2.put(key,html,{httpMetadata:{contentType:'text/html;charset=UTF-8'}});
}

function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

function updateSection(html,section,value){
  if(section==='h1') return html.replace(/<h1>[^<]*<\/h1>/,()=>'<h1>'+esc(value)+'</h1>');
  if(section==='meta_title') return html.replace(/<title>[^<]*<\/title>/,()=>'<title>'+esc(value)+'</title>');
  if(section==='meta_desc') return html.replace(/name="description" content="[^"]*"/,()=>'name="description" content="'+esc(value)+'"');
  if(section==='meta'){
    let h=html.replace(/<title>[^<]*<\/title>/,()=>'<title>'+esc(value.title||'')+'</title>');
    return h.replace(/name="description" content="[^"]*"/,()=>'name="description" content="'+esc(value.desc||'')+'"');
  }
  return html;
}

function adminHTML(token){
return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>V35 Admin</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f3;color:#222;display:flex;min-height:100vh}
.sb{width:250px;background:#111;color:#fff;flex-shrink:0;display:flex;flex-direction:column;padding:1.5rem;position:fixed;top:0;left:0;bottom:0;overflow-y:auto;z-index:10}
.sb-logo{font:normal 1rem Georgia,serif;letter-spacing:.22em;text-transform:uppercase;color:#fff;margin-bottom:.2rem}
.sb-v{font-size:.62rem;letter-spacing:.1em;color:#444;margin-bottom:1.8rem;text-transform:uppercase}
.sb-inp{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:3px;padding:.58rem .8rem;color:#fff;font-size:.8rem;width:100%;outline:none;margin-bottom:.45rem}
.sb-inp:focus{border-color:#b45309}
.sb-btn{width:100%;padding:.52rem;background:#b45309;color:#fff;border:none;cursor:pointer;font-size:.68rem;letter-spacing:.1em;text-transform:uppercase;font-weight:700;border-radius:2px}
.sb-btn:hover{background:#92400e}
.sb-nav{margin-top:1.4rem;list-style:none;display:none}
.sb-nav li{margin-bottom:.15rem}
.sb-nav a{display:block;padding:.52rem .72rem;border-radius:3px;color:#777;font-size:.77rem;cursor:pointer;transition:all .18s}
.sb-nav a:hover,.sb-nav a.act{background:#1a1a1a;color:#fff}
.sb-sep{height:1px;background:#1a1a1a;margin:1rem 0}
.sb-site{font-size:.68rem;color:#444;margin-top:auto;padding-top:1rem;border-top:1px solid #1a1a1a;word-break:break-all}
.main{margin-left:250px;flex:1;padding:2rem;min-height:100vh}
.hd{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:1.6rem}
.hd h1{font:normal 1.35rem Georgia,serif}
.hd .slug-tag{font-size:.7rem;color:#bbb;letter-spacing:.1em;text-transform:uppercase;background:#f0eeeb;padding:.25rem .65rem;border-radius:20px}
.card{background:#fff;border:1px solid #e5e5e0;border-radius:5px;padding:1.5rem;margin-bottom:1.1rem}
.card-hd{font-size:.66rem;letter-spacing:.18em;text-transform:uppercase;color:#bbb;margin-bottom:1rem;font-weight:700}
.field{margin-bottom:.85rem}
.field label{display:block;font-size:.68rem;font-weight:700;color:#888;margin-bottom:.3rem;letter-spacing:.06em;text-transform:uppercase}
.field input,.field textarea,.field select{width:100%;padding:.6rem .75rem;border:1px solid #e0e0db;border-radius:3px;font-size:.85rem;color:#222;font-family:inherit;outline:none;transition:border .18s;background:#fff}
.field input:focus,.field textarea:focus{border-color:#b45309}
.field textarea{min-height:80px;resize:vertical;line-height:1.6}
.brow{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.3rem}
.btn{padding:.55rem 1.2rem;border:none;font-size:.68rem;letter-spacing:.1em;text-transform:uppercase;font-weight:700;cursor:pointer;border-radius:3px;transition:all .2s;font-family:inherit;white-space:nowrap}
.bp{background:#b45309;color:#fff}.bp:hover{background:#92400e}
.bs{background:#111;color:#fff}.bs:hover{background:#333}
.bg{background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0}.bg:hover{background:#dcfce7}
.bd{background:#fef2f2;color:#dc2626;border:1px solid #fecaca}
.bo{background:#fff;color:#555;border:1px solid #ddd}.bo:hover{background:#f5f5f3}
.plist{list-style:none}
.plist li{padding:.6rem .75rem;border-bottom:1px solid #f5f5f3;display:flex;justify-content:space-between;align-items:center;font-size:.8rem;transition:background .15s}
.plist li:hover{background:#fafaf8}
.plist .path{color:#888;font-family:monospace;font-size:.75rem}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:.9rem}
.mgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:.7rem}
.mcard{border:1px solid #e5e5e0;border-radius:4px;overflow:hidden;background:#fafaf8}
.mcard-img{height:90px;display:flex;align-items:center;justify-content:center;font-size:.68rem;color:#aaa;padding:.5rem;text-align:center;background:#f0eeeb}
.mcard-info{padding:.45rem;font-size:.65rem;color:#999;word-break:break-all}
.bklist{list-style:none}
.bklist li{padding:.65rem .75rem;border-bottom:1px solid #f5f5f3;display:flex;justify-content:space-between;align-items:center}
.bkdate{font-family:monospace;font-size:.82rem;color:#555}
.toast{position:fixed;bottom:1.5rem;right:1.5rem;background:#111;color:#fff;padding:.7rem 1.1rem;border-radius:4px;font-size:.78rem;z-index:999;display:none;box-shadow:0 4px 16px rgba(0,0,0,.2)}
.toast.show{display:block}
.tnav{display:flex;gap:0;border-bottom:1px solid #e5e5e0;margin-bottom:1.4rem}
.tnav button{padding:.6rem 1rem;background:none;border:none;border-bottom:2px solid transparent;font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;color:#bbb;cursor:pointer;font-family:inherit;transition:all .18s}
.tnav button.act{color:#111;border-bottom-color:#111}
#code-ed{width:100%;min-height:380px;font-family:monospace;font-size:.78rem;border:1px solid #e0e0db;border-radius:3px;padding:.75rem;color:#222;background:#fafaf8;resize:vertical;outline:none}
.spin{display:inline-block;width:14px;height:14px;border:2px solid #e0e0db;border-top-color:#b45309;border-radius:50%;animation:sp .7s linear infinite;vertical-align:middle;margin-right:.4rem}
@keyframes sp{to{transform:rotate(360deg)}}
.empty{color:#bbb;font-size:.82rem;padding:1rem 0}
a.back{cursor:pointer;color:#bbb;font-size:.75rem;letter-spacing:.06em;text-transform:uppercase;margin-bottom:.6rem;display:inline-block}
a.back:hover{color:#111}
.op-tb{padding:.45rem .9rem;background:none;border:1px solid #2a2a2a;border-radius:16px;font-size:.7rem;cursor:pointer;font-family:inherit;color:#555;white-space:nowrap;transition:all .18s}
.op-tb.act{background:#b45309;color:#fff;border-color:#b45309}
.op-h2{font-size:.68rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#b45309;margin-bottom:1rem}
.op-field{margin-bottom:.75rem}
.op-field label{display:block;font-size:.68rem;font-weight:700;color:#888;margin-bottom:.28rem;letter-spacing:.06em;text-transform:uppercase}
.op-field input,.op-field textarea{width:100%;padding:.58rem .85rem;border:1px solid #e0e0db;border-radius:3px;font-size:.84rem;font-family:inherit;outline:none}
.op-field input:focus,.op-field textarea:focus{border-color:#b45309}
.op-field textarea{resize:vertical;min-height:60px}
.op-tcard{border:2px solid #e0e0db;border-radius:6px;padding:.72rem;cursor:pointer;text-align:center;transition:border-color .18s;background:#fff}
.op-tcard.sel{border-color:#b45309;background:#fff8f0}
.reg-card{border:1px solid #e5e5e0;border-radius:4px;padding:.8rem;background:#fff}
.reg-best{border-color:#b45309;background:#fff8f0}
.badge-ok{background:#dcfce7;color:#166534;padding:.12rem .4rem;border-radius:8px;font-size:.63rem;font-weight:700}
.badge-live{background:#dbeafe;color:#1e40af;padding:.12rem .4rem;border-radius:8px;font-size:.63rem;font-weight:700}
.badge-err{background:#fee2e2;color:#991b1b;padding:.12rem .4rem;border-radius:8px;font-size:.63rem;font-weight:700}
.lang-item{display:flex;align-items:center;gap:.4rem;padding:.3rem .5rem;border:1px solid #e8e4df;border-radius:3px;font-size:.73rem;cursor:pointer}
.lang-item input{accent-color:#b45309}
</style></head><body>
<aside class="sb">
  <div class="sb-logo">V35</div>
  <div class="sb-v">Admin Panel</div>
  <input id="slug-inp" class="sb-inp" placeholder="Slug du site (ex: auranova)" value="">
  <button class="sb-btn" onclick="loadSite()">Charger</button>
  <ul class="sb-nav" id="sb-nav">
    <li><a onclick="showTab('home')" id="n-home">🏠 Homepage</a></li>
    <li><a onclick="showTab('cols')" id="n-cols">📦 Collections</a></li>
    <li><a onclick="showTab('pages')" id="n-pages">📄 Toutes les pages</a></li>
    <li><a onclick="showTab('media')" id="n-media">🖼 Médias</a></li>
    <li><a onclick="showTab('promos')" id="n-promos">🏷 Codes promo</a></li>
    <li><a onclick="showTab('stats')" id="n-stats">📊 Analytics</a></li>
    <li><a onclick="showTab('bk')" id="n-bk">💾 Sauvegardes</a></li>
    <li style="margin-top:.6rem;border-top:1px solid #1a1a1a;padding-top:.6rem"><a onclick="showTab('op')" id="n-op" style="background:rgba(180,83,9,.15);color:#d97706;font-weight:700">⚡ Opération</a></li>
    <li style="margin-top:.3rem"><a onclick="showTab('orch')" id="n-orch" style="color:#7c3aed">🎯 Orchestrateur</a></li>
    <li style="margin-top:.3rem"><a onclick="showTab('bl')" id="n-bl" style="color:#0891b2">🔗 Backlinks</a></li>
    <li style="margin-top:.3rem"><a onclick="showTab('spot')" id="n-spot" style="color:#059669">📍 Spots</a></li>
  </ul>
  <div class="sb-sep" id="sb-sep" style="display:none"></div>
  <div class="sb-site" id="sb-site"></div>
</aside>
<main class="main" id="main">
  <div style="text-align:center;padding:5rem 2rem;color:#ccc">
    <div style="font:normal 2.2rem Georgia,serif;color:#ddd;margin-bottom:.8rem">V35 Admin</div>
    <div style="font-size:.82rem">Saisissez un slug dans la barre de gauche</div>
  </div>
</main>
<div class="toast" id="toast"></div>
<script>
var TOKEN='`+token+`', SLUG='', CUR_PAGE='', _html='';
var BASE=location.origin;
var OP_CFG={},_selTpl=1,_opUrls=[];
var LANGS=[['fr','Français'],['en','English'],['de','Deutsch'],['es','Español'],['it','Italiano'],['nl','Nederlands'],['pt','Português'],['pl','Polski'],['sv','Svenska'],['da','Dansk'],['fi','Suomi'],['no','Norsk'],['cs','Čeština'],['ro','Română'],['hu','Magyar'],['sk','Slovenčina'],['sl','Slovenščina'],['hr','Hrvatski'],['bg','Български'],['el','Ελληνικά']];

function toast(msg,good){var t=document.getElementById('toast');t.textContent=msg;t.style.background=good===false?'#dc2626':'#111';t.classList.add('show');setTimeout(function(){t.classList.remove('show')},3000);}

function apiFetch(path,opts){
  var headers={'Content-Type':'application/json','Authorization':'Bearer '+TOKEN};
  return fetch(BASE+path,{headers:headers,...(opts||{})});
}

function loadSite(){
  SLUG=(document.getElementById('slug-inp').value||'').trim();
  if(!SLUG){toast('Entrez un slug',false);return;}
  document.getElementById('sb-nav').style.display='block';
  document.getElementById('sb-sep').style.display='block';
  document.getElementById('sb-site').textContent='✦ '+SLUG;
  showTab('home');
}

function showTab(tab){
  ['home','cols','pages','media','promos','stats','bk','op','orch','bl','spot'].forEach(function(t){
    var el=document.getElementById('n-'+t);
    if(el)el.classList.toggle('act',t===tab);
  });
  if(tab==='home')renderHome();
  else if(tab==='cols')renderCols();
  else if(tab==='pages')renderPages();
  else if(tab==='media')renderMedia();
  else if(tab==='promos')renderPromos();
  else if(tab==='stats')renderStats();
  else if(tab==='bk')renderBk();
  else if(tab==='op')renderOperation();
  else if(tab==='orch')renderOrch();
  else if(tab==='bl')renderBacklinks();
  else if(tab==='spot')renderSpot();
}

/* ── HOMEPAGE ─────────────────────────────────────────── */
function renderHome(){
  set('<div class="hd"><h1>Homepage</h1><span class="slug-tag">'+SLUG+'</span></div><div id="hb"><span class="spin"></span> Chargement…</div>');
  apiFetch('/page?slug='+SLUG+'&path=/').then(function(r){return r.json();}).then(function(d){
    var h=d.content||'';
    var h1=(h.match(/<h1>([^<]*)<\/h1>/)||['',''])[1];
    var mt=(h.match(/<title>([^<]*)<\/title>/)||['',''])[1];
    var md=(h.match(/name="description" content="([^"]*)"/)||['',''])[1];
    var sub=(h.match(/<p[^>]*class="[^"]*hero[^"]*"[^>]*>([^<]{10,300})<\/p>/)||h.match(/class="hero[^"]*"[^>]*>.*?<p[^>]*>([^<]{10,300})<\/p>/s)||['',''])[1];
    document.getElementById('hb').innerHTML=
      '<div class="card"><div class="card-hd">Hero</div>'+
      '<div class="field"><label>Titre H1</label><input id="f-h1" value="'+esc(h1)+'"></div>'+
      '<div class="field"><label>Sous-titre</label><textarea id="f-sub">'+esc(sub)+'</textarea></div>'+
      '<div class="brow"><button class="btn bp" onclick="saveSection(\'h1\',document.getElementById(\'f-h1\').value)">Sauvegarder H1</button>'+
      '<button class="btn bg" onclick="aiText(\'h1\',\'f-h1\')">✨ IA</button></div></div>'+
      '<div class="card"><div class="card-hd">SEO Meta</div>'+
      '<div class="field"><label>Meta Title</label><input id="f-mt" value="'+esc(mt)+'"></div>'+
      '<div class="field"><label>Meta Description</label><textarea id="f-md">'+esc(md)+'</textarea></div>'+
      '<div class="brow"><button class="btn bp" onclick="saveMeta()">Sauvegarder SEO</button>'+
      '<button class="btn bg" onclick="aiText(\'meta_desc\',\'f-md\')">✨ IA</button></div></div>'+
      '<div class="card"><div class="card-hd">Image Hero</div>'+
      '<div class="field"><label>Prompt (optionnel)</label><input id="f-himg" placeholder="luxury jewellery flat lay white marble…"></div>'+
      '<div class="brow"><button class="btn bs" onclick="genImg(\'hero\',\'f-himg\')">🎨 Générer image AI</button></div>'+
      '<div id="img-res" style="margin-top:.8rem;font-size:.8rem"></div></div>';
  }).catch(function(){document.getElementById('hb').innerHTML='<p style="color:red">Page non trouvée.</p>';});
}

function saveSection(sec,val,path){
  apiFetch('/section',{method:'POST',body:JSON.stringify({slug:SLUG,path:path||'/',section:sec,value:val})})
  .then(function(r){return r.json();}).then(function(d){toast(d.ok?'Sauvegardé ✓':'Erreur: '+d.error,d.ok);});
}

function saveMeta(){
  var t=document.getElementById('f-mt').value,d2=document.getElementById('f-md').value;
  apiFetch('/section',{method:'POST',body:JSON.stringify({slug:SLUG,path:'/',section:'meta',value:{title:t,desc:d2}})})
  .then(function(r){return r.json();}).then(function(d){toast(d.ok?'SEO sauvegardé ✓':'Erreur: '+d.error,d.ok);});
}

function aiText(type,inputId){
  var el=document.getElementById(inputId);if(!el)return;
  var orig=el.value;el.disabled=true;el.style.opacity='.5';
  apiFetch('/ai-text',{method:'POST',body:JSON.stringify({slug:SLUG,type:type,text:orig,lang:'en'})})
  .then(function(r){return r.json();}).then(function(d){
    el.disabled=false;el.style.opacity='1';
    if(d.ok&&d.result){el.value=d.result;toast('Texte amélioré ✓');}
    else toast('Erreur IA: '+d.error,false);
  });
}

function genImg(type,promptId){
  var prompt=promptId?document.getElementById(promptId).value:'';
  var res=document.getElementById('img-res');
  if(res)res.innerHTML='<span class="spin"></span> Génération (20-40s)…';
  apiFetch('/generate-image',{method:'POST',body:JSON.stringify({slug:SLUG,type:type,prompt:prompt||undefined})})
  .then(function(r){return r.json();}).then(function(d){
    if(res)res.innerHTML=d.ok?'<span style="color:#15803d">✓ '+d.key+'</span>':'<span style="color:red">'+d.error+'</span>';
    toast(d.ok?'Image générée ✓':d.error,d.ok);
  });
}

/* ── COLLECTIONS ─────────────────────────────────────── */
function renderCols(){
  set('<div class="hd"><h1>Collections</h1><span class="slug-tag">'+SLUG+'</span></div><div id="cb"><span class="spin"></span></div>');
  apiFetch('/pages?slug='+SLUG).then(function(r){return r.json();}).then(function(d){
    var cols=(d.pages||[]).filter(function(p){return p.path.match(/^\/collections\/[^/]+\/$/);});
    if(!cols.length){document.getElementById('cb').innerHTML='<p class="empty">Aucune collection.</p>';return;}
    var h='<div class="grid2">';
    cols.forEach(function(c){
      var name=c.path.split('/')[2];
      h+='<div class="card"><div class="card-hd">'+name+'</div><p style="font-size:.75rem;color:#bbb;margin-bottom:.9rem">'+c.path+'</p>'+
        '<div class="brow"><button class="btn bo" onclick="editPage(\''+c.path+'\')">✏️ Éditer</button>'+
        '<button class="btn bg" onclick="aiPage(\''+c.path+'\')">✨ IA Améliorer</button></div></div>';
    });
    document.getElementById('cb').innerHTML=h+'</div>';
  });
}

/* ── ALL PAGES ────────────────────────────────────────── */
function renderPages(){
  set('<div class="hd"><h1>Pages</h1><span class="slug-tag">'+SLUG+'</span></div><div class="card"><div id="pl"><span class="spin"></span></div></div>');
  apiFetch('/pages?slug='+SLUG).then(function(r){return r.json();}).then(function(d){
    var pages=d.pages||[];
    var h='<div class="card-hd">'+pages.length+' pages</div><ul class="plist">';
    pages.forEach(function(p){
      h+='<li><span class="path">'+p.path+'</span><button class="btn bo" onclick="editPage(\''+p.path+'\')">Éditer</button></li>';
    });
    document.getElementById('pl').innerHTML=h+'</ul>';
  });
}

function editPage(path){
  CUR_PAGE=path;_html='';
  set('<a class="back" onclick="showTab(\'pages\')">← Retour</a>'+
    '<div class="hd"><h1>'+path+'</h1><span class="slug-tag">'+SLUG+'</span></div>'+
    '<div class="tnav"><button class="act" onclick="switchEd(\'sec\',this)">Sections</button>'+
    '<button onclick="switchEd(\'html\',this)">HTML brut</button></div>'+
    '<div id="ed-c"><span class="spin"></span></div>');
  apiFetch('/page?slug='+SLUG+'&path='+encodeURIComponent(path)).then(function(r){return r.json();}).then(function(d){
    _html=d.content||'';switchEd('sec',document.querySelector('.tnav button'));
  });
}

function switchEd(tab,btn){
  document.querySelectorAll('.tnav button').forEach(function(b){b.classList.remove('act')});
  if(btn)btn.classList.add('act');
  var h1=(_html.match(/<h1>([^<]*)<\/h1>/)||['',''])[1];
  var h2s=[];var m,re=/<h2[^>]*>([^<]*)<\/h2>/g;while((m=re.exec(_html))!==null)h2s.push(m[1]);
  if(tab==='html'){
    document.getElementById('ed-c').innerHTML='<div class="card"><textarea id="code-ed">'+esc(_html)+'</textarea>'+
      '<div class="brow" style="margin-top:.7rem"><button class="btn bp" onclick="saveHtml()">Sauvegarder</button></div></div>';
  } else {
    var s='<div class="card"><div class="card-hd">Titre H1</div>'+
      '<div class="field"><input id="ep-h1" value="'+esc(h1)+'"></div>'+
      '<div class="brow"><button class="btn bp" onclick="saveSection(\'h1\',document.getElementById(\'ep-h1\').value,CUR_PAGE)">Sauvegarder</button>'+
      '<button class="btn bg" onclick="aiText(\'h1\',\'ep-h1\')">✨ IA</button></div></div>';
    if(h2s.length){
      s+='<div class="card"><div class="card-hd">Titres H2</div>';
      h2s.forEach(function(t,i){s+='<div class="field"><input id="ep-h2-'+i+'" value="'+esc(t)+'"></div>';});
      s+='<div class="brow"><button class="btn bp" onclick="saveH2s()">Sauvegarder H2</button></div></div>';
    }
    s+='<div class="card"><div class="card-hd">Image IA</div>'+
      '<div class="field"><label>Type</label><select id="ep-itype"><option value="product">Produit</option><option value="collection">Collection</option><option value="lifestyle">Lifestyle</option></select></div>'+
      '<div class="field"><label>Prompt (optionnel)</label><input id="ep-ipr" placeholder="Auto…"></div>'+
      '<div class="brow"><button class="btn bs" onclick="genImg(document.getElementById(\'ep-itype\').value,\'ep-ipr\')">🎨 Générer image</button></div>'+
      '<div id="img-res" style="margin-top:.7rem;font-size:.8rem"></div></div>';
    document.getElementById('ed-c').innerHTML=s;
  }
}

function saveHtml(){
  var c=document.getElementById('code-ed').value;
  apiFetch('/save',{method:'POST',body:JSON.stringify({slug:SLUG,path:CUR_PAGE,content:c})})
  .then(function(r){return r.json();}).then(function(d){toast(d.ok?'Sauvegardé ✓':'Erreur: '+d.error,d.ok);});
}

function saveH2s(){
  var els=document.querySelectorAll('[id^="ep-h2-"]');
  var vals=Array.from(els).map(function(e){return e.value;});
  apiFetch('/section',{method:'POST',body:JSON.stringify({slug:SLUG,path:CUR_PAGE,section:'h2s',value:vals})})
  .then(function(r){return r.json();}).then(function(d){toast(d.ok?'H2 sauvegardés ✓':'Erreur: '+d.error,d.ok);});
}

function aiPage(path){
  toast('IA en cours…');
  apiFetch('/ai-page',{method:'POST',body:JSON.stringify({slug:SLUG,path:path||CUR_PAGE})})
  .then(function(r){return r.json();}).then(function(d){toast(d.ok?'Page améliorée ✓':'Erreur: '+d.error,d.ok);});
}

/* ── MEDIA ────────────────────────────────────────────── */
function renderMedia(){
  set('<div class="hd"><h1>Médias</h1><span class="slug-tag">'+SLUG+'</span></div>'+
    '<div class="card"><div class="card-hd">Générer une image IA</div>'+
    '<div class="grid2"><div class="field"><label>Type</label><select id="m-type"><option value="hero">Hero</option><option value="collection">Collection</option><option value="product">Produit</option><option value="lifestyle">Lifestyle</option></select></div>'+
    '<div class="field"><label>Niche</label><input id="m-niche" value="Jewellery"></div></div>'+
    '<div class="field"><label>Prompt personnalisé</label><input id="m-pr" placeholder="Optionnel — prompt auto sinon"></div>'+
    '<div class="brow"><button class="btn bp" onclick="genMedia()">🎨 Générer</button></div>'+
    '<div id="m-res" style="margin-top:.8rem;font-size:.8rem"></div></div>'+
    '<div class="card"><div class="card-hd">Images générées</div><div id="m-list"><span class="spin"></span></div></div>');
  loadMedia();
}

function loadMedia(){
  apiFetch('/media?slug='+SLUG).then(function(r){return r.json();}).then(function(d){
    if(!d.media||!d.media.length){document.getElementById('m-list').innerHTML='<p class="empty">Aucune image générée.</p>';return;}
    var h='<div class="mgrid">';
    d.media.forEach(function(m){
      var name=m.key.split('/').pop();
      h+='<div class="mcard"><div class="mcard-img">'+name+'</div><div class="mcard-info">'+Math.round(m.size/1024)+'KB</div></div>';
    });
    document.getElementById('m-list').innerHTML=h+'</div>';
  });
}

function genMedia(){
  document.getElementById('m-res').innerHTML='<span class="spin"></span> Génération (20-40s)…';
  var type=document.getElementById('m-type').value;
  var niche=document.getElementById('m-niche').value||'Jewellery';
  var prompt=document.getElementById('m-pr').value||undefined;
  apiFetch('/generate-image',{method:'POST',body:JSON.stringify({slug:SLUG,type:type,niche:niche,prompt:prompt})})
  .then(function(r){return r.json();}).then(function(d){
    document.getElementById('m-res').innerHTML=d.ok?'<span style="color:#15803d">✓ '+d.key+'</span>':'<span style="color:red">'+d.error+'</span>';
    if(d.ok){toast('Image générée ✓');loadMedia();}else toast(d.error,false);
  });
}

/* ── BACKUP ───────────────────────────────────────────── */
function renderBk(){
  set('<div class="hd"><h1>Sauvegardes</h1><span class="slug-tag">'+SLUG+'</span></div>'+
    '<div class="card"><div class="card-hd">Actions</div><div class="brow">'+
    '<button class="btn bp" onclick="createBk()">📦 Créer sauvegarde</button>'+
    '<button class="btn bg" onclick="window.open(BASE+\'/export?slug=\'+SLUG,\'_blank\')">⬇ Export JSON local</button></div></div>'+
    '<div class="card"><div class="card-hd">Historique</div><div id="bk-l"><span class="spin"></span></div></div>');
  loadBk();
}

function loadBk(){
  apiFetch('/backups?slug='+SLUG).then(function(r){return r.json();}).then(function(d){
    var bks=d.backups||[];
    if(!bks.length){document.getElementById('bk-l').innerHTML='<p class="empty">Aucune sauvegarde.</p>';return;}
    var h='<ul class="bklist">';
    bks.slice().reverse().forEach(function(dt){
      h+='<li><span class="bkdate">'+dt+'</span>'+
        '<div class="brow"><button class="btn bg" onclick="restoreBk(\''+dt+'\')">Restaurer</button></div></li>';
    });
    document.getElementById('bk-l').innerHTML=h+'</ul>';
  });
}

function createBk(){
  toast('Sauvegarde en cours…');
  apiFetch('/backup',{method:'POST',body:JSON.stringify({slug:SLUG})})
  .then(function(r){return r.json();}).then(function(d){
    toast(d.ok?'✓ Sauvegardé ('+d.pages+' pages)':'Erreur: '+d.error,d.ok);
    if(d.ok)loadBk();
  });
}

function restoreBk(dt){
  if(!confirm('Restaurer la sauvegarde du '+dt+' ?'))return;
  toast('Restauration…');
  apiFetch('/restore',{method:'POST',body:JSON.stringify({slug:SLUG,date:dt})})
  .then(function(r){return r.json();}).then(function(d){
    toast(d.ok?'✓ Restauré ('+d.restored+' pages)':'Erreur: '+d.error,d.ok);
  });
}

/* ── CODES PROMO ─────────────────────────────────────────── */
function renderPromos(){
  set('<div class="hd"><h1>Codes promo</h1><span class="slug-tag">'+SLUG+'</span></div>'+
  '<div class="card"><div class="card-hd">Créer un code</div>'+
  '<div class="grid2">'+
  '<div class="field"><label>Code (ex: SUMMER20)</label><input id="p-code" placeholder="NOVA10" style="text-transform:uppercase"></div>'+
  '<div class="field"><label>Type</label><select id="p-type" class="field input" style="width:100%;padding:.6rem .75rem;border:1px solid #e0e0db;border-radius:3px;font-size:.85rem"><option value="percent">% remise</option><option value="fixed">€ fixe</option></select></div>'+
  '<div class="field"><label>Valeur (ex: 10 = 10% ou 10€)</label><input id="p-val" type="number" min="1" placeholder="10"></div>'+
  '<div class="field"><label>Commande min. (0 = aucune)</label><input id="p-min" type="number" min="0" value="0" placeholder="0"></div>'+
  '<div class="field"><label>Utilisations max. (0 = illimitée)</label><input id="p-max" type="number" min="0" value="0" placeholder="0"></div>'+
  '<div class="field"><label>Expire le (vide = jamais)</label><input id="p-exp" type="date"></div>'+
  '</div>'+
  '<div class="brow"><button class="btn bp" onclick="createPromo()">Créer le code</button></div></div>'+
  '<div class="card"><div class="card-hd">Codes actifs</div><div id="promo-l"><span class="spin"></span></div></div>');
  loadPromos();
}

function loadPromos(){
  apiFetch('/promo/list?slug='+SLUG).then(function(r){return r.json();}).then(function(d){
    var promos=d.promos||[];
    if(!promos.length){document.getElementById('promo-l').innerHTML='<p class="empty">Aucun code promo.</p>';return;}
    var h='<table style="width:100%;border-collapse:collapse;font-size:.8rem">'+
      '<tr style="border-bottom:2px solid #e5e5e0"><th style="text-align:left;padding:.4rem .6rem;color:#888;font-size:.68rem;letter-spacing:.1em;text-transform:uppercase">Code</th>'+
      '<th style="text-align:left;padding:.4rem .6rem;color:#888;font-size:.68rem;text-transform:uppercase">Réduction</th>'+
      '<th style="text-align:left;padding:.4rem .6rem;color:#888;font-size:.68rem;text-transform:uppercase">Min.</th>'+
      '<th style="text-align:left;padding:.4rem .6rem;color:#888;font-size:.68rem;text-transform:uppercase">Utilisations</th>'+
      '<th style="text-align:left;padding:.4rem .6rem;color:#888;font-size:.68rem;text-transform:uppercase">Expire</th>'+
      '<th></th></tr>';
    promos.forEach(function(p){
      var badge=p.active?'<span style="background:#dcfce7;color:#15803d;padding:.15rem .45rem;border-radius:20px;font-size:.65rem;font-weight:700">ACTIF</span>':'<span style="background:#fef2f2;color:#dc2626;padding:.15rem .45rem;border-radius:20px;font-size:.65rem">INACTIF</span>';
      var disc=p.type==='percent'?p.value+'%':p.value+'€';
      var uses=p.maxUses>0?p.uses+'/'+p.maxUses:p.uses+' (illim.)';
      h+='<tr style="border-bottom:1px solid #f5f5f3">'+
        '<td style="padding:.55rem .6rem;font-family:monospace;font-weight:700;color:#111">'+esc(p.code)+'</td>'+
        '<td style="padding:.55rem .6rem;color:#b45309;font-weight:600">-'+disc+'</td>'+
        '<td style="padding:.55rem .6rem;color:#888">'+p.minOrder+'€</td>'+
        '<td style="padding:.55rem .6rem;color:#555">'+uses+'</td>'+
        '<td style="padding:.55rem .6rem;color:#888">'+(p.expiresAt?p.expiresAt.slice(0,10):'—')+'</td>'+
        '<td style="padding:.55rem .6rem"><button class="btn bd" style="padding:.3rem .6rem;font-size:.65rem" onclick="deletePromo(\''+esc(p.code)+'\')">Supprimer</button></td>'+
        '</tr>';
    });
    document.getElementById('promo-l').innerHTML=h+'</table>';
  });
}

function createPromo(){
  var code=(document.getElementById('p-code').value||'').trim().toUpperCase();
  var type=document.getElementById('p-type').value;
  var value=parseFloat(document.getElementById('p-val').value)||0;
  var minOrder=parseFloat(document.getElementById('p-min').value)||0;
  var maxUses=parseInt(document.getElementById('p-max').value)||0;
  var expiresAt=document.getElementById('p-exp').value||null;
  if(!code){toast('Code requis',false);return;}
  if(!value){toast('Valeur requise',false);return;}
  apiFetch('/promo/create',{method:'POST',body:JSON.stringify({slug:SLUG,code,type,value,minOrder,maxUses,expiresAt})})
  .then(function(r){return r.json();}).then(function(d){
    toast(d.ok?'Code "'+code+'" créé ✓':'Erreur: '+d.error,d.ok);
    if(d.ok){document.getElementById('p-code').value='';document.getElementById('p-val').value='';loadPromos();}
  });
}

/* ── ANALYTICS ───────────────────────────────────────────── */
function renderStats(){
  set('<div class="hd"><h1>Analytics</h1><span class="slug-tag">'+SLUG+'</span></div>'+
  '<div class="card"><div class="card-hd">Visites par jour (30 derniers jours)</div><div id="stats-l"><span class="spin"></span></div></div>'+
  '<div class="card"><div class="card-hd">Informations site</div><div id="stats-meta"><span class="spin"></span></div></div>');
  apiFetch('/analytics?slug='+SLUG).then(function(r){return r.json();}).then(function(d){
    var rows=d.days||[];
    if(!rows.length){document.getElementById('stats-l').innerHTML='<p class="empty">Aucune donnée disponible (les visites s\'accumulent progressivement).</p>';}
    else{
      var total=rows.reduce(function(s,r){return s+r.views},0);
      var h='<div style="margin-bottom:.8rem;font-size:.78rem;color:#888">Total: <strong style="color:#111">'+total+' visites</strong></div>';
      h+='<table style="width:100%;border-collapse:collapse;font-size:.8rem">';
      rows.forEach(function(r){
        var pct=Math.round((r.views/Math.max(...rows.map(function(x){return x.views})))*100);
        h+='<tr style="border-bottom:1px solid #f5f5f3"><td style="padding:.4rem .6rem;font-family:monospace;color:#555;width:110px">'+r.date+'</td>'+
           '<td style="padding:.4rem .6rem"><div style="background:var(--p,#b45309);height:10px;width:'+pct+'%;min-width:4px;border-radius:2px;opacity:.7"></div></td>'+
           '<td style="padding:.4rem .6rem;text-align:right;font-weight:600;color:#111;width:60px">'+r.views+'</td></tr>';
      });
      h+='</table>';
      document.getElementById('stats-l').innerHTML=h;
    }
    var m=d.meta||{};
    document.getElementById('stats-meta').innerHTML=
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem;font-size:.82rem">'+
      '<div style="padding:.6rem;background:#fafaf8;border-radius:3px"><div style="color:#aaa;font-size:.68rem;text-transform:uppercase;letter-spacing:.1em;margin-bottom:.25rem">Pages</div><strong>'+( m.pages||'—')+'</strong></div>'+
      '<div style="padding:.6rem;background:#fafaf8;border-radius:3px"><div style="color:#aaa;font-size:.68rem;text-transform:uppercase;letter-spacing:.1em;margin-bottom:.25rem">Niche</div><strong>'+(m.niche||'—')+'</strong></div>'+
      '<div style="padding:.6rem;background:#fafaf8;border-radius:3px"><div style="color:#aaa;font-size:.68rem;text-transform:uppercase;letter-spacing:.1em;margin-bottom:.25rem">Langue</div><strong>'+(m.lang||'—')+'</strong></div>'+
      '<div style="padding:.6rem;background:#fafaf8;border-radius:3px"><div style="color:#aaa;font-size:.68rem;text-transform:uppercase;letter-spacing:.1em;margin-bottom:.25rem">Déployé le</div><strong style="font-size:.75rem">'+(m.deployedAt?m.deployedAt.slice(0,10):'—')+'</strong></div>'+
      '</div>';
  }).catch(function(){document.getElementById('stats-l').innerHTML='<p style="color:red">Erreur</p>';});
}

function deletePromo(code){
  if(!confirm('Supprimer le code '+code+' ?'))return;
  apiFetch('/promo/delete',{method:'POST',body:JSON.stringify({slug:SLUG,code})})
  .then(function(r){return r.json();}).then(function(d){
    toast(d.ok?'Code supprimé ✓':'Erreur: '+d.error,d.ok);
    if(d.ok)loadPromos();
  });
}

/* ── ORCHESTRATEUR ────────────────────────────────────────── */
var _orchRunId=null,_orchPoll=null;
function renderOrch(){
  set('<div class="hd"><h1>🎯 Orchestrateur</h1><span class="slug-tag">'+SLUG+'</span></div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1.2rem;margin-bottom:1.5rem">'+
    '<div><label class="lbl">Niche</label><input id="orch-niche" class="inp" placeholder="Jewellery" value="Jewellery"></div>'+
    '<div><label class="lbl">Domaine (.fr)</label><input id="orch-domain" class="inp" placeholder="auranova.fr" value="auranova.fr"></div>'+
    '<div><label class="lbl">Zone ID Cloudflare (optionnel)</label><input id="orch-zone" class="inp" placeholder="laisser vide si pas encore de domaine"></div>'+
    '<div style="display:flex;align-items:flex-end"><button class="btn" onclick="startOrch()" style="background:#7c3aed;width:100%">🚀 Lancer pipeline complet</button></div>'+
    '</div>'+
    '<div id="orch-steps" style="display:none;margin-bottom:1.5rem">'+
    '<div style="font-size:.68rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#7c3aed;margin-bottom:.8rem">PIPELINE EN COURS</div>'+
    '<div id="orch-steps-list" style="display:flex;flex-direction:column;gap:.5rem"></div>'+
    '</div>'+
    '<div id="orch-result" style="margin-bottom:1.5rem"></div>'+
    '<div style="font-size:.68rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#888;margin-bottom:.8rem">HISTORIQUE (30 derniers)</div>'+
    '<div id="orch-hist"></div>');
  loadOrchHist();
}
function orchStepIcon(s){return s==='done'?'✅':s==='running'?'⏳':s==='failed'?'❌':'⬜';}
function orchStepLabel(n){return{factory_fr:'🇫🇷 Site FR',seo_assets:'🗺 Sitemap + robots.txt',dns_setup:'🌐 DNS 20 sous-domaines',factory_langs:'🌍 19 sites multilingues',ping_index:'📡 Ping Google/Bing',complete:'✅ Terminé'}[n]||n;}
function renderOrchSteps(steps){
  var h='';
  steps.forEach(function(s){
    var ic=orchStepIcon(s.status);
    var col=s.status==='done'?'#166534':s.status==='running'?'#92400e':s.status==='failed'?'#991b1b':'#64748b';
    var extra=s.error?'<div style="color:#ef4444;font-size:.7rem;margin-top:.2rem">'+s.error+'</div>':'';
    var res=s.result&&s.status==='done'?'<div style="color:#888;font-size:.7rem">'+JSON.stringify(s.result).slice(0,120)+'</div>':'';
    h+='<div style="display:flex;align-items:flex-start;gap:.6rem;padding:.5rem .7rem;background:#f8f7f5;border-radius:4px;border-left:3px solid '+col+'">'+
      '<span>'+ic+'</span><div><div style="font-size:.75rem;font-weight:600;color:'+col+'">'+orchStepLabel(s.name)+'</div>'+extra+res+'</div></div>';
  });
  document.getElementById('orch-steps-list').innerHTML=h;
}
function startOrch(){
  if(!SLUG){toast('Chargez un site d\'abord',false);return;}
  var niche=document.getElementById('orch-niche').value.trim()||'Jewellery';
  var domain=document.getElementById('orch-domain').value.trim();
  var zone=document.getElementById('orch-zone').value.trim()||null;
  if(!domain){toast('Domaine requis',false);return;}
  apiFetch('/orchestrator/run',{method:'POST',body:JSON.stringify({slug:SLUG,niche,domain,zone_id:zone})}).then(function(r){return r.json();}).then(function(d){
    if(d.ok===false){toast('Erreur: '+(d.error||'?'),false);return;}
    _orchRunId=d.runId;
    document.getElementById('orch-steps').style.display='block';
    renderOrchSteps(d.state.steps);
    if(d.status!=='complete'&&d.status!=='failed')pollOrch();
    else orchDone(d.state);
  });
}
function pollOrch(){
  if(_orchPoll)clearInterval(_orchPoll);
  _orchPoll=setInterval(function(){
    if(!_orchRunId)return;
    apiFetch('/orchestrator/next',{method:'POST',body:JSON.stringify({runId:_orchRunId})}).then(function(r){return r.json();}).then(function(d){
      if(!d.runId)return;
      renderOrchSteps(d.state.steps);
      if(d.status==='complete'||d.status==='failed'){clearInterval(_orchPoll);orchDone(d.state);}
    });
  },4000);
}
function orchDone(state){
  var ok=state.status==='complete';
  document.getElementById('orch-result').innerHTML='<div style="padding:1rem;background:'+(ok?'#dcfce7':'#fee2e2')+';border-radius:6px;font-size:.8rem;color:'+(ok?'#166534':'#991b1b')+'">'+
    (ok?'🎉 Pipeline terminé avec succès — site live : <a href="https://www.'+state.domain+'" target="_blank">www.'+state.domain+'</a>':'❌ Pipeline échoué — vérifiez les étapes en rouge')+
    '</div>';
  loadOrchHist();
}
function loadOrchHist(){
  apiFetch('/orchestrator/runs').then(function(r){return r.json();}).then(function(d){
    var runs=d.runs||[];
    var h=runs.length?'<div style="display:flex;flex-direction:column;gap:.4rem">'+runs.map(function(r){
      var col=r.status==='complete'?'#166534':r.status==='failed'?'#991b1b':'#92400e';
      var pct=Math.round((r.currentStep||0)/6*100);
      return '<div style="display:flex;align-items:center;gap:.7rem;padding:.45rem .7rem;background:#f8f7f5;border-radius:4px;cursor:pointer" onclick="loadOrchRun(\''+r.runId+'\')">'+
        '<span style="font-size:.7rem;color:'+col+';font-weight:700">'+r.status.toUpperCase()+'</span>'+
        '<span style="flex:1;font-size:.73rem;color:#333">'+r.domain+' <span style="color:#888">·</span> '+r.niche+'</span>'+
        '<div style="width:80px;height:4px;background:#e2e8f0;border-radius:2px"><div style="width:'+pct+'%;height:100%;background:'+col+';border-radius:2px"></div></div>'+
        '<span style="font-size:.68rem;color:#aaa">'+new Date(r.startedAt).toLocaleString('fr-FR',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})+'</span>'+
        '</div>';
    }).join('')+'</div>':'<div style="color:#aaa;font-size:.8rem">Aucun pipeline lancé</div>';
    var el=document.getElementById('orch-hist');
    if(el)el.innerHTML=h;
  }).catch(function(){});
}
function loadOrchRun(runId){
  apiFetch('/orchestrator/run/'+runId).then(function(r){return r.json();}).then(function(d){
    if(!d.runId)return;
    _orchRunId=runId;
    document.getElementById('orch-steps').style.display='block';
    renderOrchSteps(d.steps);
  });
}

/* ── BACKLINKS ────────────────────────────────────────────── */
var BL_CATS=['blog','annuaire','forum','social','pbn','presse','partenaire'];
function renderBacklinks(){
  set('<div class="hd"><h1>🔗 Backlinks</h1><span class="slug-tag">'+SLUG+'</span></div>'+
    // ── Dashboard pace + diversité ──
    '<div id="bl-dash" style="display:grid;grid-template-columns:repeat(4,1fr);gap:.6rem;margin-bottom:1.2rem"></div>'+
    // ── Suivi backlinks ──
    '<div style="font-size:.68rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#0891b2;margin-bottom:.8rem">SUIVI BACKLINKS</div>'+
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:.6rem;margin-bottom:1rem">'+
    '<div><label class="lbl">Domaine source</label><input id="bl-domain" class="inp" placeholder="exemple.com"></div>'+
    '<div><label class="lbl">URL exacte</label><input id="bl-url" class="inp" placeholder="https://exemple.com/article/"></div>'+
    '<div><label class="lbl">Ancre</label><input id="bl-anchor" class="inp" placeholder="bijoux or 18k"></div>'+
    '<div><label class="lbl">URL cible (notre site)</label><input id="bl-target" class="inp" placeholder="/collections/bagues/"></div>'+
    '<div><label class="lbl">Type</label><select id="bl-type" class="inp"><option value="blog">Blog (40%)</option><option value="forum">Forum (30%)</option><option value="profile">Profil/Annuaire (20%)</option><option value="guestbook">Guestbook (10%)</option></select></div>'+
    '<div><label class="lbl">Follow</label><select id="bl-follow" class="inp"><option value="dofollow">Dofollow</option><option value="nofollow">Nofollow</option></select></div>'+
    '<div><label class="lbl">DR (>25)</label><input id="bl-dr" class="inp" type="number" min="0" max="100" placeholder="35"></div>'+
    '<div><label class="lbl">TF (>15) / OBL (<50)</label><div style="display:flex;gap:.3rem"><input id="bl-tf" class="inp" type="number" placeholder="TF" style="flex:1"><input id="bl-obl" class="inp" type="number" placeholder="OBL" style="flex:1"></div></div>'+
    '</div>'+
    '<div style="display:flex;gap:.6rem;margin-bottom:1.5rem">'+
    '<button class="btn" onclick="addBacklink()" style="background:#0891b2">+ Ajouter backlink</button>'+
    '<button class="btn bo" onclick="pingGoogleBL()">📡 Ping Google indexation</button>'+
    '</div>'+
    '<div id="bl-list" style="margin-bottom:2rem"></div>'+
    // ── Générateur commentaires blog ──
    '<div style="border-top:2px solid #e8e4df;padding-top:1.5rem;margin-top:.5rem">'+
    '<div style="font-size:.68rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#7c3aed;margin-bottom:.8rem">📝 GÉNÉRATEUR COMMENTAIRES BLOG (format Wix/tiptap)</div>'+
    '<div style="font-size:.72rem;color:#888;margin-bottom:.8rem;line-height:1.5">'+
    'Coller le tableau <b>url_article | url_boutique</b> (une ligne par paire, séparés par <code>|</code>).<br>'+
    'Probabilités longueur : 100w×25% · 150w×25% · 200w×25% · 250w×12.5% · 300w×6.25% · 350w×3.125% · 400w×3.125%<br>'+
    'Ancres : 50% non-optimisée · 35% semi-optimisée · 15% optimisée'+
    '</div>'+
    '<textarea id="bl-comment-input" class="inp" rows="8" style="width:100%;font-size:.72rem;font-family:monospace" placeholder="https://blog.exemple.com/article-bijoux/ | https://www.ma-boutique.fr/&#10;https://blog.exemple.com/article-mode/ | https://www.autre-boutique.fr/"></textarea>'+
    '<div style="display:flex;gap:.6rem;margin-top:.8rem;align-items:center">'+
    '<button class="btn" onclick="genComments()" style="background:#7c3aed" id="bl-gen-btn">🤖 Générer les commentaires</button>'+
    '<span id="bl-gen-progress" style="font-size:.72rem;color:#888"></span>'+
    '</div>'+
    '<div id="bl-gen-results" style="margin-top:1rem"></div>'+
    '</div>');
  loadBL();loadBLDash();
}

// ── Dashboard pace + diversité ────────────────────────────────────────────
function loadBLDash(){
  if(!SLUG)return;
  apiFetch('/backlinks?slug='+SLUG).then(function(r){return r.json();}).then(function(d){
    var links=(d.links||[]).filter(function(l){return l.status==='active';});
    var el=document.getElementById('bl-dash');if(!el)return;
    var today=new Date().toISOString().split('T')[0];
    var wStart=new Date();wStart.setDate(wStart.getDate()-wStart.getDay());var wStr=wStart.toISOString().split('T')[0];
    var mStr=today.slice(0,7);
    var todayN=links.filter(function(l){return l.liveAt===today;}).length;
    var weekN=links.filter(function(l){return l.liveAt&&l.liveAt>=wStr;}).length;
    var monthN=links.filter(function(l){return l.liveAt&&l.liveAt.startsWith(mStr);}).length;
    var types={blog:0,forum:0,profile:0,guestbook:0};
    links.forEach(function(l){if(types[l.link_type]!==undefined)types[l.link_type]++;});
    var dof=links.filter(function(l){return l.follow_type!=='nofollow';}).length;
    var nof=links.length-dof;
    var paceCol=todayN>=7?'#ef4444':todayN>=5?'#f59e0b':'#166534';
    el.innerHTML=[
      {v:todayN+'/7',l:'Aujourd\'hui',c:paceCol},
      {v:weekN,l:'Cette semaine',c:'#0891b2'},
      {v:monthN,l:'Ce mois',c:'#7c3aed'},
      {v:dof+'df / '+nof+'nf',l:'Do/Nofollow',c:dof>nof?'#166534':'#0891b2'},
    ].map(function(x){
      return '<div style="background:#f8f7f5;border-radius:6px;padding:.6rem .8rem;text-align:center">'+
        '<div style="font-size:1.1rem;font-weight:700;color:'+x.c+'">'+x.v+'</div>'+
        '<div style="font-size:.62rem;color:#888;margin-top:.1rem">'+x.l+'</div></div>';
    }).join('')+
    '<div style="background:#f8f7f5;border-radius:6px;padding:.6rem .8rem;grid-column:span 4">'+
    '<div style="font-size:.6rem;font-weight:700;color:#888;margin-bottom:.3rem;letter-spacing:.1em">MIX TYPES (cible: 40/30/20/10)</div>'+
    '<div style="display:flex;gap:.4rem;align-items:center">'+
    ['blog','forum','profile','guestbook'].map(function(t,i){
      var target=[40,30,20,10][i];var n=types[t];var pct=links.length?Math.round(n/links.length*100):0;
      var col=Math.abs(pct-target)<=5?'#166534':Math.abs(pct-target)<=15?'#f59e0b':'#ef4444';
      return '<span style="font-size:.65rem;padding:.1rem .4rem;border-radius:8px;background:'+col+';color:#fff">'+t+' '+pct+'%</span>';
    }).join('')+
    '</div></div>';
  }).catch(function(){});
}

// ── Générateur commentaires ──────────────────────────────────────────────
var _blResults=[];
var BL_WORD_RANGE={blog:{min:100,max:400},forum:{min:50,max:100},profile:{min:30,max:60},guestbook:{min:50,max:100}};
function blWordCount(type){
  if(type&&BL_WORD_RANGE[type]){var rng=BL_WORD_RANGE[type];return rng.min+Math.floor(Math.random()*(rng.max-rng.min+1));}
  var r=Math.random()*120;
  if(r<25)return 100;if(r<50)return 150;if(r<75)return 200;if(r<90)return 250;if(r<100)return 300;if(r<107.5)return 350;return 400;
}
function blAnchorType(){
  var r=Math.random();
  if(r<0.50)return'non-optimisée';if(r<0.85)return'semi-optimisée';return'optimisée';
}
function genComments(){
  var raw=document.getElementById('bl-comment-input').value.trim();
  if(!raw){toast('Coller le tableau d\'abord',false);return;}
  var rows=raw.split('\n').map(function(l){var p=l.split('|');return{blog:(p[0]||'').trim(),boutique:(p[1]||'').trim(),type:(p[2]||'').trim()||null};}).filter(function(r){return r.blog&&r.boutique;});
  if(!rows.length){toast('Format incorrect — séparer blog|boutique par |',false);return;}
  _blResults=[];
  document.getElementById('bl-gen-btn').disabled=true;
  document.getElementById('bl-gen-results').innerHTML='';
  processBlRow(rows,0);
}
function processBlRow(rows,idx){
  if(idx>=rows.length){blGenDone(rows.length);return;}
  var r=rows[idx];
  var linkType=r.type||document.getElementById('bl-type').value||'blog';
  var wc=blWordCount(linkType);
  var at=blAnchorType();
  var nofollow=Math.random()<0.4;
  document.getElementById('bl-gen-progress').textContent=(idx+1)+'/'+rows.length+' — '+wc+' mots · ancre '+at+(nofollow?' · nofollow':'');
  apiFetch('/backlinks/generate-comment',{method:'POST',body:JSON.stringify({blog_url:r.blog,boutique_url:r.boutique,word_count:wc,anchor_type:at,link_type:linkType,nofollow})})
    .then(function(res){return res.json();})
    .then(function(d){
      if(d.ok&&d.comment_html){_blResults.push({blog_url:r.blog,boutique_url:r.boutique,word_count:wc,anchor_type:at,comment_html:d.comment_html});}
      else{_blResults.push({blog_url:r.blog,boutique_url:r.boutique,error:d.error||'?'});}
      setTimeout(function(){processBlRow(rows,idx+1);},200);
    })
    .catch(function(e){
      _blResults.push({blog_url:r.blog,boutique_url:r.boutique,error:e.message});
      setTimeout(function(){processBlRow(rows,idx+1);},200);
    });
}
function blGenDone(total){
  document.getElementById('bl-gen-btn').disabled=false;
  document.getElementById('bl-gen-progress').textContent='✅ '+total+' commentaires générés';
  var ok=_blResults.filter(function(r){return r.comment_html;}).length;
  var json=JSON.stringify(_blResults,null,2);
  document.getElementById('bl-gen-results').innerHTML=
    '<div style="font-size:.72rem;color:#166534;margin-bottom:.6rem">'+ok+'/'+total+' réussis</div>'+
    '<div style="display:flex;gap:.6rem;margin-bottom:.8rem">'+
    '<button class="btn" onclick="blDownloadJSON()" style="background:#166534;font-size:.72rem">⬇ Télécharger JSON</button>'+
    '<button class="btn bo" onclick="blCopyJSON()" style="font-size:.72rem">📋 Copier JSON</button>'+
    '</div>'+
    '<div style="display:flex;flex-direction:column;gap:.5rem">'+
    _blResults.slice(0,5).map(function(r){
      return '<div style="padding:.5rem .7rem;background:#f8f7f5;border-radius:4px;font-size:.68rem">'+
        '<div style="color:#888;margin-bottom:.2rem">'+r.blog_url+'</div>'+
        (r.comment_html?'<div style="color:#166534">✅ '+r.word_count+'m · '+r.anchor_type+'</div>':'<div style="color:#ef4444">❌ '+r.error+'</div>')+
        '</div>';
    }).join('')+
    (total>5?'<div style="font-size:.68rem;color:#aaa;padding:.3rem">'+(total-5)+' autres...</div>':'')+
    '</div>';
}
function blDownloadJSON(){
  var b=new Blob([JSON.stringify(_blResults,null,2)],{type:'application/json'});
  var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='commentaires-backlinks.json';a.click();
}
function blCopyJSON(){
  navigator.clipboard.writeText(JSON.stringify(_blResults,null,2)).then(function(){toast('JSON copié ✓',true);});
}
function loadBL(){
  if(!SLUG)return;
  apiFetch('/backlinks?slug='+SLUG).then(function(r){return r.json();}).then(function(d){
    var links=d.links||[];
    var el=document.getElementById('bl-list');if(!el)return;
    if(!links.length){el.innerHTML='<div style="color:#aaa;font-size:.8rem">Aucun backlink enregistré</div>';return;}
    var statCol={pending:'#92400e',active:'#166534',rejected:'#991b1b',requested:'#1d4ed8'};
    var typeCol={blog:'#7c3aed',forum:'#0891b2',profile:'#d97706',guestbook:'#059669'};
    el.innerHTML='<div style="font-size:.68rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#888;margin-bottom:.6rem">'+links.length+' BACKLINKS</div>'+
      '<div style="display:flex;flex-direction:column;gap:.4rem">'+links.map(function(l){
        var tc=typeCol[l.link_type]||'#888';
        var dr_ok=!l.dr||l.dr>=25;var tf_ok=!l.tf||l.tf>=15;var obl_ok=!l.obl||l.obl<50;
        var qual=(dr_ok&&tf_ok&&obl_ok)?'✓':'⚠';
        return '<div style="display:flex;align-items:center;gap:.5rem;padding:.5rem .7rem;background:#f8f7f5;border-radius:4px;flex-wrap:wrap">'+
          '<span style="font-size:.6rem;font-weight:700;padding:.1rem .4rem;border-radius:8px;background:'+statCol[l.status]+';color:#fff">'+l.status.toUpperCase()+'</span>'+
          (l.link_type?'<span style="font-size:.6rem;padding:.1rem .4rem;border-radius:8px;background:'+tc+';color:#fff">'+l.link_type+'</span>':'')+
          (l.follow_type?'<span style="font-size:.6rem;padding:.1rem .4rem;border-radius:8px;background:#e8e4df;color:#555">'+l.follow_type+'</span>':'')+
          (l.dr?'<span style="font-size:.6rem;color:'+(dr_ok?'#166534':'#ef4444')+'" title="DR/TF/OBL">'+qual+' DR'+l.dr+(l.tf?'/TF'+l.tf:'')+(l.obl?'/OBL'+l.obl:'')+'</span>':'')+
          '<span style="flex:1;font-size:.73rem;color:#333;min-width:0"><b>'+l.domain+'</b> <span style="color:#888">→</span> '+l.target+'</span>'+
          '<span style="font-size:.68rem;color:#666;font-style:italic;white-space:nowrap">'+l.anchor+'</span>'+
          '<select onchange="updateBLStatus(\''+l.id+'\',this.value)" style="font-size:.68rem;padding:.1rem .3rem;border:1px solid #ddd;border-radius:3px">'+
            ['pending','requested','active','rejected'].map(function(s){return '<option '+(s===l.status?'selected':'')+'>'+s+'</option>';}).join('')+
          '</select>'+
          '<button onclick="delBL(\''+l.id+'\')" style="background:none;border:none;cursor:pointer;color:#ccc;font-size:.8rem">✕</button>'+
          '</div>';
      }).join('')+'</div>';
  }).catch(function(){});
}
function addBacklink(){
  var dom=document.getElementById('bl-domain').value.trim();
  var url=document.getElementById('bl-url').value.trim();
  var anc=document.getElementById('bl-anchor').value.trim();
  var tgt=document.getElementById('bl-target').value.trim();
  var ltype=document.getElementById('bl-type').value;
  var ftype=document.getElementById('bl-follow').value;
  var dr=parseInt(document.getElementById('bl-dr').value)||0;
  var tf=parseInt(document.getElementById('bl-tf').value)||0;
  var obl=parseInt(document.getElementById('bl-obl').value)||0;
  if(!dom||!anc){toast('Domaine et ancre requis',false);return;}
  apiFetch('/backlinks',{method:'POST',body:JSON.stringify({slug:SLUG,domain:dom,url,anchor:anc,target:tgt||'/',link_type:ltype,follow_type:ftype,dr,tf,obl})}).then(function(r){return r.json();}).then(function(d){
    if(d.ok){loadBL();loadBLDash();}else toast('Erreur: '+(d.error||'?'),false);
  });
}
function updateBLStatus(id,status){
  apiFetch('/backlinks/update',{method:'POST',body:JSON.stringify({slug:SLUG,id,status})}).then(function(r){return r.json();}).then(function(d){if(d.ok)loadBL();});
}
function delBL(id){
  apiFetch('/backlinks/update',{method:'POST',body:JSON.stringify({slug:SLUG,id,deleted:true})}).then(function(r){return r.json();}).then(function(d){if(d.ok)loadBL();});
}
function pingGoogleBL(){
  apiFetch('/backlinks/ping',{method:'POST',body:JSON.stringify({slug:SLUG})}).then(function(r){return r.json();}).then(function(d){toast(d.ok?'Ping envoyé ✓ (google:'+d.google+', bing:'+d.bing+')':'Erreur: '+(d.error||'?'),d.ok);});
}

/* ── SPOTS ────────────────────────────────────────────────── */
var SPOT_TYPE_COL={blog:'#7c3aed',forum:'#0891b2',profile:'#d97706',guestbook:'#059669'};
// Catégories TSV → type spot + needs_account
var SPOT_CAT_MAP={'Blog':{type:'blog',na:false},'Forum':{type:'forum',na:true},'Annuaire':{type:'profile',na:false},'Profil':{type:'profile',na:true},'Gov':{type:'blog',na:false},'Média':{type:'blog',na:false},'Wiki':{type:'guestbook',na:true},'Agrégateur':{type:'profile',na:false}};
function spotCatMap(raw){for(var k in SPOT_CAT_MAP){if(raw.indexOf(k)>=0)return SPOT_CAT_MAP[k];}return{type:'blog',na:false};}
function spotAvailable(s){
  if(s.status==='blacklist')return false;
  if(!s.last_used)return true;
  var diff=Math.floor((Date.now()-new Date(s.last_used).getTime())/86400000);
  return diff>=(s.cooldown||30);
}
function spotCooldownLeft(s){
  if(!s.last_used)return 0;
  var diff=Math.floor((Date.now()-new Date(s.last_used).getTime())/86400000);
  return Math.max(0,(s.cooldown||30)-diff);
}
// Dorks embarqués — focus dofollow direct (pas de compte requis)
var SPOT_DORKS=[
  // ── AUTO-APPROVE DOFOLLOW ──
  ['*','auto_approve','"Enable CommentLuv" site:.fr','CommentLuv = dofollow garanti'],
  ['*','auto_approve','"KeywordLuv" site:.fr','KeywordLuv = dofollow + ancre riche'],
  ['*','auto_approve','"Powered by BlogEngine.NET" "[votre niche]"','Auto-approve, remplacer [votre niche]'],
  ['*','auto_approve','"livre d\'or" site:.fr -"fermé" -"login"','Livres d\'or ouverts = dofollow'],
  ['*','auto_approve','inurl:guestbook "[votre niche]" site:.fr -"login required"','Guestbooks ouverts'],
  // ── BLOG COMMENTAIRES (dofollow possible) ──
  ['*','blog','"laisser un commentaire" "[votre niche]" -"commentaires fermés" site:.fr','Blogs FR ouverts'],
  ['*','blog','"Enable CommentLuv" "[votre niche]" site:.fr','CommentLuv par niche'],
  ['*','blog','"votre commentaire" "[votre niche]" site:.fr -nofollow','Exclure nofollow explicitement'],
  ['*','blog','inurl:wp-comments-post "[votre niche]" site:.fr','WordPress commentaires ouverts'],
  ['*','blog','inurl:/2024/ "[votre niche]" "laisser un commentaire" site:.fr','Articles récents 2024'],
  // ── ANNUAIRES DOFOLLOW ──
  ['*','annuaire','inurl:annuaire "ajouter site" site:.fr -"connexion"','Annuaires gratuits sans compte'],
  ['*','annuaire','"annuaire gratuit" "soumettre" site:.fr','Soumission directe'],
  ['*','annuaire','"référencer gratuitement" site:.fr','Référencement gratuit'],
  ['*','annuaire','"ajouter votre site" inurl:annuaire site:.fr','Formulaire d\'ajout direct'],
  // ── NINJA (partenaires/ressources) ──
  ['*','ninja','"[votre niche]" inurl:partenaires -"connexion requise" site:.fr','Pages partenaires ouvertes'],
  ['*','ninja','"[votre niche]" inurl:liens-utiles site:.fr','Pages ressources'],
  ['*','ninja','"[votre niche]" inurl:ressources "lien" site:.fr','Annuaires ressources'],
  // ── FORUMS (compte requis mais dofollow phpBB) ──
  ['*','forum','"Powered by phpBB" "[votre niche]" site:.fr inurl:viewtopic','phpBB — profil dofollow'],
  ['*','forum','"Powered by SMF" "[votre niche]" site:.fr','SMF — signature dofollow'],
  // ── NICHE MAISON ──
  ['maison','blog','"laisser un commentaire" "décoration" -"commentaires fermés" site:.fr','Blog déco FR'],
  ['maison','blog','"Enable CommentLuv" "déco" site:.fr','CommentLuv déco'],
  ['maison','ninja','"maison" "livre d\'or" site:.fr -"fermé"','Livres d\'or maison'],
  ['maison','annuaire','inurl:annuaire "ajouter site" "maison" OR "déco" site:.fr','Annuaire maison'],
  // ── NICHE MODE/BIJOUX ──
  ['mode','blog','"laisser un commentaire" "bijoux" -"fermés" site:.fr','Blog bijoux'],
  ['mode','blog','"Enable CommentLuv" "bijoux" site:.fr','CommentLuv bijoux'],
  ['mode','ninja','"bijoux" "livre d\'or" -"fermé" site:.fr','Livres d\'or bijoux'],
  ['mode','annuaire','inurl:annuaire "mode" "ajouter" site:.fr','Annuaire mode'],
  // ── NICHE BIEN-ÊTRE ──
  ['bienetre','blog','"laisser un commentaire" "bien-être" -"fermé" site:.fr','Blog bien-être'],
  ['bienetre','blog','"Enable CommentLuv" "zen" site:.fr','CommentLuv zen'],
  ['bienetre','ninja','"bien-être" inurl:partenaires site:.fr','Partenaires bien-être'],
  // ── NICHE ANIMAUX ──
  ['animaux','blog','"laisser un commentaire" "chat" -"connecté" -"fermé" site:.fr','Blog animaux'],
  ['animaux','ninja','"animaux" "livre d\'or" -"fermé" site:.fr','Livres d\'or animaux'],
  // ── NICHE SPORT ──
  ['sport','blog','"laisser un commentaire" "sport" -"fermé" site:.fr','Blog sport'],
  ['sport','blog','"Enable CommentLuv" "musculation" site:.fr','CommentLuv sport'],
  // ── NICHE CULTURE/MANGA ──
  ['culture','blog','"laisser un commentaire" "manga" -"fermé" site:.fr','Blog manga'],
  ['culture','ninja','"manga" inurl:partenaires site:.fr','Partenaires manga'],
  // ── PROFILS WEB 2.0 (compte requis) ──
  ['*','profil','"[votre niche]" site:wixsite.com -"connexion"','Wix profiles — lien bio'],
  ['*','profil','"[votre niche]" site:e-monsite.com inurl:annuaire','e-monsite annuaire'],
  ['*','profil','"[votre niche]" site:odoo.com','Odoo pages'],
  ['*','profil','"[votre niche]" site:canva.site','Canva sites'],
];
var _spTab='list';
function renderSpot(){
  set('<div class="hd"><h1>📍 Spots</h1><span class="slug-tag">'+SLUG+'</span></div>'+
    '<div style="display:flex;gap:.4rem;margin-bottom:1.2rem;border-bottom:2px solid #e8e4df;padding-bottom:.8rem">'+
    '<button class="op-tb act" id="spt-list" onclick="spTab(\'list\',this)">📍 Liste</button>'+
    '<button class="op-tb" id="spt-add" onclick="spTab(\'add\',this)">➕ Ajouter</button>'+
    '<button class="op-tb" id="spt-import" onclick="spTab(\'import\',this)">📥 Import TSV</button>'+
    '<button class="op-tb" id="spt-dorks" onclick="spTab(\'dorks\',this)">🔍 Dorks</button>'+
    '</div><div id="sp-body"><span class="spin"></span></div>');
  spTab('list',document.getElementById('spt-list'));
}
function spTab(t,btn){
  _spTab=t;
  document.querySelectorAll('.op-tb[id^="spt-"]').forEach(function(b){b.classList.remove('act');});
  if(btn)btn.classList.add('act');
  var b=document.getElementById('sp-body');
  if(t==='list')spRenderList(b);
  else if(t==='add')spRenderAdd(b);
  else if(t==='import')spRenderImport(b);
  else spRenderDorks(b);
}
function spRenderList(b){
  b.innerHTML='<div id="spot-dash" style="display:grid;grid-template-columns:repeat(4,1fr);gap:.6rem;margin-bottom:1rem"></div>'+
    '<div style="display:flex;gap:.6rem;margin-bottom:1rem;flex-wrap:wrap">'+
    '<select id="sp-filter" class="inp" style="width:auto;font-size:.72rem" onchange="loadSpots()">'+
    '<option value="all">Tous les spots</option>'+
    '<option value="available">Disponibles</option>'+
    '<option value="dofollow_direct">🟢 Dofollow sans compte</option>'+
    '<option value="account">🔑 Nécessite compte</option>'+
    '<option value="cooldown">En cooldown</option>'+
    '<option value="blacklist">Blacklist</option>'+
    '</select>'+
    '<select id="sp-type-filter" class="inp" style="width:auto;font-size:.72rem" onchange="loadSpots()">'+
    '<option value="all">Tous types</option>'+
    '<option value="blog">Blog</option><option value="forum">Forum</option>'+
    '<option value="profile">Profil/Annuaire</option><option value="guestbook">Guestbook</option>'+
    '</select></div>'+
    '<div id="spot-list"></div>';
  loadSpots();
}
function spRenderAdd(b){
  b.innerHTML='<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:.6rem;margin-bottom:.8rem">'+
    '<div><label class="lbl">Domaine</label><input id="sp-domain" class="inp" placeholder="exemple.com"></div>'+
    '<div><label class="lbl">URL page cible</label><input id="sp-url" class="inp" placeholder="https://exemple.com/article/"></div>'+
    '<div><label class="lbl">Type</label><select id="sp-type" class="inp"><option value="blog">Blog</option><option value="forum">Forum</option><option value="profile">Profil/Annuaire</option><option value="guestbook">Guestbook</option></select></div>'+
    '<div><label class="lbl">Niche</label><input id="sp-niche" class="inp" placeholder="mode, maison…"></div>'+
    '<div><label class="lbl">Cooldown (jours)</label><input id="sp-cooldown" class="inp" type="number" value="30"></div>'+
    '<div><label class="lbl">DR</label><input id="sp-dr" class="inp" type="number" placeholder="35"></div>'+
    '<div><label class="lbl">TF / OBL</label><div style="display:flex;gap:.3rem"><input id="sp-tf" class="inp" type="number" placeholder="TF" style="flex:1"><input id="sp-obl" class="inp" type="number" placeholder="OBL" style="flex:1"></div></div>'+
    '<div><label class="lbl">Notes / Action</label><input id="sp-notes" class="inp" placeholder="Commentaire libre, soumettre URL…"></div>'+
    '</div>'+
    '<div style="display:flex;gap:1rem;align-items:center;margin-bottom:1rem">'+
    '<label style="display:flex;align-items:center;gap:.4rem;font-size:.75rem"><input type="checkbox" id="sp-dofollow"> 🟢 Dofollow</label>'+
    '<label style="display:flex;align-items:center;gap:.4rem;font-size:.75rem"><input type="checkbox" id="sp-needs-acc"> 🔑 Compte requis</label>'+
    '</div>'+
    '<button class="btn" onclick="addSpot()" style="background:#059669">+ Ajouter spot</button>';
}
function spRenderImport(b){
  b.innerHTML='<div style="font-size:.72rem;color:#888;margin-bottom:.8rem;line-height:1.6">'+
    'Coller le contenu TSV de <b>SPOTS_ACTIONNABLES_FINAL.tsv</b> ci-dessous.<br>'+
    'Colonnes attendues : # | Domaine | Catégorie | Niche | Score | Dofollow | Effort | Action | URL Exemple | Statut'+
    '</div>'+
    '<textarea id="sp-tsv" class="inp" rows="12" style="width:100%;font-family:monospace;font-size:.68rem" placeholder="Coller le TSV ici…"></textarea>'+
    '<div style="display:flex;gap:.6rem;margin-top:.8rem;align-items:center">'+
    '<button class="btn" onclick="importSpotsTSV()" style="background:#059669">📥 Importer</button>'+
    '<span id="sp-import-status" style="font-size:.72rem;color:#888"></span>'+
    '</div>';
}
function spRenderDorks(b){
  var niches=['*','maison','mode','animaux','bebe','sport','jardin','bienetre','culture','cadeaux','auto','voyage'];
  var cats=['all','auto_approve','blog','annuaire','ninja','forum','profil'];
  var n=b._dork_niche||'*';var c=b._dork_cat||'all';
  b.innerHTML='<div style="display:flex;gap:.6rem;margin-bottom:1rem;flex-wrap:wrap">'+
    '<select id="dk-niche" class="inp" style="width:auto;font-size:.72rem" onchange="dorkFilter()">'+
    niches.map(function(x){return '<option '+(x===n?'selected':'')+' value="'+x+'">'+x+'</option>';}).join('')+
    '</select>'+
    '<select id="dk-cat" class="inp" style="width:auto;font-size:.72rem" onchange="dorkFilter()">'+
    cats.map(function(x){return '<option '+(x===c?'selected':'')+' value="'+x+'">'+x+'</option>';}).join('')+
    '</select>'+
    '<span style="font-size:.72rem;color:#888;align-self:center">Copier le dork → coller dans Google → trouver spots → Import TSV</span>'+
    '</div><div id="dk-list"></div>';
  dorkFilter();
}
function dorkFilter(){
  var n=(document.getElementById('dk-niche')||{}).value||'*';
  var c=(document.getElementById('dk-cat')||{}).value||'all';
  var rows=SPOT_DORKS.filter(function(d){
    var nok=d[0]==='*'||d[0]===n||n==='*';
    var cok=c==='all'||d[1]===c;
    return nok&&cok;
  });
  var el=document.getElementById('dk-list');if(!el)return;
  var df_cats={auto_approve:true,blog:true,annuaire:true,ninja:true,forum:false,profil:false};
  el.innerHTML='<div style="display:flex;flex-direction:column;gap:.4rem">'+rows.map(function(d){
    var isdf=df_cats[d[1]]!==false;
    return '<div style="padding:.5rem .7rem;background:#f8f7f5;border-radius:4px;display:flex;align-items:center;gap:.6rem">'+
      '<span style="font-size:.6rem;padding:.1rem .4rem;border-radius:8px;background:'+(isdf?'#059669':'#0891b2')+';color:#fff;white-space:nowrap">'+d[1]+'</span>'+
      (isdf?'<span style="font-size:.6rem;color:#059669">🟢</span>':'<span style="font-size:.6rem;color:#0891b2">🔑</span>')+
      '<code style="flex:1;font-size:.65rem;background:none;color:#333;word-break:break-all">'+d[2]+'</code>'+
      '<span style="font-size:.62rem;color:#aaa;white-space:nowrap">'+d[3]+'</span>'+
      '<button onclick="navigator.clipboard.writeText(\''+d[2].replace(/'/g,"\\'")+'\')" class="btn bo" style="font-size:.6rem;padding:.1rem .4rem;white-space:nowrap">Copier</button>'+
      '</div>';
  }).join('')+'</div>';
}
function loadSpots(){
  if(!SLUG)return;
  apiFetch('/spots?slug='+SLUG).then(function(r){return r.json();}).then(function(d){
    var spots=d.spots||[];
    var filter=(document.getElementById('sp-filter')||{}).value||'all';
    var typeF=(document.getElementById('sp-type-filter')||{}).value||'all';
    var filtered=spots.filter(function(s){
      var typeOk=typeF==='all'||s.type===typeF;
      if(!typeOk)return false;
      if(filter==='available')return spotAvailable(s);
      if(filter==='dofollow_direct')return spotAvailable(s)&&s.dofollow&&!s.needs_account;
      if(filter==='account')return s.needs_account;
      if(filter==='cooldown')return !spotAvailable(s)&&s.status!=='blacklist';
      if(filter==='blacklist')return s.status==='blacklist';
      return true;
    });
    // Dashboard
    var avail=spots.filter(spotAvailable);
    var dfDirect=avail.filter(function(s){return s.dofollow&&!s.needs_account;});
    var needAcc=spots.filter(function(s){return s.needs_account;});
    var dash=document.getElementById('spot-dash');
    if(dash){
      var byType={blog:0,forum:0,profile:0,guestbook:0};
      dfDirect.forEach(function(s){if(byType[s.type]!==undefined)byType[s.type]++;});
      dash.innerHTML=[
        {v:spots.length,l:'Total',c:'#333'},
        {v:avail.length,l:'Disponibles',c:'#059669'},
        {v:dfDirect.length,l:'🟢 Dofollow direct',c:'#059669'},
        {v:needAcc.length,l:'🔑 Compte requis',c:'#0891b2'},
      ].map(function(x){
        return '<div style="background:#f8f7f5;border-radius:6px;padding:.6rem .8rem;text-align:center">'+
          '<div style="font-size:1.1rem;font-weight:700;color:'+x.c+'">'+x.v+'</div>'+
          '<div style="font-size:.62rem;color:#888;margin-top:.1rem">'+x.l+'</div></div>';
      }).join('')+
      '<div style="background:#f8f7f5;border-radius:6px;padding:.6rem .8rem;grid-column:span 4">'+
      '<div style="font-size:.6rem;font-weight:700;color:#888;margin-bottom:.3rem;letter-spacing:.1em">DOFOLLOW DIRECTS PAR TYPE</div>'+
      '<div style="display:flex;gap:.4rem">'+
      ['blog','forum','profile','guestbook'].map(function(t){
        var n=dfDirect.filter(function(s){return s.type===t;}).length;
        return '<span style="font-size:.65rem;padding:.1rem .5rem;border-radius:8px;background:'+(SPOT_TYPE_COL[t]||'#888')+';color:#fff">'+t+' '+n+'</span>';
      }).join('')+'</div></div>';
    }
    var el=document.getElementById('spot-list');if(!el)return;
    if(!filtered.length){el.innerHTML='<div style="color:#aaa;font-size:.8rem">Aucun spot ('+filter+')</div>';return;}
    el.innerHTML='<div style="font-size:.68rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#888;margin-bottom:.6rem">'+filtered.length+' SPOTS</div>'+
      '<div style="display:flex;flex-direction:column;gap:.4rem">'+filtered.map(function(s){
        var av=spotAvailable(s);var left=spotCooldownLeft(s);
        var statBg=s.status==='blacklist'?'#991b1b':av?'#166534':'#92400e';
        var statLbl=s.status==='blacklist'?'BLACKLIST':av?'DISPO':'CD J+'+left;
        var tc=SPOT_TYPE_COL[s.type]||'#888';
        return '<div style="display:flex;align-items:center;gap:.5rem;padding:.5rem .7rem;background:#f8f7f5;border-radius:4px;flex-wrap:wrap">'+
          '<span style="font-size:.6rem;font-weight:700;padding:.1rem .4rem;border-radius:8px;background:'+statBg+';color:#fff;white-space:nowrap">'+statLbl+'</span>'+
          '<span style="font-size:.6rem;padding:.1rem .4rem;border-radius:8px;background:'+tc+';color:#fff">'+s.type+'</span>'+
          (s.dofollow?'<span style="font-size:.6rem;color:#059669">🟢 do</span>':'')+
          (s.needs_account?'<span style="font-size:.6rem;color:#0891b2">🔑</span>':'')+
          (s.niche?'<span style="font-size:.6rem;color:#888;padding:.1rem .3rem;background:#e8e4df;border-radius:4px">'+s.niche+'</span>':'')+
          '<span style="flex:1;font-size:.73rem;color:#333;min-width:0"><b>'+s.domain+'</b>'+(s.url?' <a href="'+s.url+'" target="_blank" style="color:#0891b2;font-size:.65rem">↗</a>':'')+
          (s.notes?' <span style="color:#aaa;font-size:.65rem">— '+s.notes.slice(0,40)+'</span>':'')+
          ' <span style="color:#ccc;font-size:.62rem">× '+(s.uses||0)+'</span></span>'+
          (av&&s.status!=='blacklist'?'<button onclick="useSpot(\''+s.id+'\')" class="btn" style="font-size:.62rem;padding:.2rem .5rem;background:#7c3aed;white-space:nowrap">Utiliser →</button>':'')+
          '<select onchange="updateSpot(\''+s.id+'\',{status:this.value})" style="font-size:.68rem;padding:.1rem .3rem;border:1px solid #ddd;border-radius:3px">'+
            ['available','cooldown','blacklist'].map(function(x){return '<option '+(x===s.status?'selected':'')+'>'+x+'</option>';}).join('')+
          '</select>'+
          '<button onclick="delSpot(\''+s.id+'\')" style="background:none;border:none;cursor:pointer;color:#ccc;font-size:.8rem">✕</button>'+
          '</div>';
      }).join('')+'</div>';
  }).catch(function(){});
}
function addSpot(){
  var dom=document.getElementById('sp-domain').value.trim();
  var url=document.getElementById('sp-url').value.trim();
  var type=document.getElementById('sp-type').value;
  var cooldown=parseInt(document.getElementById('sp-cooldown').value)||30;
  var dr=parseInt(document.getElementById('sp-dr').value)||0;
  var tf=parseInt(document.getElementById('sp-tf').value)||0;
  var obl=parseInt(document.getElementById('sp-obl').value)||0;
  var notes=document.getElementById('sp-notes').value.trim();
  var niche=document.getElementById('sp-niche').value.trim();
  var dofollow=document.getElementById('sp-dofollow').checked;
  var needs_account=document.getElementById('sp-needs-acc').checked;
  if(!dom){toast('Domaine requis',false);return;}
  apiFetch('/spots',{method:'POST',body:JSON.stringify({slug:SLUG,domain:dom,url,type,cooldown,dr,tf,obl,notes,niche,dofollow,needs_account})}).then(function(r){return r.json();}).then(function(d){
    if(d.ok){toast('Spot ajouté ✓',true);spTab('list',document.getElementById('spt-list'));}else toast('Erreur: '+(d.error||'?'),false);
  });
}
function importSpotsTSV(){
  var raw=document.getElementById('sp-tsv').value.trim();
  if(!raw){toast('Coller le TSV d\'abord',false);return;}
  var lines=raw.split('\n');
  // Détecter si la 1ère ligne est un header
  var start=lines[0].startsWith('#')||lines[0].startsWith('Domaine')?1:0;
  var spots=[];
  for(var i=start;i<lines.length;i++){
    var cols=lines[i].split('\t');
    if(cols.length<3)continue;
    var domain=(cols[1]||'').trim();if(!domain)continue;
    var catRaw=(cols[2]||'').trim();
    var m=spotCatMap(catRaw);
    var dofollow=parseInt(cols[5]||'0')>0;
    var effortRaw=(cols[6]||'').trim();
    var cooldown=effortRaw.indexOf('Long')>=0?45:effortRaw.indexOf('Moyen')>=0?30:21;
    var niche=(cols[3]||'').trim();
    var action=(cols[7]||'').trim();
    var url=(cols[8]||'').trim();
    spots.push({domain,type:m.type,needs_account:m.na,dofollow,niche,cooldown,url,notes:action});
  }
  if(!spots.length){toast('Aucun spot parsé — vérifier format',false);return;}
  var st=document.getElementById('sp-import-status');if(st)st.textContent='Import de '+spots.length+' spots…';
  apiFetch('/spots/import',{method:'POST',body:JSON.stringify({slug:SLUG,spots})}).then(function(r){return r.json();}).then(function(d){
    if(d.ok){toast('✅ '+d.added+' spots importés ('+d.skipped+' doublons ignorés)',true);if(st)st.textContent=d.added+' ajoutés · '+d.skipped+' doublons';}
    else toast('Erreur: '+(d.error||'?'),false);
  });
}
function useSpot(id){
  apiFetch('/spots/use',{method:'POST',body:JSON.stringify({slug:SLUG,id})}).then(function(r){return r.json();}).then(function(d){
    if(d.ok){
      // Pré-remplir l'URL dans le générateur de commentaires et switcher sur Backlinks
      var spot=d.spot;
      showTab('bl');
      setTimeout(function(){
        var urlEl=document.getElementById('bl-url');if(urlEl&&spot.url)urlEl.value=spot.url;
        var domEl=document.getElementById('bl-domain');if(domEl)domEl.value=spot.domain;
        var typeEl=document.getElementById('bl-type');if(typeEl)typeEl.value=spot.type;
        toast('Spot chargé dans Backlinks — cooldown démarré ('+spot.cooldown+'j)',true);
      },100);
    }else toast('Erreur: '+(d.error||'?'),false);
  });
}
function updateSpot(id,fields){
  apiFetch('/spots/update',{method:'POST',body:JSON.stringify(Object.assign({slug:SLUG,id},fields))}).then(function(r){return r.json();}).then(function(d){if(d.ok)loadSpots();});
}
function delSpot(id){
  apiFetch('/spots/update',{method:'POST',body:JSON.stringify({slug:SLUG,id,deleted:true})}).then(function(r){return r.json();}).then(function(d){if(d.ok)loadSpots();});
}

/* ── OPÉRATION ────────────────────────────────────────────── */
function renderOperation(){
  set('<div class="hd"><h1>⚡ Opération</h1><span class="slug-tag">'+SLUG+'</span></div>'+
    '<div id="op-nav" style="display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:1.6rem;padding-bottom:.9rem;border-bottom:2px solid #e8e4df">'+
    ['1 · Préparation','2 · Contenu 14pts','3 · Domaine','4 · Sous-domaines','5 · ✦ LIVE'].map(function(l,i){
      return '<button class="op-tb'+(i===0?' act':'')+'" onclick="goOp('+(i+1)+',this)">'+l+'</button>';
    }).join('')+'</div><div id="op-body"><span class="spin"></span> Chargement…</div>');
  apiFetch('/operation/config?slug='+SLUG).then(function(r){return r.json();}).then(function(d){
    OP_CFG=d.config||{};_selTpl=OP_CFG.tpl||1;
    goOp(1,document.querySelector('#op-nav .op-tb'));
  }).catch(function(){goOp(1,document.querySelector('#op-nav .op-tb'));});
}
function goOp(n,btn){
  document.querySelectorAll('#op-nav .op-tb').forEach(function(b){b.classList.remove('act');});
  if(btn)btn.classList.add('act');
  var b=document.getElementById('op-body');
  if(n===1)opPrep(b);else if(n===2)opContent(b);else if(n===3)opDomain(b);else if(n===4)opSubs(b);else opLive(b);
}
function opPrep(b){
  var fUrl=OP_CFG.domain?'https://'+OP_CFG.domain+'/':'https://v35-site-server.ernestpedanou.workers.dev/'+SLUG+'/';
  var tpls=[['T1 — Luxury','linear-gradient(135deg,#b45309,#78350f)','Serif doré · éditorial'],
    ['T2 — Warm','linear-gradient(135deg,#d97706,#92400e)','Beige cosy · artisanal'],
    ['T3 — Modern','linear-gradient(135deg,#333,#555)','Sans-serif · épuré'],
    ['T4 — Artisanal','linear-gradient(135deg,#db2777,#9d174d)','Organique · doux'],
    ['T5 — Boutique','linear-gradient(135deg,#be185d,#831843)','Classique · luxe FR']];
  b.innerHTML='<div class="card"><div class="card-hd">🎨 Template — 5 squelettes</div>'+
    '<p style="font-size:.77rem;color:#888;margin-bottom:.9rem">Le worker sélectionne selon la niche. Forcez un template ci-dessous :</p>'+
    '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:.6rem;margin-bottom:1.2rem">'+
    tpls.map(function(t,i){return '<div class="op-tcard'+((i+1===_selTpl)?' sel':'')+'" onclick="selTpl('+(i+1)+',this)">'+
      '<div style="height:44px;border-radius:4px;background:'+t[1]+';margin-bottom:.4rem"></div>'+
      '<p style="font-size:.68rem;font-weight:700">'+t[0]+'</p>'+
      '<p style="font-size:.6rem;color:#888;margin-top:.12rem">'+t[2]+'</p></div>';}).join('')+
    '</div>'+
    '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:4px;padding:.65rem .9rem;font-size:.77rem;color:#166534;margin-bottom:1.1rem">'+
    '✓ Squelette de référence injecté : <strong>Auranova</strong> (joaillerie fine, T1)</div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.8rem;margin-bottom:1rem">'+
    '<div class="op-field"><label>Domaine custom</label><input id="op-dom" placeholder="auranova.fr" value="'+(OP_CFG.domain||'')+'"></div>'+
    '<div class="op-field"><label>Niche</label><input id="op-niche" placeholder="Jewellery" value="'+(OP_CFG.niche||'')+'"></div>'+
    '</div>'+
    '<div style="display:flex;gap:.7rem;align-items:center;flex-wrap:wrap;margin-bottom:1.1rem">'+
    '<button class="sb-btn" style="width:auto;padding:.52rem 1.2rem" onclick="saveOpCfg()">💾 Sauvegarder</button>'+
    '<a href="'+fUrl+'" target="_blank" style="display:inline-flex;align-items:center;gap:.35rem;padding:.52rem 1.2rem;background:#111;color:#fff;font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;font-weight:700;border-radius:2px;text-decoration:none">🔗 Voir le site préparé</a>'+
    '</div>'+
    '<div style="background:#fffbeb;border:1px solid #f59e0b;border-radius:4px;padding:.75rem .95rem;font-size:.8rem">'+
    '⚡ Lien direct : <a href="'+fUrl+'" target="_blank" style="color:#92400e;font-weight:700">'+fUrl+'</a></div></div>';
}
function selTpl(n,el){
  _selTpl=n;
  document.querySelectorAll('.op-tcard').forEach(function(c){c.classList.remove('sel');});
  if(el)el.classList.add('sel');
}
function saveOpCfg(){
  OP_CFG.tpl=_selTpl;
  OP_CFG.domain=(document.getElementById('op-dom')||{}).value||OP_CFG.domain||'';
  OP_CFG.niche=(document.getElementById('op-niche')||{}).value||OP_CFG.niche||'';
  apiFetch('/operation/config',{method:'POST',body:JSON.stringify({slug:SLUG,config:OP_CFG})})
  .then(function(r){return r.json();}).then(function(d){toast(d.ok?'Config sauvée ✓':'Erreur',d.ok);});
}
function opContent(b){
  b.innerHTML='<span class="spin"></span>';
  var flds=[['brand','Nom de marque'],['tagline','Slogan principal'],['heroTitle','Titre hero'],['heroSub','Sous-titre hero'],
    ['colNames','Noms des collections (séparés par |)'],['colIntro','Intro collection (court)'],['colLong','Description longue collection'],
    ['bullets','Points forts — 4 lignes'],['blogTitles','Titres de blog — 1 par ligne'],['faq','FAQ — Q|R par ligne'],
    ['about','Texte À propos'],['newsletter','CTA newsletter'],['trust','Badges de confiance'],['footer','Description footer']];
  apiFetch('/operation/content?slug='+SLUG).then(function(r){return r.json();}).then(function(d){
    var c=d.content||{};
    var big=['colLong','bullets','blogTitles','faq','about','newsletter','trust','footer'];
    b.innerHTML='<div class="card"><div class="card-hd">📝 14 points de contenu — issu de votre fichier de traduction</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.7rem">'+
      flds.map(function(f){return '<div class="op-field"><label>'+f[1]+'</label>'+
        (big.indexOf(f[0])>=0?'<textarea id="opc-'+f[0]+'">'+(c[f[0]]||'')+'</textarea>':
         '<input id="opc-'+f[0]+'" value="'+(c[f[0]]||'')+'">') +
        '</div>';}).join('')+
      '</div>'+
      '<div style="display:flex;gap:.7rem;margin-top:1rem">'+
      '<button class="sb-btn" style="width:auto;padding:.52rem 1.2rem" onclick="saveOpContent()">💾 Sauvegarder</button>'+
      '<button class="btn bs" style="padding:.52rem 1.2rem" onclick="injectContent()">⚡ Régénérer avec ce contenu</button>'+
      '</div></div>';
  }).catch(function(){b.innerHTML='<p style="color:red">Erreur</p>';});
}
function saveOpContent(){
  var keys=['brand','tagline','heroTitle','heroSub','colNames','colIntro','colLong','bullets','blogTitles','faq','about','newsletter','trust','footer'];
  var cnt={};
  keys.forEach(function(k){var el=document.getElementById('opc-'+k);if(el)cnt[k]=el.tagName==='TEXTAREA'?el.value:el.value;});
  apiFetch('/operation/content',{method:'POST',body:JSON.stringify({slug:SLUG,content:cnt})})
  .then(function(r){return r.json();}).then(function(d){toast(d.ok?'Contenu sauvé ✓':'Erreur',d.ok);});
}
function injectContent(){
  toast('Régénération en cours…');
  apiFetch('/operation/inject',{method:'POST',body:JSON.stringify({slug:SLUG})})
  .then(function(r){return r.json();}).then(function(d){toast(d.ok?'✓ Site régénéré ('+d.pages+' pages)':'Erreur: '+d.error,d.ok);});
}
function opDomain(b){
  b.innerHTML='<span class="spin"></span>';
  apiFetch('/operation/domain-suggest?niche='+encodeURIComponent(OP_CFG.niche||'Jewellery')).then(function(r){return r.json();}).then(function(d){
    var regs=[{n:'Cloudflare',u:'https://www.cloudflare.com/products/registrar/',p:'~8$/an',note:'Prix coûtant · no markup',best:true},
      {n:'OVH',u:'https://www.ovhcloud.com/fr/domains/',p:'~7€/an',note:'Français · fiable'},
      {n:'Ionos',u:'https://www.ionos.fr/domaines/',p:'1€ 1ère ann.',note:'Promo bienvenue'},
      {n:'Namecheap',u:'https://www.namecheap.com/',p:'~9$/an',note:'Simple & rapide'},
      {n:'Gandi',u:'https://www.gandi.net/fr/domain',p:'~15€/an',note:'Support FR premium'}];
    b.innerHTML='<div class="card"><div class="card-hd">🌐 Domaine — niche : '+(OP_CFG.niche||'?')+'</div>'+
      '<p style="font-size:.77rem;color:#888;margin-bottom:.8rem">Cliquez un nom pour le sélectionner :</p>'+
      '<div style="display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:1.3rem">'+
      (d.suggestions||[]).map(function(s){return '<span style="padding:.3rem .75rem;background:#fef3c7;border:1px solid #f59e0b;border-radius:14px;font-size:.77rem;cursor:pointer;font-weight:600" onclick="document.getElementById(\'op-dom2\').value=\''+s+'\'">'+s+'</span>';}).join('')+
      '</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.8rem;margin-bottom:1rem">'+
      '<div class="op-field"><label>Domaine acheté</label><input id="op-dom2" value="'+(OP_CFG.domain||'')+'" placeholder="ex: auranova.fr"></div>'+
      '<div class="op-field"><label>Zone ID Cloudflare</label><input id="op-zone" value="'+(OP_CFG.zone_id||'')+'" placeholder="CF Dashboard → Aperçu"></div>'+
      '</div>'+
      '<button class="sb-btn" style="width:auto;padding:.52rem 1.2rem;margin-bottom:1.6rem" onclick="saveDomain()">💾 Sauvegarder le domaine</button>'+
      '<div class="card-hd" style="margin-bottom:.8rem">🏪 Registrars recommandés</div>'+
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(165px,1fr));gap:.55rem">'+
      regs.map(function(r){return '<div class="'+(r.best?'reg-best':'reg-card')+'">'+
        (r.best?'<span style="font-size:.62rem;font-weight:700;color:#b45309">★ Recommandé</span><br>':'')+
        '<strong>'+r.n+'</strong><br><span style="font-size:.76rem;color:#16a34a;font-weight:700">'+r.p+'</span><br>'+
        '<span style="font-size:.7rem;color:#888">'+r.note+'</span><br>'+
        '<a href="'+r.u+'" target="_blank" style="font-size:.7rem;color:#2563eb">Acheter →</a></div>';}).join('')+
      '</div></div>';
  }).catch(function(){b.innerHTML='<p style="color:red">Erreur</p>';});
}
function saveDomain(){
  OP_CFG.domain=(document.getElementById('op-dom2')||{}).value||'';
  OP_CFG.zone_id=(document.getElementById('op-zone')||{}).value||'';
  apiFetch('/operation/config',{method:'POST',body:JSON.stringify({slug:SLUG,config:OP_CFG})})
  .then(function(r){return r.json();}).then(function(d){toast(d.ok?'Domaine sauvé ✓':'Erreur',d.ok);});
}
function opSubs(b){
  var subs=OP_CFG.subdomains||{};
  b.innerHTML='<div class="card"><div class="card-hd">🗺 20 sous-domaines · IPs distinctes via Cloudflare anycast</div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.8rem;margin-bottom:1rem">'+
    '<div class="op-field"><label>Domaine principal</label><input id="op-sub-dom" value="'+(OP_CFG.domain||'')+'" placeholder="auranova.fr"></div>'+
    '<div class="op-field"><label>Zone ID Cloudflare</label><input id="op-sub-zone" value="'+(OP_CFG.zone_id||'')+'" placeholder="Zone ID"></div>'+
    '</div>'+
    '<p style="font-size:.76rem;color:#888;margin-bottom:.7rem">Sélectionnez les langues à déployer :</p>'+
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:.3rem;margin-bottom:1rem">'+
    LANGS.map(function(l){var s=subs[l[0]]||{};return '<label class="lang-item">'+
      '<input type="checkbox" id="lc-'+l[0]+'" '+(s.dns||s.deployed||l[0]==='fr'||l[0]==='en'?'checked':'')+'>'+
      '<span style="flex:1;font-size:.71rem">'+l[0].toUpperCase()+' · '+l[1]+'</span>'+
      (s.dns?'<span class="badge-ok">DNS</span>':'')+
      (s.deployed?'<span class="badge-live">Live</span>':'')+
      '</label>';}).join('')+
    '</div>'+
    '<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:4px;padding:.65rem .9rem;font-size:.75rem;color:#0369a1;margin-bottom:1rem">'+
    'ℹ Chaque sous-domaine (de.auranova.fr, en.auranova.fr…) obtient une IP Cloudflare distincte. Le Worker v35-site-server route par hostname.</div>'+
    '<div style="display:flex;gap:.65rem;flex-wrap:wrap">'+
    '<button class="sb-btn" style="width:auto;padding:.52rem 1.3rem" onclick="opCreateDNS()">🌐 1. Créer DNS Cloudflare</button>'+
    '<button class="btn bs" style="padding:.52rem 1.3rem" onclick="opDeployLangs()">⚡ 2. Déployer toutes les langues</button>'+
    '</div><div id="sub-prog" style="margin-top:.9rem"></div></div>';
}
function getSelLangs(){return LANGS.filter(function(l){var cb=document.getElementById('lc-'+l[0]);return cb&&cb.checked;}).map(function(l){return l[0];});}
function opCreateDNS(){
  var domain=(document.getElementById('op-sub-dom')||{}).value||OP_CFG.domain;
  var zone=(document.getElementById('op-sub-zone')||{}).value||OP_CFG.zone_id;
  OP_CFG.domain=domain;OP_CFG.zone_id=zone;
  if(!zone||!domain){toast('Zone ID et domaine requis',false);return;}
  var langs=getSelLangs();
  var prog=document.getElementById('sub-prog');
  prog.innerHTML='<p style="font-size:.77rem;color:#888;margin-bottom:.4rem">Création CNAME pour '+langs.length+' langues…</p>';
  var p=Promise.resolve();
  langs.forEach(function(lang){p=p.then(function(){
    return apiFetch('/operation/subdomain',{method:'POST',body:JSON.stringify({slug:SLUG,domain:domain,zone_id:zone,lang:lang})}).then(function(r){return r.json();}).then(function(d){
      if(!OP_CFG.subdomains)OP_CFG.subdomains={};if(!OP_CFG.subdomains[lang])OP_CFG.subdomains[lang]={};
      OP_CFG.subdomains[lang].dns=d.ok?'ok':'err';
      prog.innerHTML+='<div style="font-size:.74rem;padding:.15rem 0;color:'+(d.ok?'#166534':'#991b1b')+'">'+(d.ok?'✓':'✗')+' '+(lang==='fr'?'www.'+domain:lang+'.'+domain)+' → '+(d.ok?'CNAME créé':d.error)+'</div>';
    });
  });});
  p.then(function(){saveOpCfg();toast('DNS créés ✓');});
}
function opDeployLangs(){
  var domain=(document.getElementById('op-sub-dom')||{}).value||OP_CFG.domain;
  var langs=getSelLangs();
  var prog=document.getElementById('sub-prog');
  if(!OP_CFG.blueprint){
    toast('Chargement blueprint…');
    apiFetch('/operation/blueprint?slug='+SLUG).then(function(r){return r.json();}).then(function(d){
      if(!d.blueprint){toast('Blueprint introuvable — régénérez le site d\'abord',false);return;}
      OP_CFG.blueprint=d.blueprint;_doDeployLangs(langs,domain,prog);
    });return;}
  _doDeployLangs(langs,domain,prog);
}
function _doDeployLangs(langs,domain,prog){
  prog.innerHTML='<p style="font-size:.77rem;color:#888;margin-bottom:.4rem">Déploiement '+langs.length+' langues…</p>';
  var p=Promise.resolve();
  langs.forEach(function(lang){p=p.then(function(){
    var dd=lang==='fr'?domain:lang+'.'+domain;
    var dl=lang==='en'?'en':'fr';
    return apiFetch('/operation/lang-deploy',{method:'POST',body:JSON.stringify({slug:SLUG,lang:dl,langCode:lang,domain:dd,niche:OP_CFG.niche||'Mode Femme',blueprint:OP_CFG.blueprint})}).then(function(r){return r.json();}).then(function(d){
      if(!OP_CFG.subdomains)OP_CFG.subdomains={};if(!OP_CFG.subdomains[lang])OP_CFG.subdomains[lang]={};
      OP_CFG.subdomains[lang].deployed=d.ok?'ok':'err';
      prog.innerHTML+='<div style="font-size:.74rem;padding:.15rem 0;color:'+(d.ok?'#166534':'#991b1b')+'">'+(d.ok?'✓':'✗')+' '+lang+' → '+(d.ok?d.pages+' pages · '+dd:'Err: '+d.error)+'</div>';
    });
  });});
  p.then(function(){saveOpCfg();toast('Déploiement terminé ✓');});
}
function opLive(b){
  var subs=OP_CFG.subdomains||{};var domain=OP_CFG.domain||'';
  var testUrl='https://v35-site-server.ernestpedanou.workers.dev/'+SLUG+'/';
  _opUrls=[testUrl];
  function uRow(u,label,ok){return '<div style="display:flex;align-items:center;gap:.65rem;padding:.48rem .8rem;background:#fff;border:1px solid '+(ok?'#bbf7d0':ok===false?'#e8e4df':'#fde68a')+';border-radius:4px;font-size:.77rem">'+
    '<span style="width:16px;height:16px;border-radius:50%;background:'+(ok?'#16a34a':ok===false?'#d1d5db':'#f59e0b')+';color:#fff;font-size:.6rem;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0">'+(ok?'✓':ok===false?'○':'~')+'</span>'+
    '<a href="'+u+'" target="_blank" style="color:#b45309;flex:1;word-break:break-all">'+u+'</a>'+
    '<span style="font-size:.64rem;color:#888;white-space:nowrap">'+label+'</span></div>';}
  var rows=uRow(testUrl,'Workers.dev test',true);
  if(domain){var mu='https://'+domain+'/';_opUrls.push(mu);rows+=uRow(mu,'Principal · FR',!!(subs.fr&&subs.fr.deployed));
    LANGS.forEach(function(l){var code=l[0];if(code==='fr')return;var s=subs[code]||{};if(s.dns||s.deployed){var u='https://'+code+'.'+domain+'/';_opUrls.push(u);rows+=uRow(u,code.toUpperCase()+' · '+l[1],s.deployed?true:s.dns?null:false);}});}
  var chk=[[!!OP_CFG.tpl,'Template sélectionné'],[!!domain,'Domaine configuré'],[!!OP_CFG.zone_id,'Zone Cloudflare renseignée'],[Object.keys(subs).length>0,'DNS créés'],[Object.values(subs).some(function(s){return s.deployed;}),'Langues déployées']];
  var allOk=chk.every(function(c){return c[0];});
  b.innerHTML='<div class="card"><div class="card-hd">✦ Go LIVE — Checklist</div>'+
    '<div style="display:grid;gap:.35rem;margin-bottom:1.3rem">'+
    chk.map(function(c){return '<div style="display:flex;align-items:center;gap:.65rem;padding:.42rem .7rem;border:1px solid #e8e4df;border-radius:3px;font-size:.8rem">'+
      '<span style="width:17px;height:17px;border-radius:50%;background:'+(c[0]?'#16a34a':'#e5e7eb')+';color:#fff;display:flex;align-items:center;justify-content:center;font-size:.6rem;font-weight:700;flex-shrink:0">'+(c[0]?'✓':'○')+'</span>'+c[1]+'</div>';}).join('')+
    '</div>'+
    '<div class="card-hd" style="margin-bottom:.65rem">🔗 Tous les URLs</div>'+
    '<div style="display:grid;gap:.3rem;margin-bottom:1.2rem">'+rows+'</div>'+
    '<button class="sb-btn" style="width:auto;padding:.58rem 1.8rem" onclick="copyAllOpUrls()">📋 Copier tous les liens</button>'+
    (allOk?'<div style="background:#dcfce7;border:1px solid #86efac;border-radius:4px;padding:.9rem 1rem;margin-top:1rem;font-size:.82rem;color:#166534;text-align:center;font-weight:600">✦ Tous les systèmes OK — site EN LIVE ✦</div>':
     '<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:4px;padding:.75rem .9rem;margin-top:1rem;font-size:.77rem;color:#92400e">⚠ Complétez les étapes précédentes.</div>')+
    '</div>';
}
function copyAllOpUrls(){navigator.clipboard.writeText(_opUrls.join('\n')).then(function(){toast('Liens copiés ✓');});}

function set(html){document.getElementById('main').innerHTML=html;}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
</script></body></html>`;
}

export default{
  async fetch(request,env){
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});

    const url=new URL(request.url);
    const path=url.pathname.replace(/\/+$/,'')||'/';
    const token=env.API_TOKEN||'dde0d1b0dfdc9546c0e3464e9939fa4c0fc138e8d5f43df3';

    // Serve admin UI (no auth for UI itself — token embedded in page)
    if(request.method==='GET'&&path==='/'){
      return new Response(adminHTML(token),{headers:{'Content-Type':'text/html;charset=UTF-8','Cache-Control':'no-store'}});
    }

    // Public endpoint — checkout calls this from browser
    if(request.method==='GET'&&path==='/promo/validate'){
      const sl=url.searchParams.get('slug'),code=(url.searchParams.get('code')||'').toUpperCase(),total=parseFloat(url.searchParams.get('total'))||0;
      if(!sl||!code)return new Response(JSON.stringify({ok:false,error:'slug + code required'}),{status:400,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}});
      const raw=await env.KV.get('promo:'+sl+':'+code).catch(()=>null);
      if(!raw)return new Response(JSON.stringify({ok:false,error:'Code invalide'}),{headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}});
      const p=JSON.parse(raw);
      if(!p.active)return new Response(JSON.stringify({ok:false,error:'Code désactivé'}),{headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}});
      if(p.expiresAt&&new Date(p.expiresAt)<new Date())return new Response(JSON.stringify({ok:false,error:'Code expiré'}),{headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}});
      if(p.maxUses>0&&p.uses>=p.maxUses)return new Response(JSON.stringify({ok:false,error:'Code épuisé'}),{headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}});
      if(total>0&&p.minOrder>0&&total<p.minOrder)return new Response(JSON.stringify({ok:false,error:'Minimum de commande: '+p.minOrder+'€'}),{headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}});
      const discount=p.type==='percent'?parseFloat((total*p.value/100).toFixed(2)):Math.min(p.value,total);
      const label=p.type==='percent'?'-'+p.value+'% appliqué !':'-'+p.value+'€ appliqué !';
      p.uses=(p.uses||0)+1;
      await env.KV.put('promo:'+sl+':'+code,JSON.stringify(p),{expirationTtl:86400*365}).catch(()=>{});
      return new Response(JSON.stringify({ok:true,discount,label,type:p.type,value:p.value}),{headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}});
    }

    if(!auth(request,env))return err('Unauthorized',401);

    // GET /pages — list pages for slug
    if(request.method==='GET'&&path==='/pages'){
      const sl=url.searchParams.get('slug');if(!sl)return err('slug required');
      const pages=[];let cursor;
      do{
        const opts={prefix:sl+'/',limit:1000};if(cursor)opts.cursor=cursor;
        const list=await env.R2.list(opts);
        for(const obj of list.objects){
          const relKey=obj.key.slice(sl.length);
          const p=relKey.endsWith('/')&&relKey!=='/'?relKey:relKey;
          pages.push({path:p,size:obj.size,key:obj.key});
        }
        cursor=list.truncated?list.cursor:null;
      }while(cursor);
      return ok({slug:sl,total:pages.length,pages});
    }

    // GET /page — get page content
    if(request.method==='GET'&&path==='/page'){
      const sl=url.searchParams.get('slug'),pg=url.searchParams.get('path')||'/';
      if(!sl)return err('slug required');
      const normalPath=pg.endsWith('/')?pg:pg+'/';
      const key=sl+normalPath;
      const content=await r2get(env,key);
      if(!content)return err('Page not found: '+key,404);
      return ok({slug:sl,path:normalPath,key,content});
    }

    // GET /media
    if(request.method==='GET'&&path==='/media'){
      const sl=url.searchParams.get('slug');if(!sl)return err('slug required');
      const list=await env.R2.list({prefix:sl+'/media/'});
      return ok({slug:sl,media:list.objects.map(o=>({key:o.key,size:o.size}))});
    }

    // GET /backups
    if(request.method==='GET'&&path==='/backups'){
      const sl=url.searchParams.get('slug');if(!sl)return err('slug required');
      const raw=await env.KV.get('backup:index:'+sl).catch(()=>null);
      return ok({slug:sl,backups:raw?JSON.parse(raw):[]});
    }

    // GET /export — JSON export for local download
    if(request.method==='GET'&&path==='/export'){
      const sl=url.searchParams.get('slug');if(!sl)return err('slug required');
      const pages={};let cursor;
      do{
        const opts={prefix:sl+'/',limit:1000};if(cursor)opts.cursor=cursor;
        const list=await env.R2.list(opts);
        for(const obj of list.objects){
          const src=await env.R2.get(obj.key);
          if(src){const ct=src.httpMetadata?.contentType||'';if(ct.startsWith('text/'))pages[obj.key]=await new Response(src.body).text();}
        }
        cursor=list.truncated?list.cursor:null;
      }while(cursor);
      return new Response(JSON.stringify({slug:sl,exportedAt:new Date().toISOString(),pages,count:Object.keys(pages).length},null,2),{
        headers:{'Content-Type':'application/json','Content-Disposition':'attachment; filename="'+sl+'-export.json"',...CORS}
      });
    }

    // GET operation endpoints (before POST guard)
    if(request.method==='GET'&&path==='/operation/config'){const sl=url.searchParams.get('slug');if(!sl)return err('slug required');const obj=await env.R2.get('op/cfg-'+sl+'.json').catch(()=>null);const cfg=obj?JSON.parse(await new Response(obj.body).text()):null;return ok({config:cfg||{}});}
    if(request.method==='GET'&&path==='/operation/content'){const sl=url.searchParams.get('slug');if(!sl)return err('slug required');const obj=await env.R2.get('op/content-'+sl+'.json').catch(()=>null);const c=obj?JSON.parse(await new Response(obj.body).text()):null;return ok({content:c||{}});}
    if(request.method==='GET'&&path==='/operation/domain-suggest'){const niche=url.searchParams.get('niche')||'';const sg={'Jewellery':['bijoupure.fr','orfevra.fr','eclat-bijoux.fr','dorure-fine.fr','cristale.fr'],'Bijoux':['bijoushine.fr','auroria.fr','lapure.fr','diamantine.fr','parure-fine.fr'],'Luminaires':['luminova.fr','lux-deco.fr','eclairia.fr','luminia.fr','lighterra.fr'],'Décoration':['maison-arte.fr','decostore.fr','homestyle.fr','belle-maison.fr','decoria.fr'],'Mode Femme':['modelia.fr','femmestyle.fr','tendance-mode.fr','ellefashion.fr','ellegance.fr'],'Mode Homme':['monsieur-mode.fr','manstore.fr','styleman.fr','hommechic.fr','gentstore.fr'],'Beauté':['beautystore.fr','glowshop.fr','cosmetica.fr','mabeaute.fr','beautylab.fr'],'Bien-être':['zenstore.fr','natureza.fr','serenia.fr','zenlab.fr','bienetre.fr'],'Sport':['sportzone.fr','fitshop.fr','activa.fr','fitgear.fr','sportlab.fr'],'Maroquinerie':['sacmode.fr','cuiromania.fr','leatherco.fr','maroquin.fr','sacpremium.fr'],'High-Tech':['techstore.fr','gadgetzone.fr','hitech.fr','techshop.fr','gadgetlab.fr'],'Animaux':['animalstore.fr','petshopfr.fr','monpet.fr','animalia.fr','petzone.fr']};return ok({niche,suggestions:sg[niche]||['topshop.fr','boutique-premium.fr','monstore.fr','eshop-france.fr']});}
    // GET /orchestrator/* — proxy vers v35-orchestrator
    if(request.method==='GET'&&path==='/orchestrator/runs'){const orRes=await env.ORCHESTRATOR.fetch(new Request('https://orchestrator/runs',{headers:{'Authorization':'Bearer '+(env.API_TOKEN||'dde0d1b0dfdc9546c0e3464e9939fa4c0fc138e8d5f43df3')}}));const orD=await orRes.json().catch(()=>({runs:[]}));return ok(orD);}
    if(request.method==='GET'&&path.startsWith('/orchestrator/run/')){const runId=path.slice('/orchestrator/run/'.length);const orRes=await env.ORCHESTRATOR.fetch(new Request('https://orchestrator/run/'+runId,{headers:{'Authorization':'Bearer '+(env.API_TOKEN||'dde0d1b0dfdc9546c0e3464e9939fa4c0fc138e8d5f43df3')}}));const orD=await orRes.json().catch(()=>({}));return ok(orD);}
    // GET /backlinks
    if(request.method==='GET'&&path==='/backlinks'){const sl=url.searchParams.get('slug');if(!sl)return err('slug requis');const o=await env.R2.get('backlinks/'+sl+'/links.json').catch(()=>null);const links=o?JSON.parse(await new Response(o.body).text()):[];return ok({links});}
    if(request.method==='GET'&&path==='/operation/blueprint'){const sl=url.searchParams.get('slug');if(!sl)return err('slug required');const obj=await env.R2.get('op/blueprint-'+sl+'.json').catch(()=>null);const bp=obj?JSON.parse(await new Response(obj.body).text()):null;return ok({blueprint:bp});}

    if(request.method!=='POST')return err('Method not allowed',405);
    let body={};try{body=await request.json();}catch{return err('Invalid JSON');}

    // POST /save
    if(path==='/save'){
      const{slug,path:pg,content}=body;if(!slug||!content)return err('slug + content required');
      const normalPath=(pg||'/').endsWith('/')?(pg||'/'):pg+'/';
      await r2put(env,slug+normalPath,content);
      return ok({slug,path:normalPath,saved:true});
    }

    // POST /section
    if(path==='/section'){
      const{slug,path:pg,section,value}=body;if(!slug||!section)return err('slug + section required');
      const normalPath=(pg||'/').endsWith('/')?(pg||'/'):pg+'/';
      const key=slug+normalPath;
      let html=await r2get(env,key);
      if(!html)return err('Page not found: '+key,404);
      if(section==='h2s'&&Array.isArray(value)){
        let idx=0;html=html.replace(/<h2[^>]*>[^<]*<\/h2>/g,function(m){return idx<value.length?'<h2>'+esc(value[idx++])+'</h2>':m;});
      } else {html=updateSection(html,section,value);}
      await r2put(env,key,html);
      return ok({slug,path:normalPath,section,saved:true});
    }

    // POST /ai-text
    if(path==='/ai-text'){
      const{type,text,lang='en'}=body;if(!text)return err('text required');
      const prompts={
        h1:'Improve this H1 title for an e-commerce luxury site. Return ONLY the improved title, nothing else. Original: '+text,
        meta_title:'Improve this SEO meta title (max 60 chars). Return ONLY the title. Original: '+text,
        meta_desc:'Improve this SEO meta description (max 160 chars). Return ONLY the description. Original: '+text,
        default:'Improve this text for an e-commerce luxury site. Return ONLY the improved text. Original: '+text,
      };
      const prompt=prompts[type]||prompts.default;
      const OPENAI_KEY=env.OPENAI_KEY||'';
      if(!OPENAI_KEY)return err('OPENAI_KEY not configured');
      const aiRes=await fetch('https://api.openai.com/v1/chat/completions',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+OPENAI_KEY},
        body:JSON.stringify({model:'gpt-4o-mini',messages:[{role:'user',content:prompt}],max_tokens:300,temperature:.7}),
      });
      const aiData=await aiRes.json();
      const result=aiData.choices?.[0]?.message?.content?.trim()||'';
      return ok({result});
    }

    // POST /generate-image
    if(path==='/generate-image'){
      const{slug,type='product',niche='Jewellery',prompt}=body;
      if(!slug)return err('slug required');
      const MEDIA_URL=env.MEDIA_GEN_URL||'https://v35-media-gen.ernestpedanou.workers.dev';
      const r=await fetch(MEDIA_URL+'/image',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug,type,niche,prompt,filename:type+'-'+Date.now()})});
      const d=await r.json();
      return ok(d);
    }

    // POST /backup
    if(path==='/backup'){
      const{slug}=body;if(!slug)return err('slug required');
      const BK_URL=env.BACKUP_URL||'https://v35-backup.ernestpedanou.workers.dev';
      const r=await fetch(BK_URL+'/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug})});
      const d=await r.json();
      return ok(d);
    }

    // POST /restore
    if(path==='/restore'){
      const{slug,date}=body;if(!slug||!date)return err('slug + date required');
      const BK_URL=env.BACKUP_URL||'https://v35-backup.ernestpedanou.workers.dev';
      const r=await fetch(BK_URL+'/restore',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug,date})});
      const d=await r.json();
      return ok(d);
    }

    // POST /ai-page
    if(path==='/ai-page'){
      const{slug,path:pg}=body;if(!slug)return err('slug required');
      const ENH_URL=env.ENHANCER_URL||'https://v35-site-enhancer.ernestpedanou.workers.dev';
      const r=await fetch(ENH_URL+'/cro-ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug,path:pg,lang:'en'})});
      const d=await r.json();
      return ok(d);
    }

    // GET /analytics
    if(request.method==='GET'&&path==='/analytics'){
      const sl=url.searchParams.get('slug');if(!sl)return err('slug required');
      const days=[];
      const now=new Date();
      for(let i=0;i<30;i++){
        const d=new Date(now-i*86400000).toISOString().slice(0,10);
        const v=await env.KV.get('analytics:'+sl+':'+d).catch(()=>null);
        if(v)days.push({date:d,views:parseInt(v)});
      }
      days.reverse();
      const metaRaw=await env.R2.get(sl+'/__meta.json').catch(()=>null);
      let meta={};
      if(metaRaw){try{meta=JSON.parse(await new Response(metaRaw.body).text());}catch{}}
      return ok({slug:sl,days,meta});
    }

    // Promo endpoints (auth required)
    if(path==='/promo/list'){
      const sl=url.searchParams.get('slug');if(!sl)return err('slug required');
      const idxRaw=await env.KV.get('promo:index:'+sl).catch(()=>null);
      const codes=idxRaw?JSON.parse(idxRaw):[];
      const promos=[];
      for(const c of codes){const r=await env.KV.get('promo:'+sl+':'+c).catch(()=>null);if(r)promos.push(JSON.parse(r));}
      return ok({slug:sl,promos,count:promos.length});
    }

    if(path==='/promo/create'){
      const{slug,code,type='percent',value,minOrder=0,maxUses=0,expiresAt=null}=body;
      if(!slug||!code||!value)return err('slug, code, value required');
      const c=code.toUpperCase().replace(/[^A-Z0-9]/g,'');
      const promo={code:c,type,value:parseFloat(value),minOrder:parseFloat(minOrder)||0,maxUses:parseInt(maxUses)||0,uses:0,expiresAt:expiresAt||null,active:true,createdAt:new Date().toISOString()};
      await env.KV.put('promo:'+slug+':'+c,JSON.stringify(promo),{expirationTtl:86400*365});
      const idxRaw=await env.KV.get('promo:index:'+slug).catch(()=>null);
      const idx=idxRaw?JSON.parse(idxRaw):[];
      if(!idx.includes(c))idx.push(c);
      await env.KV.put('promo:index:'+slug,JSON.stringify(idx),{expirationTtl:86400*365}).catch(()=>{});
      return ok({slug,code:c,promo});
    }

    if(path==='/promo/delete'){
      const{slug,code}=body;if(!slug||!code)return err('slug + code required');
      const c=code.toUpperCase();
      await env.KV.delete('promo:'+slug+':'+c).catch(()=>{});
      const idxRaw=await env.KV.get('promo:index:'+slug).catch(()=>null);
      const idx=idxRaw?JSON.parse(idxRaw):[];
      await env.KV.put('promo:index:'+slug,JSON.stringify(idx.filter(x=>x!==c)),{expirationTtl:86400*365}).catch(()=>{});
      return ok({slug,code:c,deleted:true});
    }

    // ── OPERATION POST endpoints ──────────────────────────────────────────────
    if(path==='/operation/config'){
      const{slug,config}=body;if(!slug)return err('slug required');
      await env.R2.put('op/cfg-'+slug+'.json',JSON.stringify(config),{httpMetadata:{contentType:'application/json'}}).catch(()=>{});
      return ok({slug,saved:true});
    }
    if(path==='/operation/content'){
      const{slug,content}=body;if(!slug)return err('slug required');
      await env.R2.put('op/content-'+slug+'.json',JSON.stringify(content),{httpMetadata:{contentType:'application/json'}}).catch(()=>{});
      return ok({slug,saved:true});
    }
    if(path==='/operation/subdomain'){
      const{slug,domain,zone_id,lang}=body;
      if(!zone_id||!domain||!lang)return err('zone_id, domain, lang required');
      const cfToken=env.CF_TOKEN;
      const name=lang==='fr'?'www':lang;
      const subdomain=(lang==='fr'?'www.':lang+'.')+domain;
      const cfRes=await fetch('https://api.cloudflare.com/client/v4/zones/'+zone_id+'/dns_records',{
        method:'POST',headers:{'Authorization':'Bearer '+cfToken,'Content-Type':'application/json'},
        body:JSON.stringify({type:'CNAME',name,content:'v35-site-server.ernestpedanou.workers.dev',proxied:true,ttl:1})
      });
      const cfData=await cfRes.json().catch(()=>({success:false,errors:[{message:'Parse error'}]}));
      if(!cfData.success&&!(cfData.errors||[]).some(e=>e.code===81053))return err((cfData.errors||[{message:'CF API error'}])[0].message);
      // Also try to create Worker Route
      await fetch('https://api.cloudflare.com/client/v4/zones/'+zone_id+'/workers/routes',{
        method:'POST',headers:{'Authorization':'Bearer '+cfToken,'Content-Type':'application/json'},
        body:JSON.stringify({pattern:subdomain+'/*',script:'v35-site-server'})
      }).catch(()=>{});
      const targetSlug=lang==='fr'?slug:slug+'-'+lang;
      await env.KV.put('site:hostname:'+subdomain,targetSlug,{expirationTtl:86400*365*5}).catch(()=>{});
      return ok({subdomain,slug:targetSlug,dns:'created'});
    }
    if(path==='/operation/lang-deploy'){
      const{slug,lang,langCode,domain,niche,blueprint}=body;
      if(!blueprint||!domain||!niche)return err('blueprint, domain, niche required');
      const factRes=await fetch('https://v35-site-factory.ernestpedanou.workers.dev/',{
        method:'POST',headers:{'Content-Type':'application/json','X-API-Token':env.API_TOKEN||'dde0d1b0dfdc9546c0e3464e9939fa4c0fc138e8d5f43df3'},
        body:JSON.stringify({domain,niche,lang:lang||'fr',blueprint})
      });
      const fData=await factRes.json().catch(()=>({success:false,error:'Parse error'}));
      if(!fData.success)return err(fData.error||'Factory error');
      await env.KV.put('site:hostname:'+domain,fData.slug,{expirationTtl:86400*365*5}).catch(()=>{});
      return ok({slug:fData.slug,pages:fData.pages,lang,domain});
    }
    if(path==='/operation/inject'){
      const{slug}=body;
      const[cObj,cfgObj,bpObj]=await Promise.all([
        env.R2.get('op/content-'+slug+'.json').catch(()=>null),
        env.R2.get('op/cfg-'+slug+'.json').catch(()=>null),
        env.R2.get('op/blueprint-'+slug+'.json').catch(()=>null),
      ]);
      const content=cObj?JSON.parse(await new Response(cObj.body).text()):{};
      const cfg=cfgObj?JSON.parse(await new Response(cfgObj.body).text()):{};
      const bp=bpObj?JSON.parse(await new Response(bpObj.body).text()):null;
      if(!bp)return err('Blueprint introuvable — régénérez le site d\'abord');
      if(content.brand)bp.brandOverride=content.brand;
      if(content.tagline)bp.sloganOverride=content.tagline;
      bp.contentOverride=content;
      const factRes=await fetch('https://v35-site-factory.ernestpedanou.workers.dev/',{
        method:'POST',headers:{'Content-Type':'application/json','X-API-Token':env.API_TOKEN||'dde0d1b0dfdc9546c0e3464e9939fa4c0fc138e8d5f43df3'},
        body:JSON.stringify({domain:cfg.domain||slug+'.fr',niche:cfg.niche||'Mode Femme',lang:'fr',blueprint:bp})
      });
      const fData=await factRes.json().catch(()=>({success:false,error:'Parse error'}));
      return fData.success?ok({slug,pages:fData.pages,injected:true}):err(fData.error||'Factory error');
    }

    // POST /orchestrator/run — proxy lancement pipeline
    if(path==='/orchestrator/run'){
      const{slug,niche,domain,zone_id}=body;if(!slug)return err('slug requis');
      const bpObj=await env.R2.get('op/blueprint-'+slug+'.json').catch(()=>null);
      const bp=bpObj?JSON.parse(await new Response(bpObj.body).text()):null;
      if(!bp?.allCollections?.length)return err('Blueprint introuvable — régénérez le site d\'abord via Opération');
      const orRes=await env.ORCHESTRATOR.fetch(new Request('https://orchestrator/run',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+(env.API_TOKEN||'dde0d1b0dfdc9546c0e3464e9939fa4c0fc138e8d5f43df3')},body:JSON.stringify({slug,niche:niche||'Mode Femme',domain:domain||slug+'.fr',blueprint:bp,zone_id:zone_id||null})}));
      const orD=await orRes.json().catch(()=>({error:'Orchestrateur indisponible'}));
      return ok(orD);
    }
    // POST /orchestrator/next — avancer d'une étape
    if(path==='/orchestrator/next'){
      const{runId}=body;if(!runId)return err('runId requis');
      const orRes=await env.ORCHESTRATOR.fetch(new Request('https://orchestrator/run/next',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+(env.API_TOKEN||'dde0d1b0dfdc9546c0e3464e9939fa4c0fc138e8d5f43df3')},body:JSON.stringify({runId})}));
      const orD=await orRes.json().catch(()=>({error:'parse'}));
      return ok(orD);
    }
    // POST /backlinks — ajouter un backlink
    if(path==='/backlinks'){
      const{slug,domain,url:burl,anchor,target,link_type,follow_type,dr,tf,obl}=body;if(!slug||!domain||!anchor)return err('slug, domain, anchor requis');
      const key='backlinks/'+slug+'/links.json';
      const o=await env.R2.get(key).catch(()=>null);
      const links=o?JSON.parse(await new Response(o.body).text()):[];
      links.push({id:Date.now().toString(36),domain,url:burl||'',anchor,target:target||'/',link_type:link_type||'blog',follow_type:follow_type||'dofollow',dr:dr||0,tf:tf||0,obl:obl||0,status:'pending',addedAt:new Date().toISOString().split('T')[0],liveAt:null});
      await env.R2.put(key,JSON.stringify(links),{httpMetadata:{contentType:'application/json'}});
      return ok({slug,added:true,total:links.length});
    }
    // POST /backlinks/update — changer statut ou supprimer
    if(path==='/backlinks/update'){
      const{slug,id,status,deleted}=body;if(!slug||!id)return err('slug + id requis');
      const key='backlinks/'+slug+'/links.json';
      const o=await env.R2.get(key).catch(()=>null);
      let links=o?JSON.parse(await new Response(o.body).text()):[];
      if(deleted)links=links.filter(l=>l.id!==id);
      else{const l=links.find(l=>l.id===id);if(l){l.status=status;if(status==='active')l.liveAt=new Date().toISOString().split('T')[0];}}
      await env.R2.put(key,JSON.stringify(links),{httpMetadata:{contentType:'application/json'}});
      return ok({slug,updated:true});
    }
    // POST /backlinks/generate-comment — génère un commentaire HTML Wix/tiptap via OpenAI
    if(path==='/backlinks/generate-comment'){
      const{blog_url,boutique_url,word_count=150,anchor_type='non-optimisée',link_type='blog',nofollow=false}=body;
      if(!blog_url||!boutique_url)return err('blog_url + boutique_url requis');
      const OPENAI_KEY=env.OPENAI_KEY||'';
      if(!OPENAI_KEY)return err('OPENAI_KEY non configurée');
      // Dériver la homepage de la boutique
      let homepage=boutique_url;try{homepage=new URL(boutique_url).origin+'/';}catch{}
      // Choisir ancre selon type
      const ancreExamples={
        'non-optimisée':['ici','ce site','en savoir plus','cliquez ici','voir le site','cette page','ce lien'],
        'semi-optimisée':['boutique en ligne','produits de qualité','voir la collection','découvrir la boutique','shop en ligne'],
        'optimisée':['ancre-mot-clé exact à inférer de l\'URL de la boutique'],
      };
      const toneMap={blog:'éditorial et expert (structure h2/h3, paragraphes développés)',forum:'conversationnel et bref (1-2 paragraphes max, ton naturel)',profile:'très court, présentatif (50 mots max, pas de lien dans le texte sauf si demandé)',guestbook:'court et enthousiaste (2-3 phrases)'};
      const tone=toneMap[link_type]||toneMap.blog;
      const prompt=`Tu es un expert SEO combinant les approches de Koray Tuğberk GÜBÜR (topical authority) et Laurent Bourrelly (cocon sémantique).

Ta mission : rédiger un commentaire de type "${link_type}" (ton : ${tone}) de exactement ${word_count} mots (±10 mots tolérance) à poster sur l'article : ${blog_url}
Le commentaire doit rediriger vers la boutique : ${boutique_url} (et aussi vers la homepage : ${homepage})

RÈGLES STRICTES :
1. Le lien PRINCIPAL (vers ${boutique_url}) doit apparaître dans les 80 premiers mots
2. Type d'ancre pour le lien principal : ${anchor_type}
   - Si "non-optimisée" : utiliser une ancre générique parmi ["ici","ce site","en savoir plus","cliquez ici","voir le site","ce lien"]
   - Si "semi-optimisée" : ancre partiellement liée au thème de la boutique (2-4 mots)
   - Si "optimisée" : ancre = mot-clé principal exact lié au thème/niche de la boutique
3. Le lien SECONDAIRE (vers la homepage ${homepage}) doit avoir une ancre du MÊME type (même règle)
4. Le contenu apporte des informations expertes méconnues, comme un "article cousin" — informe le lecteur sur le sujet large sans paraphraser l'article cible
5. Topical authority : maillage thématique cohérent, vocabulaire expert, sous-thèmes connexes
6. Cocon sémantique : le commentaire agit comme un nœud thématique qui renforce le maillage
7. Utiliser h1, h2, h3, blockquote, br, li pour aérer — OBLIGATOIRE d'avoir au moins un titre (h2 ou h3)
8. Ajouter des <br> avant ET après les balises de structure (h2, h3, blockquote, ul)

FORMAT EXACT (ne pas dévier d'un caractère dans les classes/attributs) :
- Wrapper global : <div contenteditable="true" translate="no" class="tiptap ProseMirror" tabindex="0">
- Chaque paragraphe : <p class="R-Rzg RAz0K" style=" id="foo" indentation="0" textstyle="[object Object]" dir="auto" data-ricos-id="foo">
- Texte normal : <span data-hook="foreground-color" style="color: #000000; text-decoration: inherit;"><span class="ricos-selection">TEXTE ICI</span></span>
- Lien : <a href="URL" rel="${nofollow?'nofollow noreferrer noopener':'noreferrer noopener'}" target="_blank" class="M4jZ2 eSnwX" data-hook="web-link" style="text-decoration:none;"><span data-hook="foreground-color" style="color: #000000; text-decoration: inherit;"><span><span class="ricos-selection">ANCRE ICI</span></span></span></a>
- Plusieurs paragraphes autorisés (crée autant de <p>...</p> que nécessaire)
- PAS de retour à la ligne ni indentation dans le code HTML final

OUTPUT : JSON UNIQUEMENT, une seule clé "html" contenant le bloc HTML complet (une ligne, sans \n):
{"html":"<div contenteditable=...>...</div>"}`;

      const aiRes=await fetch('https://api.openai.com/v1/chat/completions',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+OPENAI_KEY},
        body:JSON.stringify({model:'gpt-4o-mini',messages:[{role:'user',content:prompt}],max_tokens:2000,temperature:0.85}),
      });
      const aiData=await aiRes.json().catch(()=>({}));
      const raw=(aiData.choices?.[0]?.message?.content||'').trim();
      // Extraire le JSON
      let commentHtml='';
      try{
        const jsonMatch=raw.match(/\{[\s\S]*"html"\s*:\s*"([\s\S]*?)"\s*\}/);
        if(jsonMatch)commentHtml=jsonMatch[1].replace(/\\"/g,'"').replace(/\\n/g,'');
        else{const parsed=JSON.parse(raw);commentHtml=parsed.html||'';}
      }catch{
        // Fallback: si OpenAI retourne directement le HTML
        if(raw.startsWith('<div'))commentHtml=raw;
      }
      if(!commentHtml)return err('Génération échouée — réessayer');
      return ok({comment_html:commentHtml,word_count,anchor_type,blog_url,boutique_url});
    }
    // GET /spots
    if(request.method==='GET'&&path==='/spots'){const sl=url.searchParams.get('slug');if(!sl)return err('slug requis');const o=await env.R2.get('backlinks/'+sl+'/spots.json').catch(()=>null);const spots=o?JSON.parse(await new Response(o.body).text()):[];return ok({spots});}
    // POST /spots — ajouter un spot
    if(path==='/spots'){
      const{slug,domain,url:surl,type,cooldown,dr,tf,obl,notes,niche,dofollow,needs_account}=body;if(!slug||!domain)return err('slug + domain requis');
      const key='backlinks/'+slug+'/spots.json';
      const o=await env.R2.get(key).catch(()=>null);
      const spots=o?JSON.parse(await new Response(o.body).text()):[];
      spots.push({id:Date.now().toString(36),domain,url:surl||'',type:type||'blog',cooldown:cooldown||30,dr:dr||0,tf:tf||0,obl:obl||0,notes:notes||'',niche:niche||'',dofollow:!!dofollow,needs_account:!!needs_account,status:'available',uses:0,last_used:null,addedAt:new Date().toISOString().split('T')[0]});
      await env.R2.put(key,JSON.stringify(spots),{httpMetadata:{contentType:'application/json'}});
      return ok({slug,added:true,total:spots.length});
    }
    // POST /spots/import — import bulk TSV (dédup par domaine)
    if(path==='/spots/import'){
      const{slug,spots:incoming}=body;if(!slug||!incoming?.length)return err('slug + spots requis');
      const key='backlinks/'+slug+'/spots.json';
      const o=await env.R2.get(key).catch(()=>null);
      const existing=o?JSON.parse(await new Response(o.body).text()):[];
      const existingDomains=new Set(existing.map(s=>s.domain));
      let added=0,skipped=0;
      for(const s of incoming){
        if(!s.domain||existingDomains.has(s.domain)){skipped++;continue;}
        existing.push({id:Date.now().toString(36)+Math.random().toString(36).slice(2,4),domain:s.domain,url:s.url||'',type:s.type||'blog',cooldown:s.cooldown||21,dr:0,tf:0,obl:0,notes:s.notes||'',niche:s.niche||'',dofollow:!!s.dofollow,needs_account:!!s.needs_account,status:'available',uses:0,last_used:null,addedAt:new Date().toISOString().split('T')[0]});
        existingDomains.add(s.domain);added++;
      }
      await env.R2.put(key,JSON.stringify(existing),{httpMetadata:{contentType:'application/json'}});
      return ok({ok:true,added,skipped,total:existing.length});
    }
    // POST /spots/use — marquer un spot comme utilisé (déclenche cooldown)
    if(path==='/spots/use'){
      const{slug,id}=body;if(!slug||!id)return err('slug + id requis');
      const key='backlinks/'+slug+'/spots.json';
      const o=await env.R2.get(key).catch(()=>null);
      const spots=o?JSON.parse(await new Response(o.body).text()):[];
      const s=spots.find(x=>x.id===id);if(!s)return err('Spot introuvable',404);
      s.last_used=new Date().toISOString().split('T')[0];s.uses=(s.uses||0)+1;
      await env.R2.put(key,JSON.stringify(spots),{httpMetadata:{contentType:'application/json'}});
      return ok({ok:true,spot:s});
    }
    // POST /spots/update — changer statut ou supprimer
    if(path==='/spots/update'){
      const{slug,id,status,deleted}=body;if(!slug||!id)return err('slug + id requis');
      const key='backlinks/'+slug+'/spots.json';
      const o=await env.R2.get(key).catch(()=>null);
      let spots=o?JSON.parse(await new Response(o.body).text()):[];
      if(deleted)spots=spots.filter(x=>x.id!==id);
      else{const s=spots.find(x=>x.id===id);if(s&&status)s.status=status;}
      await env.R2.put(key,JSON.stringify(spots),{httpMetadata:{contentType:'application/json'}});
      return ok({ok:true});
    }
    // POST /backlinks/ping — ping Google/Bing pour indexation
    if(path==='/backlinks/ping'){
      const{slug}=body;if(!slug)return err('slug requis');
      const cfgObj=await env.R2.get('op/cfg-'+slug+'.json').catch(()=>null);
      const cfg=cfgObj?JSON.parse(await new Response(cfgObj.body).text()):{};
      const domain=cfg.domain||slug+'.fr';
      const sm=encodeURIComponent('https://www.'+domain+'/sitemap.xml');
      const[g,b]=await Promise.allSettled([fetch('https://www.google.com/ping?sitemap='+sm),fetch('https://www.bing.com/ping?sitemap='+sm)]);
      return ok({google:g.status==='fulfilled'?g.value.status:'error',bing:b.status==='fulfilled'?b.value.status:'error',sitemap:'https://www.'+domain+'/sitemap.xml'});
    }

    return err('Unknown endpoint',404);
  }
};

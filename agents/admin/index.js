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
  ['home','cols','pages','media','promos','stats','bk'].forEach(function(t){
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

    return err('Unknown endpoint',404);
  }
};

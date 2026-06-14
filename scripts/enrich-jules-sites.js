#!/usr/bin/env node
// Enrichit les 167 sites jules_dur dans BOUTIQUES_SEED
// Récupère: type (CMS), http_status, domain age, online

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const INDEX   = path.join(__dirname, '../agents/build-api/index.js');
const SCRAPER = 'https://v35-build-scraper.ernestpedanou.workers.dev';

function makeId(domain) {
  return crypto.createHash('sha256').update(domain).digest('hex').slice(0, 8);
}

const DOMAINS = [
  'sambottes.fr','ateliermocassin.com','saqado.fr','ma-pochette-ordinateur.com','le-old-money.com','halezia.com','mes-petites-boucles.com','surplus-militaires.fr','monbeauberet.com','malampechampignon.fr','univers-viking.com','moment-cocooning.com','voitures-telecommandees.com','veste-moumoute.com','plafonniermoderne.com','matabledappoint.com','repaire-des-tableaux.com','doudouetpeluche.com','coussinea.fr','confortorthopedique.fr','essence-du-bois.com','bouddha-bouddhisme.com','rc-bolides.com','guirlande-de-noel.com','sac-au-feminin.com','cuisine-inspirante.com','masculinplaisir.com','goussia.fr','nuisette-france.com','sac-chat.com','cannedemarche.com','meubletvandco.com','maison-du-plafonnier.com','maison-du-plug.fr','celesta-bijoux.com','sosiege.com','lemondedupapierpeint.fr','happinessrangement.com','hydrova.fr','poignee-de-porte.com','verasco.fr','pusolve.com','univers-etendoir.com','luppa.fr','masacocherando.com','mondedubijou.com','poubellissima.com','nuage-bleu.com','thermal-touch.com','lesactransparent.fr','maison-vannerie.com','zenyopi.com','votre-salle-de-bain.fr','atelier-des-lumieres.fr','decoboheme.com','douxreveils.com','sac-one.com','maisonboudoir.fr','la-galette-de-chaise.fr','horlova.com','rayonnour.com','luminaire-suspendu.fr','le-mitigeur.com','laboutiquedupoledance.com','esprit-gothique.fr','cintrelia.com','taieensoie.fr','secret-satin.com','votre-pochette-ordinateur.com','cabinmate.fr','la-maison-du-tableau.com','salonium.fr','latelierdesrideaux.com','vase-cute.fr','horlogedesign.fr','matta-tapis.com','chaussettespourtous.com','modulenko.com','peluche-avenue.com','suspensia.fr','maisontextile.fr','be-shine.fr','maison-de-la-lumiere.com','mapetiteveilleuse.com','sourisi.com','veldom.fr','les-maitres-du-puzzle.com','le-sac-isotherme.fr','pochettechic.com','lamaisondeshousses.fr','atelierluisiano.com','hike-boutique.com','parcbebe.com','lampera.fr','topsacados.com','madouceveilleuse.com','boutique-tresses-de-lit.com','protege-matelas.com','revedeparure.com','tendreveilleuse.com','ma-troussedetoilette.com','lerefugedesoiseaux.com','la-baignoire-bebe.fr','labellehorloge.com','outils-reno-brico.com','benamorbijoux.com','latabledepoker.com','kitdubricoleur.com','ma-deco-feline.fr','elyride.com','universfit.com','hijab-chic.com','maisonelvira.com','boutique-mocassin.com','boutique-maillotdebain.com','luminadesign.fr','boutique-kimono.fr','tenteetco.com','sensuelle-a-souhait.com','lecoeurdelamaison.com','baraylis.com','amaccas.com','veilleusedereve.com','trousseup.com','lumiova.com','boz-eyewear.fr','hikinghavens.com','la-lampe-de-chevet.com','flow-damour.com','votreappliquemurale.fr','support-plante.com','soutiengorgewow.com','appliquedesign.fr','horlogesdumonde.com','instruments-zen.fr','mon-beurrier.fr','zephyrtrack.com','robe-rose.com','le-tapis-de-bain.com','ma-cafetiere-italienne.com','lasacochedeparis.com','taiyoa.com','montapisdemarche.com','lamaisondupyjama.fr','brochiva.com','fluensbain.fr','lejournalduwhisky.com','nation-vintage.com','mocassin-femme.com','maison-intime.fr','maison-catamarca.fr','mon-panier-a-linge.com','mapetitegourde.com','stringhomme.fr','evasion-chasse.com','comptoir-du-reveil.com','panier-en-osier.com','porte-savon.com','madamechemise.com','maison-du-mobilier.com','latelier-montessori.com','luminairesignature.com','maisonbanc.com','luminaire-essenza.com','terrariumx.fr','bricobinet.com','coussinlab.com','galeriedesponchos.com','univers-puzzle-3d.com','ambiance-led.com','sandale.co','maison-satin-paris.com','sackdos.com','cagoule-style.com','miss-hijab.fr','univers-coussin-oreiller.fr','vintage-univers.com','perruqueavenue.fr','etui-cigarette.fr','statue-family.com','housse-design.com','maisondespatissiers.com','kimikono.com','serviettes-et-bain.fr','peluworld.com','mini-car.fr','lesdouxraveurs.fr','houssesethousses.fr','cage-mma.com','echiquier-boutique.com','monde-du-boulier.com'
];

async function detectCMS(domain) {
  try {
    const r = await fetch(`${SCRAPER}/api/detect?domain=${domain}`, { signal: AbortSignal.timeout(15000) });
    const d = await r.json();
    return d.cms || 'unknown';
  } catch { return 'unknown'; }
}

async function getDomainAge(domain) {
  try {
    const root = domain.split('.').slice(-2).join('.');
    const r = await fetch(`https://rdap.org/domain/${root}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const d = await r.json();
    const events = d.events || [];
    const reg = events.find(e => e.eventAction === 'registration');
    if (!reg) return null;
    const regDate = new Date(reg.eventDate);
    const ageDays = Math.floor((Date.now() - regDate.getTime()) / 86400000);
    const expEvent = events.find(e => e.eventAction === 'expiration');
    return {
      registered_at: regDate.toISOString().split('T')[0],
      age_days: ageDays,
      expires_at: expEvent ? new Date(expEvent.eventDate).toISOString().split('T')[0] : null,
    };
  } catch { return null; }
}

async function checkStatus(domain) {
  try {
    const r = await fetch(`https://${domain}`, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
    return { status: r.status, online: r.ok };
  } catch { return { status: 0, online: false }; }
}

async function enrichDomain(domain) {
  const [cms, age, http] = await Promise.all([
    detectCMS(domain),
    getDomainAge(domain),
    checkStatus(domain),
  ]);
  return { domain, cms, age, http_status: http.status, online: http.online };
}

async function main() {
  const BATCH = 5;
  const results = {};

  for (let i = 0; i < DOMAINS.length; i += BATCH) {
    const batch = DOMAINS.slice(i, i + BATCH);
    process.stdout.write(`\r[${Math.min(i + BATCH, DOMAINS.length)}/${DOMAINS.length}] enrichissement...`);
    const res = await Promise.all(batch.map(enrichDomain));
    for (const r of res) results[r.domain] = r;
  }
  console.log('\n');

  // Patch BOUTIQUES_SEED dans index.js
  let code = fs.readFileSync(INDEX, 'utf8');
  let updated = 0;

  for (const [domain, info] of Object.entries(results)) {
    const id = makeId(domain);
    // Remplacer les champs dans l'entrée JSON de ce domaine
    const patch = {
      type: info.cms !== 'unknown' ? info.cms : undefined,
      http_status: info.http_status || undefined,
      online: info.online,
      last_checked: Date.now(),
      ...(info.age ? {
        registered_at: info.age.registered_at,
        age_days: info.age.age_days,
        expires_at: info.age.expires_at,
      } : {}),
    };

    // Trouver et patcher le JSON de cette boutique dans le code
    const domainPattern = `"domain":"${domain}"`;
    const idx = code.indexOf(domainPattern);
    if (idx === -1) continue;

    // Trouver l'objet JSON contenant ce domaine
    let start = idx;
    while (start > 0 && code[start] !== '{') start--;
    let depth = 0, end = start;
    while (end < code.length) {
      if (code[end] === '{') depth++;
      if (code[end] === '}') { depth--; if (depth === 0) break; }
      end++;
    }

    try {
      const obj = JSON.parse(code.slice(start, end + 1));
      Object.assign(obj, Object.fromEntries(Object.entries(patch).filter(([,v]) => v !== undefined)));
      code = code.slice(0, start) + JSON.stringify(obj) + code.slice(end + 1);
      updated++;
    } catch {}
  }

  fs.writeFileSync(INDEX, code);
  console.log(`✅ ${updated} sites enrichis (type, statut, âge domaine)`);

  // Résumé
  const types = {};
  for (const r of Object.values(results)) {
    types[r.cms] = (types[r.cms] || 0) + 1;
  }
  console.log('Types détectés:', types);
  const online = Object.values(results).filter(r => r.online).length;
  console.log(`Online: ${online}/${DOMAINS.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });

#!/usr/bin/env node
// Vérifie l'aliexpress_pct des sites jules_dur — filtre 80-100%

const SUPPLIER = 'https://v35-supplier-resolver.ernestpedanou.workers.dev';

const SITES = [
  'sambottes.fr','ateliermocassin.com','saqado.fr','ma-pochette-ordinateur.com','le-old-money.com','halezia.com','mes-petites-boucles.com','surplus-militaires.fr','monbeauberet.com','malampechampignon.fr','univers-viking.com','moment-cocooning.com','voitures-telecommandees.com','veste-moumoute.com','plafonniermoderne.com','matabledappoint.com','repaire-des-tableaux.com','doudouetpeluche.com','coussinea.fr','confortorthopedique.fr','essence-du-bois.com','bouddha-bouddhisme.com','rc-bolides.com','guirlande-de-noel.com','lampadaire-salon.com','sac-au-feminin.com','cuisine-inspirante.com','masculinplaisir.com','goussia.fr','nuisette-france.com','sac-chat.com','cannedemarche.com','meubletvandco.com','maison-du-plafonnier.com','maison-du-plug.fr','celesta-bijoux.com','sosiege.com','lemondedupapierpeint.fr','happinessrangement.com','hydrova.fr','poignee-de-porte.com','verasco.fr','pusolve.com','univers-etendoir.com','luppa.fr','masacocherando.com','mondedubijou.com','poubellissima.com','nuage-bleu.com','thermal-touch.com','lesactransparent.fr','maison-vannerie.com','zenyopi.com','votre-salle-de-bain.fr','atelier-des-lumieres.fr','decoboheme.com','douxreveils.com','sac-one.com','maisonboudoir.fr','la-galette-de-chaise.fr','horlova.com','rayonnour.com','luminaire-suspendu.fr','le-mitigeur.com','laboutiquedupoledance.com','esprit-gothique.fr','cintrelia.com','taieensoie.fr','secret-satin.com','votre-pochette-ordinateur.com','cabinmate.fr','la-maison-du-tableau.com','salonium.fr','latelierdesrideaux.com','vase-cute.fr','horlogedesign.fr','matta-tapis.com','chaussettespourtous.com','modulenko.com','peluche-avenue.com','suspensia.fr','maisontextile.fr','be-shine.fr','maison-de-la-lumiere.com','mapetiteveilleuse.com','sourisi.com','veldom.fr','les-maitres-du-puzzle.com','le-sac-isotherme.fr','pochettechic.com','lamaisondeshousses.fr','atelierluisiano.com','hike-boutique.com','parcbebe.com','lampera.fr','topsacados.com','madouceveilleuse.com','boutique-tresses-de-lit.com','protege-matelas.com','revedeparure.com','tendreveilleuse.com','ma-troussedetoilette.com','lerefugedesoiseaux.com','la-baignoire-bebe.fr','labellehorloge.com','outils-reno-brico.com','benamorbijoux.com','latabledepoker.com','kitdubricoleur.com','ma-deco-feline.fr','elyride.com','universfit.com','hijab-chic.com','maisonelvira.com','boutique-mocassin.com','boutique-maillotdebain.com','luminadesign.fr','boutique-kimono.fr','tenteetco.com','sensuelle-a-souhait.com','lecoeurdelamaison.com','baraylis.com','amaccas.com','veilleusedereve.com','trousseup.com','lumiova.com','boz-eyewear.fr','hikinghavens.com','la-lampe-de-chevet.com','flow-damour.com','votreappliquemurale.fr','support-plante.com','soutiengorgewow.com','appliquedesign.fr','horlogesdumonde.com','instruments-zen.fr','mon-beurrier.fr','zephyrtrack.com','robe-rose.com','le-tapis-de-bain.com','ma-cafetiere-italienne.com','lasacochedeparis.com','taiyoa.com','montapisdemarche.com','lamaisondupyjama.fr','brochiva.com','fluensbain.fr','lejournalduwhisky.com','nation-vintage.com','mocassin-femme.com','maison-intime.fr','maison-catamarca.fr','mon-panier-a-linge.com','mapetitegourde.com','stringhomme.fr','evasion-chasse.com','comptoir-du-reveil.com','panier-en-osier.com','porte-savon.com','madamechemise.com','maison-du-mobilier.com','latelier-montessori.com','luminairesignature.com','maisonbanc.com','luminaire-essenza.com','terrariumx.fr','bricobinet.com','coussinlab.com','galeriedesponchos.com','univers-puzzle-3d.com','ambiance-led.com','sandale.co','maison-satin-paris.com','sackdos.com','cagoule-style.com','miss-hijab.fr','univers-coussin-oreiller.fr','vintage-univers.com','perruqueavenue.fr','etui-cigarette.fr','statue-family.com','housse-design.com','maisondespatissiers.com','kimikono.com','serviettes-et-bain.fr','peluworld.com','mini-car.fr','lesdouxraveurs.fr','houssesethousses.fr','cage-mma.com','echiquier-boutique.com','monde-du-boulier.com'
];

// Détection niche par mots-clés dans le domaine
function detectNiche(domain) {
  const d = domain.toLowerCase();
  if (/bijou|bague|collier|bracelet|boucle|parure/.test(d)) return 'bijoux';
  if (/sac|pochette|cabas|valise|bagage|sacoche/.test(d)) return 'mode';
  if (/robe|veste|pull|jupe|chemise|pyjama|nuisette|hijab|kimono|combi|string|soutien|mode|femme|homme|vintage|style/.test(d)) return 'mode';
  if (/chaussure|botte|mocassin|sandale|chausson/.test(d)) return 'mode';
  if (/lampe|lumiere|luminaire|plafonnier|applique|guirlande|led|veilleuse|lustre/.test(d)) return 'maison';
  if (/coussin|tapis|rideau|housse|nappe|drap|linge|textile|matelas|banc|meuble|deco|maison|salon|canape|table|etagere/.test(d)) return 'maison';
  if (/peluche|jouet|bebe|enfant|puzzle|montessori/.test(d)) return 'enfant';
  if (/sport|fitness|yoga|running|velo|randonnee|chasse/.test(d)) return 'sport';
  if (/beaute|soin|creme|parfum|maquillage|serum/.test(d)) return 'beaute';
  return 'maison'; // défaut
}

async function resolveBatch(items) {
  const r = await fetch(`${SUPPLIER}/resolve/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  return r.json();
}

async function main() {
  const results = [];
  const BATCH = 10;

  for (let i = 0; i < SITES.length; i += BATCH) {
    const batch = SITES.slice(i, i + BATCH).map(domain => ({
      domain,
      niche: detectNiche(domain),
    }));
    process.stdout.write(`\r[${i + batch.length}/${SITES.length}] en cours...`);
    try {
      const d = await resolveBatch(batch);
      for (const r of (d.results || [])) {
        results.push({ domain: r.domain, pct: r.supplier_pct, url: r.supplier_url, niche: r.niche });
      }
    } catch (e) {
      for (const b of batch) results.push({ domain: b.domain, pct: 0, error: e.message });
    }
  }

  console.log('\n');
  const filtered = results.filter(r => r.pct >= 80).sort((a, b) => b.pct - a.pct);
  console.log(`✅ Sites 80-100% : ${filtered.length} / ${SITES.length}\n`);
  filtered.forEach(r => console.log(`  ${r.pct}%  ${r.domain}  (${r.niche})`));
}

main().catch(e => { console.error(e); process.exit(1); });

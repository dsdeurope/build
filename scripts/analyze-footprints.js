#!/usr/bin/env node
// Analyse les footprints techniques de toutes les boutiques actives
// Extrait: CMS, paiements, analytics, apps, CDN, reviews, email, chat, social
// Génère une liste de dorks pour trouver d'autres sites similaires

const API = 'https://v35-build-api.ernestpedanou.workers.dev/api';
const UA  = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0';

// ── Signatures à détecter ─────────────────────────────────────────────────────
const SIGNATURES = {
  // Paiement
  stripe:        ['stripe.com/v3', 'js.stripe.com', 'stripe-js'],
  paypal:        ['paypal.com/sdk', 'paypalobjects.com', 'paypal_express'],
  klarna:        ['klarna.com', 'klarna-payments', 'klarna_osm'],
  alma:          ['almapay.com', 'alma.eu', 'alma-payment'],
  payplug:       ['payplug.com', 'payplug'],
  apple_pay:     ['apple-pay-button', 'ApplePaySession', 'apple_pay'],
  google_pay:    ['google.com/pay', 'googlepay', 'google-pay'],
  mollie:        ['mollie.com', 'mollie_payments'],
  // Analytics
  ga4:           ['gtag/js?id=G-', 'google-analytics.com/g/collect', "'G-"],
  gtm:           ['googletagmanager.com/gtm.js', 'GTM-'],
  facebook_pixel:['facebook.com/tr', 'fbq(', 'fbevents.js'],
  tiktok_pixel:  ['analytics.tiktok.com', 'ttq.', 'tiktok-pixel'],
  hotjar:        ['hotjar.com', 'hjSiteSettings', '_hjSettings'],
  clarity:       ['clarity.ms', 'microsoft/clarity'],
  pinterest_tag: ['pintrk(', 'ct.pinterest.com'],
  snapchat_pixel:['snap.licdn', 'snaptr('],
  // Apps Shopify
  klaviyo:       ['klaviyo.com', 'klaviyo_account', 'klaviyopsautomation'],
  judge_me:      ['judge.me', 'judgeme'],
  loox:          ['loox.io', 'looxcdn'],
  yotpo:         ['yotpo.com', 'yotpoWidgetsContainer'],
  privy:         ['privy.com', 'widget.privy.com'],
  reconvert:     ['reconvert.com', 'reconvert-upsell'],
  bold:          ['boldapps.net', 'bold_subscription'],
  seo_booster:   ['boosterapp.io', 'seo-booster'],
  review_io:     ['reviews.io', 'ruk-rating'],
  stamped_io:    ['stamped.io', 'stamped-badge'],
  omnisend:      ['omnisend.com', 'omnisend_script'],
  // CDN / Hébergement
  cloudflare:    ['cloudflare.com', '__cf_bm', 'cf-ray'],
  bunnycdn:      ['b-cdn.net', 'bunnycdn'],
  imgix:         ['imgix.net'],
  // Reviews & confiance
  trustpilot:    ['trustpilot.com', 'tp-widget'],
  avis_verifies: ['avis-verifies.com', 'skeepers.io', 'societe-des-avis'],
  ekomi:         ['ekomi.fr', 'ekomi-widget'],
  verified_rev:  ['verified-reviews.com'],
  // Shipping / Logistique
  colissimo:     ['colissimo', 'laposte.net/colissimo'],
  mondial_relay: ['mondialrelay.com', 'mondialrelay'],
  chronopost:    ['chronopost.fr'],
  dpd:           ['dpd.fr', 'dpd-shipping'],
  // Chat / Support
  tidio:         ['tidio.co', 'code.tidio'],
  zendesk:       ['zendesk.com', 'zopim'],
  intercom:      ['intercom.io', 'intercomSettings'],
  gorgias:       ['gorgias.com', 'gorgias-chat'],
  livechat:      ['livechatinc.com', 'livechat-widget'],
  tawk:          ['tawk.to', 'tawkto'],
  // Email marketing
  mailchimp:     ['mailchimp.com', 'chimpstatic.com'],
  brevo:         ['brevo.com', 'sendinblue.com'],
  activecampaign:['activecampaign.com'],
  hubspot:       ['hubspot.com', 'hs-analytics'],
  // Social commerce
  instagram_shop:['ig_shopping', 'instagram.com/shoppingredirect', 'instagram_shopping'],
  tiktok_shop:   ['tiktok.com/shop', 'affiliate.tiktok'],
  // SEO / Schema
  schema_product:['itemtype="https://schema.org/Product"', '"@type":"Product"'],
  hreflang:      ['hreflang=', 'rel="alternate" hreflang'],
  // Retargeting
  criteo:        ['static.criteo.net', 'criteo.com'],
  rtbhouse:      ['creativecdn.com', 'rtbhouse'],
  adroll:        ['adroll.com', 'd.adroll.com'],
  // Abonnement
  recharge:      ['rechargepayments.com', 'recharge-checkout'],
  loop_returns:  ['loopreturns.com', 'loop-returns'],
  // Livraison express
  express_ship:  ['livraison express', 'livraison en 24h', 'livraison rapide'],
  free_ship_fr:  ['livraison gratuite', 'livraison offerte'],
};

// ── Dorks générés par signature ───────────────────────────────────────────────
const DORK_TEMPLATES = {
  klaviyo:        'intext:"klaviyo.com" "cdn.shopify.com" site:.fr',
  judge_me:       'intext:"judge.me" "cdn.shopify.com" site:.fr',
  alma:           'intext:"almapay.com" "cdn.shopify.com" site:.fr',
  klarna:         'intext:"klarna.com" "cdn.shopify.com" site:.fr',
  trustpilot:     'intext:"trustpilot.com" inurl:"/collections" site:.fr',
  avis_verifies:  'intext:"avis-verifies.com" inurl:"/collections" site:.fr',
  tiktok_pixel:   'intext:"analytics.tiktok.com" "cdn.shopify.com" site:.fr',
  facebook_pixel: 'intext:"fbevents.js" "cdn.shopify.com" site:.fr',
  ga4:            'intext:"G-" "cdn.shopify.com" intitle:"boutique" site:.fr',
  criteo:         'intext:"static.criteo.net" inurl:"/collections" site:.fr',
  loox:           'intext:"loox.io" "cdn.shopify.com" site:.fr',
  omnisend:       'intext:"omnisend.com" "cdn.shopify.com" site:.fr',
  mondial_relay:  'intext:"mondialrelay.com" "cdn.shopify.com" site:.fr',
  gorgias:        'intext:"gorgias.com" inurl:"/collections" site:.fr',
};

async function scrapeFootprints(domain) {
  try {
    const r = await fetch(`https://${domain}`, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9' },
      signal: AbortSignal.timeout(10000),
      redirect: 'follow',
    });
    if (!r.ok) return { domain, error: r.status, found: [] };
    const html = await r.text();
    const lower = html.toLowerCase();
    const found = [];
    for (const [key, patterns] of Object.entries(SIGNATURES)) {
      if (patterns.some(p => lower.includes(p.toLowerCase()))) found.push(key);
    }
    return { domain, found };
  } catch (e) {
    return { domain, error: e.message, found: [] };
  }
}

async function getAllBoutiques() {
  const all = [];
  for (let page = 1; page <= 10; page++) {
    const r = await fetch(`${API}/boutiques?limit=25&page=${page}`);
    const d = await r.json();
    all.push(...(d.list || []));
    if (page >= d.pages) break;
  }
  return all;
}

async function main() {
  console.log('Récupération des boutiques...');
  const boutiques = await getAllBoutiques();
  const active = boutiques.filter(b => b.online !== false && b.http_status !== 0);
  console.log(`Total: ${boutiques.length} | Actives: ${active.length}\n`);

  // Analyser par batch de 8
  const results = [];
  const BATCH = 8;
  for (let i = 0; i < active.length; i += BATCH) {
    const batch = active.slice(i, i + BATCH);
    process.stdout.write(`\r[${Math.min(i + BATCH, active.length)}/${active.length}] analyse...`);
    const res = await Promise.all(batch.map(b => scrapeFootprints(b.domain)));
    results.push(...res);
  }
  console.log('\n');

  // ── Agréger les footprints ────────────────────────────────────────────────
  const counts = {};
  const byDomain = {};
  for (const r of results) {
    byDomain[r.domain] = r.found;
    for (const f of r.found) counts[f] = (counts[f] || 0) + 1;
  }

  // Trier par fréquence
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total  = results.filter(r => r.found.length > 0).length;

  console.log('═══════════════════════════════════════════════════════');
  console.log(`FOOTPRINTS DÉTECTÉS — ${total} sites analysés`);
  console.log('═══════════════════════════════════════════════════════\n');

  // Groupes
  const GROUPS = {
    'PAIEMENT':    ['stripe','paypal','klarna','alma','payplug','apple_pay','google_pay','mollie'],
    'ANALYTICS':   ['ga4','gtm','facebook_pixel','tiktok_pixel','hotjar','clarity','pinterest_tag','snapchat_pixel','criteo','rtbhouse','adroll'],
    'APPS SHOPIFY':['klaviyo','judge_me','loox','yotpo','privy','reconvert','bold','review_io','stamped_io','omnisend'],
    'REVIEWS':     ['trustpilot','avis_verifies','ekomi','verified_rev'],
    'LIVRAISON':   ['colissimo','mondial_relay','chronopost','dpd','express_ship','free_ship_fr'],
    'CHAT':        ['tidio','zendesk','intercom','gorgias','livechat','tawk'],
    'EMAIL':       ['mailchimp','brevo','activecampaign','hubspot'],
    'SOCIAL':      ['instagram_shop','tiktok_shop'],
    'SEO':         ['schema_product','hreflang'],
    'CDN':         ['cloudflare','bunnycdn','imgix'],
  };

  for (const [group, keys] of Object.entries(GROUPS)) {
    const items = keys.filter(k => counts[k]).map(k => `  ${k.padEnd(20)} ${counts[k]} sites (${Math.round(counts[k]/total*100)}%)`);
    if (!items.length) continue;
    console.log(`\n▶ ${group}`);
    items.forEach(l => console.log(l));
  }

  // ── Dorks générés ─────────────────────────────────────────────────────────
  console.log('\n\n═══════════════════════════════════════════════════════');
  console.log('DORKS POUR TROUVER D\'AUTRES SITES SIMILAIRES');
  console.log('═══════════════════════════════════════════════════════\n');

  // Dorks basés sur les footprints les plus communs (> 20%)
  const commonFootprints = sorted.filter(([,c]) => c/total > 0.2).map(([k]) => k);
  const generatedDorks = [];

  for (const fp of commonFootprints) {
    if (DORK_TEMPLATES[fp]) generatedDorks.push({ source: fp, dork: DORK_TEMPLATES[fp] });
  }

  // Dorks combinés (les 2 footprints les plus courants ensemble)
  const top = sorted.slice(0, 5).map(([k]) => k);
  if (counts['klaviyo'] && counts['judge_me']) {
    generatedDorks.push({ source: 'klaviyo+judge_me', dork: 'intext:"klaviyo" intext:"judge.me" "cdn.shopify.com" site:.fr' });
  }
  if (counts['alma'] && counts['klaviyo']) {
    generatedDorks.push({ source: 'alma+klaviyo', dork: 'intext:"almapay" intext:"klaviyo" site:.fr' });
  }
  if (counts['tiktok_pixel'] && counts['klaviyo']) {
    generatedDorks.push({ source: 'tiktok+klaviyo', dork: 'intext:"tiktok" intext:"klaviyo" "cdn.shopify.com" site:.fr' });
  }

  // Dorks par niche + footprint commun
  const niches = [...new Set(active.map(b => b.niche).filter(Boolean))];
  const topFP  = sorted[0]?.[0];
  if (topFP && DORK_TEMPLATES[topFP]) {
    for (const niche of niches.slice(0, 5)) {
      generatedDorks.push({
        source: `${topFP}+${niche}`,
        dork: `intext:"${Object.keys(SIGNATURES).includes(topFP) ? SIGNATURES[topFP][0] : topFP}" intitle:"${niche}" site:.fr`,
      });
    }
  }

  generatedDorks.forEach((d, i) => console.log(`${String(i+1).padStart(2)}. [${d.source}]\n    ${d.dork}\n`));

  // Sauvegarder
  const output = {
    analysed: total,
    date: new Date().toISOString().split('T')[0],
    footprints: Object.fromEntries(sorted),
    dorks: generatedDorks,
    byDomain,
  };
  require('fs').writeFileSync('/tmp/footprint-analysis.json', JSON.stringify(output, null, 2));
  console.log('\n✅ Résultats complets → /tmp/footprint-analysis.json');
}

main().catch(e => { console.error(e); process.exit(1); });

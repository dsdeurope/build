// Finds aged domains via Wayback CDX API + availability check
// Filters spam niches (EN+FR): viagra, pharmacy, casino, drogue, etc.

const SPAM = /viagra|cialis|pharmacy|pharma|pharmacie|porn|xxx|casino|gambling|poker|bet\b|slots|loan|payday|credit|debt|pill|rx\b|drug|drogue|drog\b|nude|sex\b|sexe|adult|adulte|escort|cam\b|hack|crack|warez|torrent|tabac|alcool|jeux-en-ligne|bookmaker|pronostic|vape|e-cig/i;

// Wayback page content spam keywords (check actual site content)
const CONTENT_SPAM = /viagra|cialis|pharmacy|casino|porn|gambling|drogue|escort|payday.loan|adult.content|xxx/i;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// Niche keyword seeds for each niche
const NICHE_SEEDS = {
  lingerie:     ['lingerie','soutien-gorge','dessous','nightwear','bra'],
  luminaires:   ['luminaire','lampe','eclairage','lighting','chandelier'],
  sport:        ['sport','fitness','outdoor','running','yoga'],
  bijoux:       ['bijoux','jewel','bracelet','collier','bague'],
  deco:         ['decoration','deco-maison','home-decor','candle','cushion'],
  mode:         ['boutique-mode','fashion','vetement','clothing','robe'],
  enfants:      ['jouet','enfant','baby','kids','toy'],
  jardin:       ['jardin','garden','plante','outdoor-living','potager'],
  cuisine:      ['cuisine','cookware','ustensile','kitchen','gastronomie'],
  beaute:       ['beaute','cosmetique','skincare','parfum','makeup'],
  electronique: ['electronique','high-tech','gadget','informatique','audio'],
  maison:       ['maison','linge-de-lit','textile','linge','home'],
  animaux:      ['animaux','chien','chat','pet','animal'],
  sante:        ['sante','bien-etre','soin','supplement','naturo'],
  auto:         ['auto','moto','voiture','automobile','accessoire-auto'],
  voyage:       ['voyage','bagage','valise','travel','sac-voyage'],
  gastronomie:  ['gastronomie','epicerie','gourmet','traiteur','bio'],
  maroquinerie: ['maroquinerie','sac','cuir','leather','handbag'],
};

// TLD targets for aged domain search
const TLDS = ['.fr','.com','.net','.be','.ch'];

async function waybackQuery(keyword, tld) {
  const url = `https://web.archive.org/cdx/search/cdx?url=*${keyword}${tld}&output=json&fl=original,timestamp&collapse=urlkey&limit=500&from=20150101&to=20221231&statuscode=200&matchType=domain`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return [];
    const rows = await r.json();
    if (!Array.isArray(rows) || rows.length < 2) return [];
    return rows.slice(1).map(([orig, ts]) => ({
      domain: orig.replace(/^https?:\/\//,'').split('/')[0].replace(/^www\./,''),
      firstSeen: ts.slice(0,8),
    }));
  } catch { return []; }
}

async function checkAvailability(domain) {
  try {
    const r = await fetch(`https://rdap.org/domain/${domain}`, {
      signal: AbortSignal.timeout(5000),
      headers: { 'Accept': 'application/json' },
    });
    return r.status === 404;
  } catch { return null; }
}

// Fetch a Wayback snapshot and check page content for spam
async function waybackContentCheck(domain) {
  try {
    const cdx = `https://web.archive.org/cdx/search/cdx?url=${domain}&output=json&fl=timestamp&limit=1&from=20180101&to=20221231&statuscode=200`;
    const r = await fetch(cdx, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return { clean: true, snippet: null };
    const rows = await r.json();
    if (!Array.isArray(rows) || rows.length < 2) return { clean: true, snippet: null };
    const ts = rows[1][0];
    const snap = `https://web.archive.org/web/${ts}/${domain}`;
    const page = await fetch(snap, { signal: AbortSignal.timeout(8000) });
    if (!page.ok) return { clean: true, snippet: null };
    // Read first 8KB only
    const reader = page.body.getReader();
    let text = '';
    while (text.length < 8000) {
      const { done, value } = await reader.read();
      if (done) break;
      text += new TextDecoder().decode(value);
    }
    reader.cancel();
    // Strip tags
    const plain = text.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').slice(0,2000);
    const hasSpam = CONTENT_SPAM.test(plain);
    return { clean: !hasSpam, snippet: plain.slice(0,200) };
  } catch { return { clean: true, snippet: null }; }
}

function ageDays(firstSeen) {
  const y = +firstSeen.slice(0,4), m = +firstSeen.slice(4,6)-1, d = +firstSeen.slice(6,8);
  return Math.floor((Date.now() - new Date(y,m,d).getTime()) / 86400000);
}

function isClean(domain) {
  return !SPAM.test(domain);
}

// Estimated acquisition cost tier based on age
function costTier(ageDays) {
  if (ageDays > 5000) return '€30-100'; // very old
  if (ageDays > 3000) return '€15-50';
  return '€5-20';
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    let niche = url.searchParams.get('niche') || 'mode';
    let limit = Math.min(+url.searchParams.get('limit') || 20, 50);
    let minAgeDays = +url.searchParams.get('min_age_days') || 365;
    let checkContent = url.searchParams.get('check_content') !== 'false'; // default true

    if (request.method === 'POST') {
      try {
        const b = await request.json();
        niche = b.niche || niche;
        limit = b.limit || limit;
        minAgeDays = b.min_age_days || minAgeDays;
        checkContent = b.check_content ?? checkContent;
      } catch {}
    }

    const seeds = NICHE_SEEDS[niche.toLowerCase()] || NICHE_SEEDS.mode;

    const queries = [];
    for (const seed of seeds.slice(0,3)) {
      for (const tld of TLDS.slice(0,3)) {
        queries.push(waybackQuery(seed, tld));
      }
    }

    const results = await Promise.allSettled(queries);
    const seen = new Set();
    const candidates = [];

    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      for (const { domain, firstSeen } of r.value) {
        if (!domain || seen.has(domain)) continue;
        seen.add(domain);
        if (!isClean(domain)) continue;
        const age = ageDays(firstSeen);
        if (age < minAgeDays) continue;
        candidates.push({ domain, firstSeen, ageDays: age });
      }
    }

    candidates.sort((a,b) => b.ageDays - a.ageDays);

    const top = candidates.slice(0, Math.min(limit * 3, 60));
    const avail = await Promise.allSettled(
      top.map(async c => {
        const available = await checkAvailability(c.domain);
        return { ...c, available };
      })
    );

    const filtered = avail
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value)
      .filter(d => d.available !== false)
      .slice(0, limit * 2);

    // Content check for top candidates (parallel, max 10 to stay fast)
    let domains;
    if (checkContent) {
      const contentChecks = await Promise.allSettled(
        filtered.slice(0, 20).map(async d => {
          const cc = await waybackContentCheck(d.domain);
          return { ...d, content_clean: cc.clean, wayback_snippet: cc.snippet, cost_tier: costTier(d.ageDays) };
        })
      );
      domains = contentChecks
        .filter(r => r.status === 'fulfilled' && r.value.content_clean)
        .map(r => r.value)
        .slice(0, limit);
    } else {
      domains = filtered.slice(0, limit).map(d => ({ ...d, cost_tier: costTier(d.ageDays) }));
    }

    return Response.json({
      niche,
      count: domains.length,
      min_age_days: minAgeDays,
      budget_max: '€50',
      workflow: {
        step1: 'Acheter domaine (GoDaddy Auctions / Sedo / NameJet)',
        step2: 'Lancer scraping concurrent immédiatement (v35-scrape-orchestrator)',
        step3: 'Traitement images en parallèle (v35-image-processor)',
        step4: 'Déployer site PHP sur le domaine (DNS propagé en 24-48h)',
        step5: 'Soumettre sitemap → Google Search Console J+1',
        note: 'Scraping + build prennent 2-8h → DNS propagé en même temps → site live dès J+1',
      },
      domains,
    }, { headers: CORS });
  }
};

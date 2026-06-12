// Finds aged domains via Wayback CDX API + availability check
// Filters spam niches: viagra, pharmacy, porn, casino, etc.

const SPAM = /viagra|cialis|pharmacy|pharma|porn|xxx|casino|gambling|poker|bet\b|slots|loan|payday|credit|debt|pill|rx\b|drug|nude|sex\b|adult|escort|cam\b|hack|crack|warez|torrent/i;

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
    // rows[0] is header ['original','timestamp']
    return rows.slice(1).map(([orig, ts]) => ({
      domain: orig.replace(/^https?:\/\//,'').split('/')[0].replace(/^www\./,''),
      firstSeen: ts.slice(0,8),
    }));
  } catch { return []; }
}

async function checkAvailability(domain) {
  // RDAP check — returns true if domain appears unregistered
  try {
    const tld = domain.split('.').pop();
    const r = await fetch(`https://rdap.org/domain/${domain}`, {
      signal: AbortSignal.timeout(5000),
      headers: { 'Accept': 'application/json' },
    });
    // 404 = not found = potentially available
    return r.status === 404;
  } catch { return null; } // unknown
}

function ageDays(firstSeen) {
  const y = +firstSeen.slice(0,4), m = +firstSeen.slice(4,6)-1, d = +firstSeen.slice(6,8);
  return Math.floor((Date.now() - new Date(y,m,d).getTime()) / 86400000);
}

function isClean(domain) {
  return !SPAM.test(domain);
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    let niche = url.searchParams.get('niche') || 'mode';
    let limit = Math.min(+url.searchParams.get('limit') || 20, 50);
    let minAgeDays = +url.searchParams.get('min_age_days') || 365;

    if (request.method === 'POST') {
      try { const b = await request.json(); niche = b.niche||niche; limit = b.limit||limit; minAgeDays = b.min_age_days||minAgeDays; } catch {}
    }

    const seeds = NICHE_SEEDS[niche.toLowerCase()] || NICHE_SEEDS.mode;

    // Query Wayback for each seed × TLD (parallel, capped)
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

    // Sort by age desc (oldest = most authority)
    candidates.sort((a,b) => b.ageDays - a.ageDays);

    // Check availability for top candidates (parallel, limited)
    const top = candidates.slice(0, Math.min(limit * 3, 60));
    const avail = await Promise.allSettled(
      top.map(async c => {
        const available = await checkAvailability(c.domain);
        return { ...c, available };
      })
    );

    const domains = avail
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value)
      .filter(d => d.available !== false) // keep unknown + true
      .slice(0, limit);

    return Response.json({
      niche,
      count: domains.length,
      min_age_days: minAgeDays,
      domains,
    }, { headers: CORS });
  }
};

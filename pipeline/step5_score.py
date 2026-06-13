"""
Étape 5 — Scoring & Livrable
Score de potentiel V35 (1-10) + rapport CSV/Markdown + import boutiques.
"""
import json, csv, io, urllib.request
from config import UNIVERSAL_KEYWORDS, CPC_MIN, TRAFFIC_MIN, TRAFFIC_MAX

_CMS_CLONE_BONUS = {
    'shopify': 0.4,
    'woocommerce': 0.2,
    'prestashop': 0.0,
    'magento': -0.3,
    'vtex': -0.2,
    'unknown': -0.25,
}

_CONV_RATE = {
    'shopify': 0.018, 'woocommerce': 0.014,
    'prestashop': 0.012, 'magento': 0.010,
}

_CLONE_DAYS = {
    'shopify': 1, 'woocommerce': 2,
    'prestashop': 4, 'magento': 7, 'vtex': 5,
}

_BASKET = {
    'bijoux': 85, 'mode': 55, 'beaute': 45, 'sport': 65,
    'maison': 75, 'electronique': 120, 'nutrition': 40,
    'animaux': 35, 'sante': 50, 'luxe': 200, 'auto': 80,
    'jardin': 45, 'enfant': 40,
}

def _rdap_age_bonus(domain):
    """Return age bonus (+0.3 if >3y, -0.2 if <1y, 0 on error). Max 3s."""
    try:
        url = f'https://rdap.org/domain/{domain}'
        with urllib.request.urlopen(url, timeout=3) as r:
            data = json.loads(r.read())
        for ev in data.get('events', []):
            if ev.get('eventAction') == 'registration':
                from datetime import datetime, timezone
                reg = datetime.fromisoformat(ev['eventDate'].replace('Z', '+00:00'))
                age_years = (datetime.now(timezone.utc) - reg).days / 365.25
                if age_years > 3:   return 0.3
                if age_years < 1:   return -0.2
                return 0
    except Exception:
        pass
    return 0

def compute_score(item):
    """Score composite V35 (1-10) avec détail des composantes."""
    score = 0
    detail = {}

    # ── CMS (0-2 pts) ─────────────────────────────────────────────────────────
    cms_scores = {'shopify': 2, 'woocommerce': 1.8, 'magento': 2, 'prestashop': 1.5,
                  'bigcommerce': 1.8, 'webflow': 1, 'opencart': 1.2, 'unknown': 0.5}
    cms_pts = cms_scores.get(item.get('cms', 'unknown'), 0.5)
    score += cms_pts; detail['cms'] = cms_pts

    # ── Trafic dans zone V35 (0-2 pts) ───────────────────────────────────────
    t = item.get('traffic_monthly', 0)
    if TRAFFIC_MIN <= t <= TRAFFIC_MAX:
        # Score max au milieu de la zone (10K)
        traffic_pts = 2 - abs(t - 10000) / 20000
        traffic_pts = max(0.5, min(2, traffic_pts))
    else:
        traffic_pts = 0
    score += traffic_pts; detail['traffic'] = round(traffic_pts, 2)

    # ── CPC (0-2 pts) ─────────────────────────────────────────────────────────
    cpc = item.get('cpc_avg', 0)
    cpc_pts = min(2, (cpc / 0.5) * 1.5)  # 2pts à 0.50€
    score += cpc_pts; detail['cpc'] = round(cpc_pts, 2)

    # ── Universalité produit (0-2 pts) ────────────────────────────────────────
    meta = (item.get('meta', {}).get('title', '') + ' ' +
            item.get('meta', {}).get('description', '') + ' ' +
            item.get('niche', '')).lower()
    universal_hits = sum(1 for k in UNIVERSAL_KEYWORDS if k.lower() in meta)
    univ_pts = min(2, universal_hits * 0.4)
    score += univ_pts; detail['universality'] = round(univ_pts, 2)

    # ── Opportunité SEO (0-2 pts) — heuristiques ─────────────────────────────
    cms_key = item.get('cms', 'unknown')
    opp_pts = 0
    if item.get('https'):         opp_pts += 0.3
    if item.get('has_cart'):      opp_pts += 0.5
    if cms_key != 'unknown':      opp_pts += 0.3
    if cpc >= CPC_MIN * 1.5:     opp_pts += 0.4  # CPC élevé = niche rentable
    if t > 2000:                  opp_pts += 0.5  # trafic conséquent
    clone_bonus = _CMS_CLONE_BONUS.get(cms_key, -0.2)
    age_bonus   = _rdap_age_bonus(item.get('domain', ''))
    opp_pts = min(2, opp_pts + clone_bonus + age_bonus)
    opp_pts = max(0, opp_pts)
    score += opp_pts; detail['opportunity'] = round(opp_pts, 2)
    detail['clone_bonus'] = clone_bonus; detail['age_bonus'] = age_bonus

    # ── CA estimé et clone_days ───────────────────────────────────────────────
    niche = item.get('niche', '')
    conv = _CONV_RATE.get(cms_key, 0.015)
    basket = _BASKET.get(niche, 50)
    ca_estimate = round(t * conv * basket)
    clone_days = _CLONE_DAYS.get(cms_key, 3)
    detail['ca_estimate'] = ca_estimate
    detail['clone_days'] = clone_days

    return round(min(10, score), 1), detail

def action(score):
    if score >= 7.5: return '🚀 Cloner rapidement'
    if score >= 6:   return '🔍 Analyser niche'
    if score >= 4:   return '⏳ Surveiller'
    return '❌ Ignorer'

def run(keyword_results, output_csv='/tmp/v35_report.csv', output_md='/tmp/v35_report.md'):
    print(f'=== STEP 5: Scoring ({len(keyword_results)} domaines) ===\n')

    rows = []
    for item in keyword_results:
        score, detail = compute_score(item)
        kws = ', '.join(k['keyword'] for k in item.get('keywords', [])[:3])
        row = {
            'domaine':       item['domain'],
            'cms':           item.get('cms', 'unknown'),
            'niche':         item.get('niche', ''),
            'trafic_mois':   f"{item.get('traffic_monthly', 0):,}",
            'trafic_source': item.get('traffic_source', ''),
            'cpc_moy':       f"{item.get('cpc_avg', 0):.2f}€",
            'top_keywords':  kws,
            'score':         score,
            'ca_estimate':   detail.get('ca_estimate', 0),
            'clone_days':    detail.get('clone_days', 3),
            'action':        action(score),
            '_detail':       detail,
            '_raw':          item,
        }
        rows.append(row)

    # Sort by score desc
    rows.sort(key=lambda r: r['score'], reverse=True)

    # ── CSV ───────────────────────────────────────────────────────────────────
    fields = ['domaine','cms','niche','trafic_mois','cpc_moy','top_keywords','score','ca_estimate','clone_days','score_detail','action']
    with open(output_csv, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for r in rows:
            row_out = {k: r[k] for k in fields if k not in ('score_detail',) and k in r}
            row_out['score_detail'] = json.dumps(r['_detail'], ensure_ascii=False, separators=(',', ':'))
            w.writerow(row_out)
    print(f'CSV → {output_csv}')

    # ── Markdown ──────────────────────────────────────────────────────────────
    md_lines = ['# V35 Pipeline Report\n',
                '| Domaine | CMS | Niche | Trafic/mois | CPC moy | Score | Action |',
                '|---------|-----|-------|-------------|---------|-------|--------|']
    for r in rows:
        md_lines.append(
            f"| {r['domaine']} | {r['cms']} | {r['niche']} | "
            f"{r['trafic_mois']} | {r['cpc_moy']} | **{r['score']}/10** | {r['action']} |"
        )
    md = '\n'.join(md_lines)
    open(output_md, 'w').write(md)
    print(f'Markdown → {output_md}')

    # ── Console summary ───────────────────────────────────────────────────────
    print(f'\n{"="*70}')
    print(f'{"DOMAINE":<28} {"CMS":<12} {"TRAFIC":>8} {"CPC":>6} {"SCORE":>6} ACTION')
    print(f'{"="*70}')
    for r in rows:
        print(f"{r['domaine']:<28} {r['cms']:<12} {r['trafic_mois']:>8} {r['cpc_moy']:>6} {r['score']:>5}/10  {r['action']}")

    winners = [r for r in rows if r['score'] >= 7.5]
    print(f'\n✅ {len(winners)} sites "Cloner rapidement" | {len(rows)} qualifiés total')

    return rows

if __name__ == '__main__':
    keyword_results = json.load(open('/tmp/v35_keywords.json'))
    rows = run(keyword_results)

    # Import optionnel dans la plateforme V35
    try:
        import requests as req
        winners = [r['_raw'] for r in rows if r['score'] >= 7]
        if winners:
            resp = req.post(
                'https://v35-build-api.ernestpedanou.workers.dev/api/import/csv',
                json={'rows': [{
                    'domain': w['domain'], 'type': w.get('cms', 'shopify'),
                    'niche': w.get('niche', ''), 'traffic': w.get('traffic_monthly', 0),
                    'comment': f"V35 pipeline score:{rows[[r['_raw'] for r in rows].index(w)]['score']}"
                } for w in winners]},
                timeout=15
            )
            if resp.ok:
                d = resp.json()
                print(f'\n🔗 Import V35 platform: {d.get("created")} créés, {d.get("skipped")} ignorés')
    except Exception as e:
        print(f'\nImport skipped: {e}')

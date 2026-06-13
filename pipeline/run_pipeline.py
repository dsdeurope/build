"""
V35 Pipeline — Orchestrateur principal
Usage: python3 run_pipeline.py [niche1 niche2 ...] [--query "dork custom"]
       python3 run_pipeline.py mode sport          # niches spécifiques
       python3 run_pipeline.py                     # toutes les niches
       python3 run_pipeline.py --query "site:.fr inurl:/shop yoga"
"""
import sys, json, argparse, time
from pathlib import Path

TMP = Path('/tmp')

def save(name, data):
    p = TMP / f'v35_{name}.json'
    with open(p, 'w') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'  → saved {p}')
    return p

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('niches', nargs='*', help='Niches à scanner')
    parser.add_argument('--query', '-q', action='append', dest='queries', help='Dorks custom')
    parser.add_argument('--skip-to', type=int, default=1, help='Reprendre depuis étape N')
    parser.add_argument('--csv', default='/tmp/v35_report.csv')
    parser.add_argument('--md',  default='/tmp/v35_report.md')
    parser.add_argument('--score-min', type=float, default=5.0, help='Score minimum pour affichage final')
    args = parser.parse_args()

    t0 = time.time()
    print(f'\n{"="*70}')
    print(f'V35 PIPELINE — {time.strftime("%Y-%m-%d %H:%M")}')
    print(f'{"="*70}\n')

    # ── STEP 1: Discover ─────────────────────────────────────────────────────
    if args.skip_to <= 1:
        import step1_discover as s1
        domains = s1.discover(
            niches=args.niches or None,
            extra_queries=args.queries,
        )
        save('discovered', list(domains))
    else:
        domains = set(json.load(open(TMP / 'v35_discovered.json')))
        print(f'[SKIP] Step 1 — {len(domains)} domaines chargés depuis cache')

    if not domains:
        print('STOP: aucun domaine découvert (configurer GOOGLE_API_KEY ou installer googlesearch-python)')
        sys.exit(1)

    # ── STEP 2: CMS + Transaction ─────────────────────────────────────────────
    if args.skip_to <= 2:
        import step2_cms as s2
        cms_results = s2.run(list(domains))
        save('cms', cms_results)
    else:
        cms_results = json.load(open(TMP / 'v35_cms.json'))
        print(f'[SKIP] Step 2 — {len(cms_results)} domaines chargés depuis cache')

    if not cms_results:
        print('STOP: aucun site transactionnel détecté')
        sys.exit(1)

    # ── STEP 3: Traffic ───────────────────────────────────────────────────────
    if args.skip_to <= 3:
        import step3_traffic as s3
        traffic_results = s3.run(cms_results)
        save('traffic', traffic_results)
    else:
        traffic_results = json.load(open(TMP / 'v35_traffic.json'))
        print(f'[SKIP] Step 3 — {len(traffic_results)} domaines chargés depuis cache')

    if not traffic_results:
        print('STOP: aucun site dans la zone de trafic rentable')
        sys.exit(1)

    # ── STEP 4: Keywords & CPC ────────────────────────────────────────────────
    if args.skip_to <= 4:
        import step4_keywords as s4
        keyword_results = s4.run(traffic_results)
        save('keywords', keyword_results)
    else:
        keyword_results = json.load(open(TMP / 'v35_keywords.json'))
        print(f'[SKIP] Step 4 — {len(keyword_results)} domaines chargés depuis cache')

    if not keyword_results:
        print('STOP: aucun site avec CPC suffisant')
        sys.exit(1)

    # ── STEP 5: Score & Rapport ───────────────────────────────────────────────
    import step5_score as s5
    rows = s5.run(keyword_results, output_csv=args.csv, output_md=args.md)

    # ── Filtrage score-min ────────────────────────────────────────────────────
    rows = [r for r in rows if r['score'] >= args.score_min]

    # ── Résumé final ──────────────────────────────────────────────────────────
    elapsed = time.time() - t0
    winners = [r for r in rows if r['score'] >= 7.5]
    print(f'\n{"="*70}')
    print(f'PIPELINE TERMINÉ en {elapsed:.0f}s')
    print(f'  Découverts  : {len(domains)} domaines')
    print(f'  Qualifiés   : {len(rows)} (score ≥ {args.score_min})')
    print(f'  Winners     : {len(winners)} (score ≥ 7.5) → Cloner rapidement')
    print(f'  CSV         : {args.csv}')
    print(f'  Markdown    : {args.md}')
    print(f'{"="*70}\n')

    # ── Résumé winners par niche ──────────────────────────────────────────────
    if winners:
        from collections import defaultdict
        by_niche = defaultdict(list)
        for r in winners:
            by_niche[r['niche'] or 'N/A'].append(r)
        print(f'{"NICHE":<20} {"WINNERS":>7} {"SCORE MOY":>10}')
        print('-' * 40)
        for niche, sites in sorted(by_niche.items(), key=lambda x: -len(x[1])):
            avg = sum(s['score'] for s in sites) / len(sites)
            print(f'{niche:<20} {len(sites):>7} {avg:>9.1f}')

if __name__ == '__main__':
    main()

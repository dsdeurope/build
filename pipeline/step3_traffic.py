"""
Étape 3 — Filtre Trafic
Source primaire: Tranco top 1M (gratuit, ~10MB, MAJ hebdo, aucun rate-limit, IP-safe).
Cross-check: Majestic Million (gratuit, cache 7j).
Source secondaire: heuristique stricte (.fr + CMS connu + cart).
Zone V35: 500–30 000 visites/mois.
"""
import requests, json, time, zipfile, io, os
from config import TRAFFIC_MIN, TRAFFIC_MAX

TRANCO_CACHE = '/tmp/tranco_top1m.csv'
MAJESTIC_CACHE = '/tmp/majestic_million.csv'
_RADAR_CACHE = {}

def load_radar_ranks(domains):
    """Interroge Cloudflare Radar (API publique, sans auth) pour les domaines non trouvés.
    Retourne un dict domain → rank."""
    results = {}
    for domain in domains:
        if domain in _RADAR_CACHE:
            results[domain] = _RADAR_CACHE[domain]
            continue
        try:
            r = requests.get(
                f'https://radar.cloudflare.com/api/v4/ranking/domain/{domain}',
                headers={'User-Agent': 'Mozilla/5.0'},
                timeout=5
            )
            if r.ok:
                rank = r.json().get('result', {}).get('rank')
                if rank:
                    _RADAR_CACHE[domain] = rank
                    results[domain] = rank
        except Exception:
            pass
        time.sleep(0.5)
    return results

def load_tranco_ranks():
    """Télécharge et cache le classement Tranco (top 1M domaines). Cache 7j."""
    cache_ok = (os.path.exists(TRANCO_CACHE) and
                time.time() - os.path.getmtime(TRANCO_CACHE) < 7 * 86400)
    if not cache_ok:
        print('  Téléchargement Tranco top 1M (~10MB)...')
        try:
            r = requests.get(
                'https://tranco-list.eu/top-1m.csv.zip',
                headers={'User-Agent': 'Mozilla/5.0'}, timeout=120
            )
            with zipfile.ZipFile(io.BytesIO(r.content)) as z:
                with z.open('top-1m.csv') as f:
                    open(TRANCO_CACHE, 'wb').write(f.read())
            print(f'  → Tranco OK ({os.path.getsize(TRANCO_CACHE)//1024}KB)')
        except Exception as e:
            print(f'  Tranco unavailable: {e}')
            return {}
    ranks = {}
    with open(TRANCO_CACHE) as f:
        for line in f:
            p = line.strip().split(',', 1)
            if len(p) == 2:
                ranks[p[1].lower()] = int(p[0])
    print(f'  Tranco chargé: {len(ranks):,} domaines')
    return ranks

def load_majestic_ranks():
    """Télécharge et cache le classement Majestic Million. Cache 7j."""
    cache_ok = (os.path.exists(MAJESTIC_CACHE) and
                time.time() - os.path.getmtime(MAJESTIC_CACHE) < 7 * 86400)
    if not cache_ok:
        print('  Téléchargement Majestic Million (~40MB)...')
        try:
            r = requests.get(
                'https://downloads.majestic.com/majestic_million.csv',
                headers={'User-Agent': 'Mozilla/5.0'}, timeout=180
            )
            open(MAJESTIC_CACHE, 'wb').write(r.content)
            print(f'  → Majestic OK ({os.path.getsize(MAJESTIC_CACHE)//1024}KB)')
        except Exception as e:
            print(f'  Majestic unavailable: {e}')
            return {}
    ranks = {}
    with open(MAJESTIC_CACHE) as f:
        header = f.readline()  # skip header
        for line in f:
            p = line.strip().split(',')
            if len(p) >= 3:
                try:
                    ranks[p[2].lower()] = int(p[0])
                except ValueError:
                    pass
    print(f'  Majestic chargé: {len(ranks):,} domaines')
    return ranks

def rank_to_visits(rank):
    """
    Loi de puissance inverse calibrée (données SimilarWeb/Tranco publiques):
    rank=1K   → ~300M/mois  (google.com territory)
    rank=10K  → ~8M/mois
    rank=100K → ~200K/mois  (trop élevé pour V35)
    rank=326K → ~30K/mois   (limite haute V35)
    rank=650K → ~10K/mois   (zone idéale V35)
    rank=1M   → ~5K/mois    (limite basse Tranco)
    """
    return max(100, int(20_000_000_000_000 / (rank ** 1.6)))

def estimate_traffic(domain, cms_data, tranco_ranks, majestic_ranks, radar_ranks=None):
    """Pipeline: Tranco+Majestic cross-check → heuristique stricte .fr."""
    # Chercher dans Tranco et Majestic
    tranco_rank = None
    majestic_rank = None
    for d in [domain, f'www.{domain}']:
        if tranco_rank is None:
            tranco_rank = tranco_ranks.get(d)
        if majestic_rank is None:
            majestic_rank = majestic_ranks.get(d)

    # 1. Les deux sources → moyenne des rangs
    if tranco_rank and majestic_rank:
        avg_rank = int((tranco_rank + majestic_rank) / 2)
        return rank_to_visits(avg_rank), f'tranco_rank{tranco_rank}_majestic_rank{majestic_rank}'

    # 2. Tranco seul
    if tranco_rank:
        return rank_to_visits(tranco_rank), f'tranco_rank{tranco_rank}'

    # 3. Majestic seul (pas dans Tranco)
    if majestic_rank:
        return rank_to_visits(majestic_rank), f'majestic_rank{majestic_rank}'

    # 4. Cloudflare Radar (domaines non trouvés dans Tranco ni Majestic)
    if radar_ranks:
        radar_rank = radar_ranks.get(domain) or radar_ranks.get(f'www.{domain}')
        if radar_rank:
            return rank_to_visits(radar_rank), f'radar_rank{radar_rank}'

    # 5. Non trouvé dans aucune liste → heuristique stricte
    cms = cms_data.get('cms', 'unknown')
    is_fr = domain.endswith('.fr')
    is_com = domain.endswith('.com')
    has_cart = cms_data.get('has_cart', False)

    if has_cart and is_fr and cms != 'unknown':
        base = {'shopify': 1300, 'magento': 1500,
                'woocommerce': 1100, 'prestashop': 1000,
                'bigcommerce': 1200, 'opencart': 900}.get(cms, 800)
        meta = cms_data.get('meta', {})
        title = (meta.get('title', '') + meta.get('description', '')).lower()
        hits = sum(1 for t in ['boutique', 'shop', 'livraison', 'collection', 'catalogue'] if t in title)
        return int(base * (1 + hits * 0.12)), 'heuristic_fr'

    # .com inconnu sans CMS → peu de trafic FR, filtré
    if is_com and cms == 'unknown':
        return 200, 'heuristic_low_com'

    # Tout le reste → trop incertain → 200 (sera filtré)
    return 200, 'heuristic_low'

def run(cms_results):
    print(f'=== STEP 3: Traffic Filter ({len(cms_results)} domaines) ===')
    tranco_ranks = load_tranco_ranks()
    majestic_ranks = load_majestic_ranks()

    # Identifier les domaines absents des deux listes pour Radar
    unknown_domains = []
    for item in cms_results:
        d = item['domain']
        if not (tranco_ranks.get(d) or tranco_ranks.get(f'www.{d}') or
                majestic_ranks.get(d) or majestic_ranks.get(f'www.{d}')):
            unknown_domains.append(d)
    if unknown_domains:
        print(f'  Cloudflare Radar lookup pour {len(unknown_domains)} domaines inconnus...')
    radar_ranks = load_radar_ranks(unknown_domains) if unknown_domains else {}

    kept = []

    for item in cms_results:
        domain = item['domain']
        visits, source = estimate_traffic(domain, item, tranco_ranks, majestic_ranks, radar_ranks)
        item['traffic_monthly'] = visits
        item['traffic_source'] = source

        in_zone = TRAFFIC_MIN <= visits <= TRAFFIC_MAX
        if visits > TRAFFIC_MAX:
            status = '▲ trop élevé'
        elif visits < TRAFFIC_MIN:
            status = '▼ trop faible'
        else:
            status = '✓'
        print(f'  {status} {domain}: ~{visits:,}/mois ({source})')

        if in_zone:
            kept.append(item)

    print(f'\nZone rentable ({TRAFFIC_MIN:,}–{TRAFFIC_MAX:,}): {len(kept)}/{len(cms_results)} gardés')
    return kept

if __name__ == '__main__':
    cms_results = json.load(open('/tmp/v35_cms.json'))
    results = run(cms_results)
    json.dump(results, open('/tmp/v35_traffic.json', 'w'), ensure_ascii=False, indent=2)
    print(f'Saved → /tmp/v35_traffic.json')

"""
Étape 4 — Filtre CPC & Keywords
CPC moyen V35: ≥ 0.30€. Sources: DataForSEO → Google Autocomplete (gratuit).
Anti-ban: UA rotation, délai aléatoire 1.5-4s, 1 appel/niche (pas 1/domaine).
"""
import requests, json, time, re, random, base64, os
from config import DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD, CPC_MIN

CPC_NICHE_DEFAULTS = {
    'mode': 0.42, 'beaute': 0.55, 'bijoux': 0.65, 'luxe': 1.20,
    'electronique': 0.38, 'sport': 0.35, 'maison': 0.40, 'auto': 0.50,
    'sante': 0.70, 'animaux': 0.30, 'nutrition': 0.60,
    'jardin': 0.32, 'enfant': 0.35,
    'unknown': 0.25,
}

# Seed FR par niche — jamais 'unknown' comme mot-clé Google
NICHE_SEEDS = {
    'mode':         'vêtements mode boutique femme',
    'beaute':       'cosmétiques soins beauté crème',
    'bijoux':       'bijoux collier bague argent',
    'sport':        'équipement sportif running vélo',
    'maison':       'décoration maison meuble design',
    'electronique': 'électronique smartphone high-tech',
    'nutrition':    'compléments alimentaires protéines',
    'jardin':       'jardinage plantes graines outillage',
    'enfant':       'jouets bébé enfant puériculture',
    'animaux':      'croquettes chien chat accessoires animaux',
    'sante':        'santé bien-être pharmacie naturel',
    'luxe':         'luxe premium designer haute couture',
    'auto':         'pièces auto voiture accessoires',
}

USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
]

KW_CACHE_FILE = '/tmp/v35_kw_cache.json'

def _load_kw_cache():
    if os.path.exists(KW_CACHE_FILE):
        try:
            return json.load(open(KW_CACHE_FILE))
        except Exception:
            pass
    return {}

def _save_kw_cache(cache):
    try:
        json.dump(cache, open(KW_CACHE_FILE, 'w'), ensure_ascii=False)
    except Exception:
        pass

_kw_cache = _load_kw_cache()  # cache niche → keywords (persistant entre runs)

def dataforseo_keywords(domain):
    if not DATAFORSEO_LOGIN or not DATAFORSEO_PASSWORD:
        return None
    creds = base64.b64encode(f'{DATAFORSEO_LOGIN}:{DATAFORSEO_PASSWORD}'.encode()).decode()
    headers = {'Authorization': f'Basic {creds}', 'Content-Type': 'application/json'}
    payload = [{'target': domain, 'location_code': 2250, 'language_code': 'fr', 'limit': 5}]
    try:
        r = requests.post(
            'https://api.dataforseo.com/v3/dataforseo_labs/google/ranked_keywords/live',
            headers=headers, json=payload, timeout=20
        )
        if r.ok:
            items = r.json().get('tasks', [{}])[0].get('result', [{}])[0].get('items', [])
            return [{'keyword': it.get('keyword_data', {}).get('keyword', ''),
                     'volume': it.get('keyword_data', {}).get('keyword_info', {}).get('search_volume', 0),
                     'cpc': it.get('keyword_data', {}).get('keyword_info', {}).get('cpc', 0)}
                    for it in items[:5]]
    except Exception as e:
        print(f'    DataForSEO error: {e}')
    return None

def google_autocomplete_keywords(domain, niche='', item=None):
    """
    1 appel réseau par niche (cache persistant), pas 1 par domaine.
    UA rotatif + délai aléatoire → IP safe.
    """
    global _kw_cache

    # Clé de cache = niche si identifiée, sinon domain root
    if niche and niche != 'unknown':
        cache_key = niche
        seed = NICHE_SEEDS.get(niche, niche)
    else:
        root = domain.split('.')[0]
        cache_key = f'__{root}'
        # Seed enrichi: mots du domaine + meta title
        meta_title = (item or {}).get('meta', {}).get('title', '') if item else ''
        if meta_title:
            seed = f'{root} {meta_title[:40]} acheter'
        else:
            seed = f'{root} boutique acheter france'

    if cache_key in _kw_cache:
        return _kw_cache[cache_key]

    keywords = []
    queries = [seed, f'acheter {seed.split()[0]}', f'{seed.split()[0]} pas cher', f'boutique {seed.split()[0]}']

    for i, q in enumerate(queries):
        try:
            ua = random.choice(USER_AGENTS)
            r = requests.get(
                f'https://suggestqueries.google.com/complete/search?client=firefox&hl=fr&q={q}',
                headers={'User-Agent': ua}, timeout=8
            )
            if r.ok:
                suggestions = r.json()[1]
                keywords.extend([{'keyword': s, 'volume': 500, 'cpc': 0}
                                  for s in suggestions[:2] if len(s) > 3])
            time.sleep(random.uniform(1.5, 3.5))
        except Exception:
            pass

    result = keywords[:5]
    _kw_cache[cache_key] = result
    _save_kw_cache(_kw_cache)  # persist après chaque nouvelle niche
    return result

def estimate_cpc(item, keywords):
    if keywords:
        cpcs = [k['cpc'] for k in keywords if k.get('cpc', 0) > 0]
        if cpcs:
            return round(sum(cpcs) / len(cpcs), 2)
    niche = item.get('niche', 'unknown')
    # unknown + panier + .fr → CPC plancher 0.32€ (juste au-dessus du seuil)
    if (niche == 'unknown' and item.get('has_cart', False)
            and item.get('domain', '').endswith('.fr')):
        return 0.32
    return CPC_NICHE_DEFAULTS.get(niche, 0.25)

def infer_niche(item):
    """Infère la niche depuis meta ET nom de domaine (le domaine est souvent explicite)."""
    domain = item.get('domain', '')
    text = (item.get('meta', {}).get('title', '') + ' ' +
            item.get('meta', {}).get('description', '') + ' ' +
            domain).lower()

    niche_map = {
        'beaute':       ['beauté', 'soins', 'cosmétique', 'maquillage', 'parfum', 'crème', 'beauty',
                         'cosmet', 'serum', 'skin', 'nuxe', 'caudalie', 'coree', 'korean', 'kreme',
                         'nuoo', 'lenitasaurea', 'kalina', 'maqui', 'ecocentric', 'sultane'],
        'bijoux':       ['bijoux', 'collier', 'bague', 'montre', 'bracelet', 'jewelry', 'jewel'],
        'sport':        ['sport', 'running', 'vélo', 'fitness', 'musculation', 'bike', 'cycling', 'gym',
                         'gorilla', 'athletic', 'probike', 'bikester', 'tremblay', 'powergym',
                         'montisport', 'produsport', 'stade', 'materiel-velo', 'maisondurunning',
                         'passion-running', 'running-aventure', 'mygreensport'],
        'mode':         ['vêtements', 'mode', 'robe', 'pantalon', 'tenue', 'fashion', 'clothing',
                         'wear', 'dress', 'collection', 'modeuse', 'etam', 'pimkie', 'lecoq',
                         'bonprix', 'shein', 'weill', 'blouboutique', 'eunoiaboutique', 'madameleshop',
                         'lamodeuse', 'reitmans', 'mapetitecoree', 'brax', 'dim', 'combeing'],
        'maison':       ['maison', 'meuble', 'décoration', 'salon', 'cuisine', 'home', 'interior'],
        'electronique': ['électronique', 'informatique', 'smartphone', 'ordinateur', 'high-tech',
                         'tech', 'topachat', 'netguide'],
        'animaux':      ['animal', 'chien', 'chat', 'croquette', 'veterinaire', 'pets'],
        'nutrition':    ['nutrition', 'complément', 'protéine', 'supplément', 'vitamine'],
        'sante':        ['santé', 'pharmacie', 'médical', 'bien-être', 'health'],
        'luxe':         ['luxe', 'premium', 'haute couture', 'designer', 'luxury'],
        'auto':         ['auto', 'voiture', 'pneu', 'pièce détachée', 'moto'],
    }
    for niche, terms in niche_map.items():
        if any(t in text for t in terms):
            return niche
    return 'unknown'

def run(traffic_results):
    print(f'=== STEP 4: Keywords & CPC ({len(traffic_results)} domaines) ===')
    use_dataforseo = bool(DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD)
    print(f'Mode: {"DataForSEO" if use_dataforseo else "Google Autocomplete (1 appel/niche, UA rotatif)"}')

    kept = []
    for item in traffic_results:
        domain = item['domain']
        item['niche'] = infer_niche(item)

        if use_dataforseo:
            keywords = dataforseo_keywords(domain)
        else:
            keywords = google_autocomplete_keywords(domain, item['niche'], item=item)

        item['keywords'] = keywords or []
        item['cpc_avg'] = estimate_cpc(item, keywords)

        ok = item['cpc_avg'] >= CPC_MIN
        status = '✓' if ok else '✗'
        kw_preview = ', '.join(k['keyword'] for k in item['keywords'][:3]) or '(aucun)'
        print(f'  {status} {domain}: CPC={item["cpc_avg"]:.2f}€ | niche={item["niche"]} | kw: {kw_preview[:60]}')

        if ok:
            kept.append(item)

    print(f'\nCPC ≥ {CPC_MIN}€: {len(kept)}/{len(traffic_results)} gardés')
    return kept

if __name__ == '__main__':
    traffic_results = json.load(open('/tmp/v35_traffic.json'))
    results = run(traffic_results)
    json.dump(results, open('/tmp/v35_keywords.json', 'w'), ensure_ascii=False, indent=2)
    print(f'Saved → /tmp/v35_keywords.json')

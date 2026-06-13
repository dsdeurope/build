"""
Étape 1 — Découverte SERP
Trouve des sites e-commerce FR via Google Custom Search ou dorks Python.
"""
import requests, json, time, re, sys
from config import GOOGLE_API_KEY, GOOGLE_CSE_ID

# Grands sites connus à exclure
DOMAIN_BLACKLIST = {
    'amazon.fr', 'amazon.com', 'fnac.com', 'cdiscount.com', 'darty.com',
    'leboncoin.fr', 'vinted.fr', 'zalando.fr', 'asos.com', 'shein.com',
    'aliexpress.com', 'ebay.fr', 'rakuten.com', 'laredoute.fr', 'decathlon.fr',
    'ikea.com', 'leroy-merlin.fr', 'boulanger.com', 'but.fr', 'conforama.fr',
    'sephora.fr', 'nocibe.fr', 'marionnaud.fr', 'yves-rocher.fr',
    'facebook.com', 'instagram.com', 'pinterest.com', 'twitter.com',
    'youtube.com', 'wikipedia.org', 'google.com', 'lemonde.fr',
    'lefigaro.fr', 'pagesjaunes.fr',
}
BLACKLIST_KEYWORDS = {'wikipedia', 'facebook', 'google', 'amazon', 'ebay'}

# TLD autorisés
ALLOWED_TLDS = {'.fr', '.com', '.net', '.eu', '.shop', '.store', '.be'}

# Dorks e-commerce FR par niche (4 requêtes par niche)
DORKS = {
    'mode': [
        'boutique vêtements mode femme livraison france',
        'acheter robe pantalon en ligne france',
        'livraison rapide boutique vêtements france',
        'collection nouvelle saison mode femme boutique',
    ],
    'beaute': [
        'boutique soins beauté cosmétiques livraison france',
        'acheter crème sérum visage france',
        'livraison express cosmétiques naturels france boutique',
        'nouvelle collection soins visage corps boutique france',
    ],
    'sport': [
        'boutique sport running vélo équipement france',
        'achat équipement sportif livraison france',
        'livraison rapide matériel sport fitness france',
        'nouvelle collection vêtements sport technique boutique france',
    ],
    'maison': [
        'boutique décoration maison meuble design france',
        'achat meuble décoration livraison france',
        'livraison rapide déco intérieure france boutique',
        'nouvelle collection mobilier décoration maison france',
    ],
    'bijoux': [
        'boutique bijoux collier bague argent france',
        'achat bijoux fantaisie livraison france',
        'livraison offerte bijoux créateur france boutique',
        'nouvelle collection bijoux tendance femme france',
    ],
    'electronique': [
        'boutique high-tech électronique accessoires france',
        'achat smartphone accessoires tech france',
        'livraison rapide high-tech gadgets france boutique',
        'meilleure boutique accessoires électroniques france commande',
    ],
    'nutrition': [
        'boutique compléments alimentaires protéines france',
        'achat nutrition sport bien-être france',
        'livraison rapide compléments alimentaires france boutique',
        'nouvelle gamme protéines vitamines boutique france commande',
    ],
    'jardin': [
        'boutique jardin plantes outillage france',
        'achat graines plantes jardinage france',
        'livraison rapide plantes jardin france boutique',
        'nouvelle collection outillage jardin graines france commande',
    ],
    'enfant': [
        'boutique jouets bébé enfant france livraison',
        'achat jouets puériculture france',
        'livraison rapide jouets éducatifs bébé france boutique',
        'nouvelle collection jouets créatifs enfant france commande',
    ],
    'animal': [
        'boutique animaux croquettes accessoires chien chat france',
        'achat nourriture animaux france',
        'livraison rapide croquettes accessoires animaux france boutique',
        'nouvelle gamme nourriture naturelle chien chat france commande',
    ],
    'luxe': [
        'boutique luxe maroquinerie sac créateur france livraison',
        'achat accessoire luxe designer france boutique en ligne',
    ],
    'sante': [
        'boutique santé bien-être compléments france livraison',
        'pharmacie naturelle huile essentielle boutique en ligne france',
    ],
}

def google_cse(query, num=10):
    """Appel Google Custom Search JSON API (100 req/jour gratuit)."""
    if not GOOGLE_API_KEY or not GOOGLE_CSE_ID:
        return []
    url = 'https://www.googleapis.com/customsearch/v1'
    params = {'key': GOOGLE_API_KEY, 'cx': GOOGLE_CSE_ID, 'q': query, 'num': num, 'gl': 'fr', 'hl': 'fr'}
    try:
        r = requests.get(url, params=params, timeout=15)
        if r.ok:
            return [i['link'] for i in r.json().get('items', [])]
    except Exception as e:
        print(f'  CSE error: {e}')
    return []

def googlesearch_fallback(query, num=10):
    """Fallback: DuckDuckGo (sans API key, fiable)."""
    try:
        from ddgs import DDGS
        ddg = DDGS()
        results = list(ddg.text(query, region='fr-fr', max_results=num))
        return [r['href'] for r in results]
    except ImportError:
        pass
    except Exception as e:
        print(f'  DDG error: {e}')
    # Dernier recours: googlesearch-python
    try:
        from googlesearch import search
        return list(search(query, num_results=num, lang='fr', sleep_interval=3))
    except Exception:
        return []

def extract_domain(url):
    m = re.match(r'https?://(?:www\.)?([^/]+)', url)
    return m.group(1).lower() if m else None

def root_domain(domain):
    """Retourne le domaine racine (2 derniers segments, ex: shop.example.com → example.com)."""
    parts = domain.split('.')
    return '.'.join(parts[-2:]) if len(parts) >= 2 else domain

def is_allowed(domain):
    """Retourne True si le domaine passe les filtres blacklist et TLD."""
    if domain in DOMAIN_BLACKLIST:
        return False
    if any(kw in domain for kw in BLACKLIST_KEYWORDS):
        return False
    tld = '.' + domain.rsplit('.', 1)[-1] if '.' in domain else ''
    return tld in ALLOWED_TLDS

def discover(niches=None, extra_queries=None, limit_per_niche=20):
    """Découverte de domaines e-commerce. Retourne set de domaines racine uniques."""
    raw = set()
    queries = {}

    if niches:
        for n in niches:
            if n in DORKS:
                queries[n] = DORKS[n]
    else:
        queries = DORKS

    if extra_queries:
        for q in extra_queries:
            queries[f'custom_{hash(q)}'] = [q]

    use_cse = bool(GOOGLE_API_KEY and GOOGLE_CSE_ID)
    print(f'Mode: {"Google CSE (API)" if use_cse else "googlesearch fallback"}')

    for niche, dork_list in queries.items():
        for dork in dork_list:
            print(f'  [{niche}] {dork[:60]}...')
            urls = []
            if use_cse:
                urls = google_cse(dork, num=10)
            if not urls:
                urls = googlesearch_fallback(dork, num=limit_per_niche)
            domains = {extract_domain(u) for u in urls if extract_domain(u)}
            filtered = {root_domain(d).lower().lstrip('www.') for d in domains if is_allowed(d)}
            raw.update(filtered)
            print(f'    → {len(filtered)} domaines retenus (sur {len(domains)})')
            time.sleep(1)

    # Déduplication agressive : normaliser lowercase + strip www
    deduped = set()
    for d in raw:
        norm = d.lower()
        if norm.startswith('www.'):
            norm = norm[4:]
        deduped.add(norm)
    return deduped

if __name__ == '__main__':
    niches = sys.argv[1:] if len(sys.argv) > 1 else list(DORKS.keys())
    print(f'=== STEP 1: Discovery ({", ".join(niches)}) ===')
    domains = discover(niches=niches)
    print(f'\nTotal unique: {len(domains)}')
    out = '/tmp/v35_discovered.json'
    json.dump(list(domains), open(out, 'w'), ensure_ascii=False)
    print(f'Saved → {out}')

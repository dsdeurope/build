"""
Étape 2 — Filtre Technique
Détecte le CMS et valide la présence d'un tunnel d'achat.
"""
import requests, re, json, time, concurrent.futures
from config import CMS_SIGNATURES, TRANSACTION_SIGNALS

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'fr-FR,fr;q=0.9',
}

def detect_cms(html, headers_str=''):
    """Fingerprint CMS depuis HTML + headers."""
    text = (html + headers_str).lower()
    for cms, sigs in CMS_SIGNATURES.items():
        if any(s.lower() in text for s in sigs):
            return cms
    if 'wp-content' in text or 'wordpress' in text:
        return 'wordpress'
    return 'unknown'

def has_transaction(domain, html=''):
    """Vérifie présence de signaux transactionnels."""
    text = html.lower()
    # Check HTML content
    if any(s.lower() in text for s in TRANSACTION_SIGNALS):
        return True
    # Check cart/checkout via HEAD requests
    for path in ['/cart', '/panier', '/checkout', '/commande', '/shop']:
        try:
            r = requests.head(f'https://{domain}{path}', headers=HEADERS, timeout=5, allow_redirects=True)
            if r.status_code in (200, 301, 302, 303):
                return True
        except:
            pass
    return False

def analyze_domain(domain):
    """Analyse complète d'un domaine: CMS + transaction signals."""
    result = {
        'domain': domain,
        'reachable': False,
        'cms': 'unknown',
        'has_cart': False,
        'https': False,
        'meta': {},
    }
    try:
        for scheme in ['https', 'http']:
            try:
                timeout = 8 if scheme == 'https' else 12
                r = requests.get(f'{scheme}://{domain}', headers=HEADERS, timeout=timeout,
                                 allow_redirects=True)
                result['reachable'] = True
                result['https'] = scheme == 'https'
                result['status'] = r.status_code
                html = r.text[:50000]  # 50KB max
                result['cms'] = detect_cms(html, str(r.headers))
                result['has_cart'] = has_transaction(domain, html)
                # Meta title/description
                title = re.search(r'<title[^>]*>(.*?)</title>', html, re.I|re.S)
                desc  = re.search(r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)', html, re.I)
                result['meta']['title']       = title.group(1).strip()[:80] if title else ''
                result['meta']['description'] = desc.group(1).strip()[:150] if desc else ''
                # Quality score 0-5
                score = 0
                if scheme == 'https':                                  score += 1
                if re.search(r'<meta[^>]+name=["\']viewport["\']', html, re.I): score += 1
                if re.search(r'<link[^>]+rel=["\']canonical["\']',  html, re.I): score += 1
                if result['cms'] != 'unknown':                         score += 1
                if result['has_cart']:                                 score += 1
                result['quality_score'] = score
                break
            except requests.exceptions.SSLError:
                continue
    except Exception as e:
        result['error'] = str(e)[:60]
    return result

def run(domains, workers=8):
    print(f'=== STEP 2: CMS Detection ({len(domains)} domaines, {workers} threads) ===')
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as ex:
        futures = {ex.submit(analyze_domain, d): d for d in domains}
        for i, fut in enumerate(concurrent.futures.as_completed(futures), 1):
            r = fut.result()
            score = r.get('quality_score', 0)
            status = '✓' if score >= 2 else '✗'
            print(f'  [{i}/{len(domains)}] {status} {r["domain"]} → {r["cms"]} | cart:{r["has_cart"]} | q:{score}')
            results.append(r)
    # Filtre: quality_score >= 2
    transactional = [r for r in results if r.get('quality_score', 0) >= 2]
    print(f'\nQualité ≥2: {len(transactional)}/{len(results)} gardés')
    return transactional

if __name__ == '__main__':
    domains = json.load(open('/tmp/v35_discovered.json'))
    results = run(domains)
    json.dump(results, open('/tmp/v35_cms.json', 'w'), ensure_ascii=False, indent=2)
    print(f'Saved → /tmp/v35_cms.json')

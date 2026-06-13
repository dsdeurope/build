"""V35 Pipeline — configuration centrale."""

# ── Google Custom Search ──────────────────────────────────────────────────────
# Obtenir sur: console.cloud.google.com → API & Services → Custom Search JSON API
# + Créer un moteur sur: cse.google.com (100 req/jour gratuit)
GOOGLE_API_KEY = ''   # AIzaSy...
GOOGLE_CSE_ID  = ''   # ex: 017576662512468239146:omuauf8t8yc

# ── DataForSEO (optionnel — CPC réel) ────────────────────────────────────────
# pay-per-use ~0.001€/req, 1000 crédits offerts à l'inscription
DATAFORSEO_LOGIN    = ''
DATAFORSEO_PASSWORD = ''

# ── Filtres V35 ───────────────────────────────────────────────────────────────
TRAFFIC_MIN   = 500       # visites/mois minimum
TRAFFIC_MAX   = 30_000    # visites/mois maximum
CPC_MIN       = 0.30      # €/clic minimum
SCORE_MIN     = 5         # score minimum pour garder le domaine

# ── CMS fingerprints ──────────────────────────────────────────────────────────
CMS_SIGNATURES = {
    'shopify':      ['cdn.shopify.com', 'myshopify.com', 'shopify.css', 'Shopify.theme'],
    'woocommerce':  ['woocommerce', 'wp-content/plugins/woo', 'wc-ajax'],
    'prestashop':   ['prestashop', '/modules/ps_', 'PrestaShop'],
    'magento':      ['Mage.', '/mage/', 'magento', 'Magento_'],
    'bigcommerce':  ['cdn11.bigcommerce.com', 'bigcommerce'],
    'webflow':      ['webflow.js', 'Webflow'],
    'squarespace':  ['squarespace.com', 'squarespace-cdn', 'static1.squarespace'],
    'opencart':     ['opencart', 'catalog/view/theme'],
    'sylius':       ['sylius', '/sylius/', 'Sylius\\\\'],
    'shopware':     ['shopware', 'sw-plugin', 'storefront/js/'],
    'wix':          ['wix.com', 'wixstatic.com', 'X-Wix-'],
    'salesforce':   ['demandware', 'salesforce-cc'],
    'vtex':         ['vtex', 'vtexcommerce'],
}

# Signaux transactionnels obligatoires (au moins 1)
TRANSACTION_SIGNALS = [
    '/cart', '/checkout', '/panier', '/commande',
    '/product', '/produit', '/shop', '/boutique',
    'add-to-cart', 'ajouter-au-panier', '/acheter',
]

# Produits universels (score élevé) vs locaux (score bas)
UNIVERSAL_KEYWORDS = [
    'chaussures', 'vêtements', 'bijoux', 'montres', 'électronique',
    'maison', 'beauté', 'sport', 'mode', 'cosmétiques',
    'shoes', 'clothing', 'jewelry', 'electronics', 'furniture',
]

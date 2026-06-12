// Multilingual skeleton extension — subdirectory strategy
// Generates: includes/i18n.php, includes/router.php, per-lang data files

export function i18nPhp() {
  return `<?php
// i18n helper — loads strings for current LANG constant
define('SUPPORTED_LANGS', ['fr','de','es','it','nl','pt','pl','sv','da','en','ro']);
define('DEFAULT_LANG', 'fr');

function t(string $key): string {
    global $_i18n;
    return $_i18n[$key] ?? $key;
}

function langUrl(string $lang, string $path = ''): string {
    return SITE_URL . '/' . $lang . '/' . ltrim($path, '/');
}

function hreflangTags(): string {
    $out = '';
    foreach(SUPPORTED_LANGS as $l) {
        $out .= '<link rel="alternate" hreflang="' . $l . '" href="' . langUrl($l) . '">' . PHP_EOL;
    }
    $out .= '<link rel="alternate" hreflang="x-default" href="' . langUrl(DEFAULT_LANG) . '">' . PHP_EOL;
    return $out;
}

// Load strings
$_i18n_file = __DIR__ . '/../data/strings/' . LANG . '.json';
$_i18n = is_file($_i18n_file) ? (json_decode(file_get_contents($_i18n_file), true) ?? []) : [];
`;
}

export function routerPhp() {
  return `<?php
// Front controller — detects language from URL segment
// URL structure: /{lang}/{...rest}  or  / → redirect to /fr/

define('SUPPORTED_LANGS_R', ['fr','de','es','it','nl','pt','pl','sv','da','en','ro']);

$uri  = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$segs = array_values(array_filter(explode('/', $uri)));

$lang = (!empty($segs[0]) && in_array($segs[0], SUPPORTED_LANGS_R)) ? $segs[0] : 'fr';
$path = implode('/', array_slice($segs, in_array($segs[0] ?? '', SUPPORTED_LANGS_R) ? 1 : 0));

define('LANG', $lang);
define('URL_PATH', $path);

// Redirect bare / to /fr/
if (empty($segs)) {
    header('Location: /fr/', true, 302);
    exit;
}
// Redirect /something (no lang prefix) to /fr/something
if (!in_array($segs[0] ?? '', SUPPORTED_LANGS_R) && !empty($segs)) {
    header('Location: /fr/' . ltrim($uri, '/'), true, 302);
    exit;
}

require_once __DIR__ . '/includes/config.php';
require_once __DIR__ . '/includes/i18n.php';

// Route
match(true) {
    $path === '' || $path === 'index'         => require __DIR__ . '/pages/home.php',
    $path === 'collections'                   => require __DIR__ . '/pages/collections.php',
    str_starts_with($path, 'collections/')    => (function() use($path){
        $_GET['handle'] = basename($path);
        require __DIR__ . '/pages/collection.php';
    })(),
    $path === 'blog'                          => require __DIR__ . '/pages/blog.php',
    str_starts_with($path, 'blog/')           => (function() use($path){
        $_GET['slug'] = basename($path);
        require __DIR__ . '/pages/article.php';
    })(),
    str_starts_with($path, 'sitemap')         => require __DIR__ . '/pages/sitemap.php',
    default                                   => (function(){
        http_response_code(404);
        require __DIR__ . '/pages/404.php';
    })(),
};
`;
}

export function htaccessMultilang() {
  return `Options -Indexes
ServerSignature Off

<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set X-Frame-Options "SAMEORIGIN"
  Header always set X-XSS-Protection "1; mode=block"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
</IfModule>

<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /

  # Skip existing files/dirs
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d

  # Route everything through router.php (front controller)
  RewriteRule ^ router.php [L,QSA]
</IfModule>

<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType text/css "access plus 1 year"
  ExpiresByType application/javascript "access plus 1 year"
  ExpiresByType image/webp "access plus 1 year"
  ExpiresByType image/jpeg "access plus 1 year"
  ExpiresByType image/png "access plus 1 year"
  ExpiresByType font/woff2 "access plus 1 year"
  ExpiresByType text/html "access plus 1 hour"
</IfModule>

<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css application/javascript application/json text/xml
</IfModule>

<FilesMatch "\\.(json|env|log|sh|sql|lock)$">
  Order allow,deny
  Deny from all
</FilesMatch>
<Files "config.php">
  Order allow,deny
  Deny from all
</Files>
<Files "router.php">
  Order allow,deny
  Allow from all
</Files>
`;
}

export function stringsJson(lang, niche, brandName) {
  const strings = {
    fr: {
      nav_home: 'Accueil', nav_collections: 'Collections', nav_blog: 'Blog',
      cart: 'Panier', account: 'Mon compte', search_placeholder: 'Rechercher…',
      hero_eyebrow: '✨ Nouvelle collection', hero_cta_primary: 'Voir les collections',
      usp_delivery: 'Livraison rapide', usp_delivery_desc: 'Expédition 24-48h',
      usp_secure: 'Paiement sécurisé', usp_secure_desc: 'SSL + 3D Secure',
      usp_return: 'Retours gratuits', usp_return_desc: '14 jours pour changer d\'avis',
      usp_support: 'Service client', usp_support_desc: '7j/7 par email & chat',
      newsletter_title: 'Restez informé·e',
      newsletter_desc: 'Offres exclusives et nouveautés directement dans votre boîte mail.',
      newsletter_placeholder: 'Votre adresse email',
      newsletter_btn: 'S\'inscrire',
      newsletter_success: '✓ Merci pour votre inscription !',
      footer_legal: 'Mentions légales', footer_cgv: 'CGV', footer_privacy: 'Confidentialité',
      footer_cookies: 'Cookies', footer_contact: 'Contact', footer_faq: 'FAQ',
      footer_about: 'À propos', footer_blog: 'Blog',
      read_more: 'Lire l\'article', view_all: 'Voir tout',
      products_count: 'produits', add_to_cart: 'Ajouter', view_product: 'Voir',
      cookie_msg: 'Nous utilisons des cookies pour améliorer votre expérience.',
      cookie_accept: 'Accepter', cookie_refuse: 'Refuser',
      not_found: 'Page introuvable', back_home: 'Retour à l\'accueil',
    },
    de: {
      nav_home: 'Startseite', nav_collections: 'Kollektionen', nav_blog: 'Blog',
      cart: 'Warenkorb', account: 'Mein Konto', search_placeholder: 'Suchen…',
      hero_eyebrow: '✨ Neue Kollektion', hero_cta_primary: 'Kollektionen ansehen',
      usp_delivery: 'Schnelle Lieferung', usp_delivery_desc: 'Versand in 24-48h',
      usp_secure: 'Sicherer Kauf', usp_secure_desc: 'SSL + 3D Secure',
      usp_return: 'Kostenlose Rückgabe', usp_return_desc: '14 Tage Rückgaberecht',
      usp_support: 'Kundenservice', usp_support_desc: '7 Tage per E-Mail & Chat',
      newsletter_title: 'Bleiben Sie informiert',
      newsletter_desc: 'Exklusive Angebote und Neuheiten direkt in Ihren Posteingang.',
      newsletter_placeholder: 'Ihre E-Mail-Adresse',
      newsletter_btn: 'Anmelden',
      newsletter_success: '✓ Vielen Dank für Ihre Anmeldung!',
      footer_legal: 'Impressum', footer_cgv: 'AGB', footer_privacy: 'Datenschutz',
      footer_cookies: 'Cookies', footer_contact: 'Kontakt', footer_faq: 'FAQ',
      footer_about: 'Über uns', footer_blog: 'Blog',
      read_more: 'Artikel lesen', view_all: 'Alle ansehen',
      products_count: 'Produkte', add_to_cart: 'Hinzufügen', view_product: 'Ansehen',
      cookie_msg: 'Wir verwenden Cookies, um Ihr Erlebnis zu verbessern.',
      cookie_accept: 'Akzeptieren', cookie_refuse: 'Ablehnen',
      not_found: 'Seite nicht gefunden', back_home: 'Zurück zur Startseite',
    },
    es: {
      nav_home: 'Inicio', nav_collections: 'Colecciones', nav_blog: 'Blog',
      cart: 'Carrito', account: 'Mi cuenta', search_placeholder: 'Buscar…',
      hero_eyebrow: '✨ Nueva colección', hero_cta_primary: 'Ver colecciones',
      usp_delivery: 'Entrega rápida', usp_delivery_desc: 'Envío en 24-48h',
      usp_secure: 'Pago seguro', usp_secure_desc: 'SSL + 3D Secure',
      usp_return: 'Devoluciones gratis', usp_return_desc: '14 días para devolver',
      usp_support: 'Atención al cliente', usp_support_desc: '7 días por email y chat',
      newsletter_title: 'Mantente informado',
      newsletter_desc: 'Ofertas exclusivas y novedades directamente en tu bandeja.',
      newsletter_placeholder: 'Tu dirección de email',
      newsletter_btn: 'Suscribirse',
      newsletter_success: '✓ ¡Gracias por suscribirte!',
      footer_legal: 'Aviso legal', footer_cgv: 'Condiciones', footer_privacy: 'Privacidad',
      footer_cookies: 'Cookies', footer_contact: 'Contacto', footer_faq: 'FAQ',
      footer_about: 'Sobre nosotros', footer_blog: 'Blog',
      read_more: 'Leer artículo', view_all: 'Ver todo',
      products_count: 'productos', add_to_cart: 'Añadir', view_product: 'Ver',
      cookie_msg: 'Utilizamos cookies para mejorar tu experiencia.',
      cookie_accept: 'Aceptar', cookie_refuse: 'Rechazar',
      not_found: 'Página no encontrada', back_home: 'Volver al inicio',
    },
    it: {
      nav_home: 'Home', nav_collections: 'Collezioni', nav_blog: 'Blog',
      cart: 'Carrello', account: 'Il mio account', search_placeholder: 'Cerca…',
      hero_eyebrow: '✨ Nuova collezione', hero_cta_primary: 'Vedi le collezioni',
      usp_delivery: 'Consegna rapida', usp_delivery_desc: 'Spedizione 24-48h',
      usp_secure: 'Pagamento sicuro', usp_secure_desc: 'SSL + 3D Secure',
      usp_return: 'Resi gratuiti', usp_return_desc: '14 giorni per restituire',
      usp_support: 'Servizio clienti', usp_support_desc: '7 giorni via email e chat',
      newsletter_title: 'Rimani aggiornato',
      newsletter_desc: 'Offerte esclusive e novità direttamente nella tua casella.',
      newsletter_placeholder: 'Il tuo indirizzo email',
      newsletter_btn: 'Iscriviti',
      newsletter_success: '✓ Grazie per l\'iscrizione!',
      footer_legal: 'Note legali', footer_cgv: 'Condizioni', footer_privacy: 'Privacy',
      footer_cookies: 'Cookie', footer_contact: 'Contatto', footer_faq: 'FAQ',
      footer_about: 'Chi siamo', footer_blog: 'Blog',
      read_more: 'Leggi articolo', view_all: 'Vedi tutto',
      products_count: 'prodotti', add_to_cart: 'Aggiungi', view_product: 'Vedi',
      cookie_msg: 'Utilizziamo cookie per migliorare la tua esperienza.',
      cookie_accept: 'Accetta', cookie_refuse: 'Rifiuta',
      not_found: 'Pagina non trovata', back_home: 'Torna alla home',
    },
    en: {
      nav_home: 'Home', nav_collections: 'Collections', nav_blog: 'Blog',
      cart: 'Cart', account: 'My account', search_placeholder: 'Search…',
      hero_eyebrow: '✨ New collection', hero_cta_primary: 'Browse collections',
      usp_delivery: 'Fast delivery', usp_delivery_desc: 'Ships in 24-48h',
      usp_secure: 'Secure payment', usp_secure_desc: 'SSL + 3D Secure',
      usp_return: 'Free returns', usp_return_desc: '14-day return policy',
      usp_support: 'Customer support', usp_support_desc: '7 days via email & chat',
      newsletter_title: 'Stay in the loop',
      newsletter_desc: 'Exclusive offers and new arrivals straight to your inbox.',
      newsletter_placeholder: 'Your email address',
      newsletter_btn: 'Subscribe',
      newsletter_success: '✓ Thank you for subscribing!',
      footer_legal: 'Legal notice', footer_cgv: 'Terms', footer_privacy: 'Privacy',
      footer_cookies: 'Cookies', footer_contact: 'Contact', footer_faq: 'FAQ',
      footer_about: 'About us', footer_blog: 'Blog',
      read_more: 'Read article', view_all: 'View all',
      products_count: 'products', add_to_cart: 'Add to cart', view_product: 'View',
      cookie_msg: 'We use cookies to improve your experience.',
      cookie_accept: 'Accept', cookie_refuse: 'Decline',
      not_found: 'Page not found', back_home: 'Back to home',
    },
    nl: {
      nav_home: 'Startpagina', nav_collections: 'Collecties', nav_blog: 'Blog',
      cart: 'Winkelwagen', account: 'Mijn account', search_placeholder: 'Zoeken…',
      hero_eyebrow: '✨ Nieuwe collectie', hero_cta_primary: 'Bekijk collecties',
      usp_delivery: 'Snelle levering', usp_delivery_desc: 'Verzending in 24-48u',
      usp_secure: 'Veilig betalen', usp_secure_desc: 'SSL + 3D Secure',
      usp_return: 'Gratis retour', usp_return_desc: '14 dagen bedenktijd',
      usp_support: 'Klantenservice', usp_support_desc: '7 dagen via e-mail & chat',
      newsletter_title: 'Blijf op de hoogte',
      newsletter_desc: 'Exclusieve aanbiedingen en nieuwigheden direct in je inbox.',
      newsletter_placeholder: 'Jouw e-mailadres',
      newsletter_btn: 'Inschrijven',
      newsletter_success: '✓ Bedankt voor je inschrijving!',
      footer_legal: 'Juridische info', footer_cgv: 'Voorwaarden', footer_privacy: 'Privacy',
      footer_cookies: 'Cookies', footer_contact: 'Contact', footer_faq: 'FAQ',
      footer_about: 'Over ons', footer_blog: 'Blog',
      read_more: 'Artikel lezen', view_all: 'Alles bekijken',
      products_count: 'producten', add_to_cart: 'Toevoegen', view_product: 'Bekijken',
      cookie_msg: 'We gebruiken cookies om je ervaring te verbeteren.',
      cookie_accept: 'Accepteren', cookie_refuse: 'Weigeren',
      not_found: 'Pagina niet gevonden', back_home: 'Terug naar home',
    },
  };

  return JSON.stringify(strings[lang] || strings.fr, null, 2);
}

export const SUPPORTED_LANGS = ['fr', 'de', 'es', 'it', 'en', 'nl', 'pt', 'pl', 'sv', 'da', 'ro'];

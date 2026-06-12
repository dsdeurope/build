// Shared PHP includes
export function configPhp(domain, brandName, niche, p) {
  return `<?php
define('SITE_NAME', '${brandName}');
define('SITE_DOMAIN', '${domain}');
define('SITE_NICHE', '${niche}');
define('SITE_URL', 'https://${domain}');
define('DATA_DIR', __DIR__ . '/data/');
define('CACHE_DIR', __DIR__ . '/cache/');
define('ASSETS_V', '1');

// Load JSON data helper
function loadData(string $file): array {
    $path = DATA_DIR . $file . '.json';
    if (!is_file($path)) return [];
    return json_decode(file_get_contents($path), true) ?? [];
}

// Sanitize output
function e(string $s): string { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }

// Truncate text
function truncate(string $s, int $n = 160): string {
    return mb_strlen($s) > $n ? mb_substr($s, 0, $n) . '…' : $s;
}

// Active nav
function isActive(string $path): string {
    $req = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
    return $req === $path ? ' active' : '';
}

$config  = loadData('config');
$navCols = $config['collections'] ?? [];
`;
}

export function headerPhp(brandName, p) {
  return `<?php require_once __DIR__ . '/config.php'; ?>
<?php
$title       = $title ?? e(SITE_NAME);
$description = $description ?? ($config['meta_description'] ?? '');
$canonical   = $canonical ?? (SITE_URL . parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH));
$ldJson      = $ldJson ?? '{}';
?>
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title><?= $title ?></title>
  <meta name="description" content="<?= e($description) ?>">
  <link rel="canonical" href="<?= e($canonical) ?>">
  <meta property="og:title" content="<?= $title ?>">
  <meta property="og:description" content="<?= e($description) ?>">
  <meta property="og:url" content="<?= e($canonical) ?>">
  <meta property="og:type" content="website">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
  <link rel="stylesheet" href="/assets/css/main.css?v=<?= ASSETS_V ?>">
  <script type="application/ld+json"><?= $ldJson ?></script>
</head>
<body>

<div class="page-loader" aria-hidden="true"><div class="loader-ring"></div></div>

<header class="site-header" role="banner">
  <div class="container">
    <div class="header-top">
      <a href="/" class="logo" aria-label="<?= e(SITE_NAME) ?> - Accueil">
        <div class="logo-icon" aria-hidden="true"></div>
        <?= e(SITE_NAME) ?>
      </a>
      <form class="header-search" action="/recherche" method="get" role="search">
        <svg class="search-icon" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input type="search" name="q" placeholder="Rechercher…" aria-label="Rechercher sur le site" autocomplete="off">
      </form>
      <div class="header-actions">
        <a href="/compte" class="icon-btn" aria-label="Mon compte">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
        </a>
        <a href="/panier" class="icon-btn" aria-label="Panier">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
          <span class="badge-count" id="cart-count">0</span>
        </a>
        <button class="hamburger" aria-label="Menu" aria-expanded="false" aria-controls="main-nav">
          <span></span><span></span><span></span>
        </button>
      </div>
    </div>
    <nav class="site-nav" aria-label="Navigation principale">
      <ul class="nav-list" id="main-nav">
        <li><a href="/"<?= isActive('/') ?>>Accueil</a></li>
        <li><a href="/collections"<?= isActive('/collections') ?>>Collections</a></li>
        <?php foreach(array_slice($navCols,0,6) as $col): ?>
        <li><a href="/collections/<?= e($col['handle']) ?>"<?= isActive('/collections/'.$col['handle']) ?>><?= e($col['title']) ?></a></li>
        <?php endforeach; ?>
        <li><a href="/blog"<?= isActive('/blog') ?>>Blog</a></li>
      </ul>
    </nav>
  </div>
</header>
`;
}

export function footerPhp(brandName, domain) {
  return `<?php
$footerCols = array_slice($navCols, 0, 8);
$year = date('Y');
?>
<footer class="site-footer" role="contentinfo">
  <div class="container">
    <div class="footer-grid">
      <div class="footer-brand">
        <div class="logo" aria-label="<?= e(SITE_NAME) ?>">
          <div class="logo-icon" aria-hidden="true"></div>
          <?= e(SITE_NAME) ?>
        </div>
        <p><?= e($config['footer_desc'] ?? 'Votre destination pour les meilleures sélections.') ?></p>
        <div class="social-links" aria-label="Réseaux sociaux">
          <a href="#" aria-label="Instagram" rel="noopener">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" stroke="#fff" stroke-width="2" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".5" fill="#fff"/></svg>
          </a>
          <a href="#" aria-label="Facebook" rel="noopener">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="#fff" viewBox="0 0 24 24"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
          </a>
          <a href="#" aria-label="Pinterest" rel="noopener">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="#fff" viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.236 2.636 7.855 6.356 9.312-.088-.791-.167-2.005.035-2.868.181-.78 1.172-4.97 1.172-4.97s-.299-.598-.299-1.482c0-1.388.806-2.428 1.808-2.428.852 0 1.265.64 1.265 1.408 0 .858-.546 2.14-.828 3.33-.236.995.499 1.806 1.476 1.806 1.77 0 3.132-1.866 3.132-4.56 0-2.384-1.715-4.052-4.163-4.052-2.836 0-4.5 2.126-4.5 4.322 0 .856.33 1.772.741 2.273a.3.3 0 0 1 .069.282c-.076.313-.243.995-.276 1.134-.044.183-.146.222-.337.134-1.249-.581-2.03-2.407-2.03-3.874 0-3.154 2.292-6.052 6.608-6.052 3.469 0 6.165 2.473 6.165 5.776 0 3.447-2.173 6.22-5.19 6.22-1.013 0-1.966-.527-2.292-1.148l-.623 2.378c-.226.869-.835 1.958-1.244 2.621.937.29 1.931.446 2.962.446 5.523 0 10-4.477 10-10S17.523 2 12 2z"/></svg>
          </a>
        </div>
      </div>
      <div class="footer-col">
        <h5>Collections</h5>
        <ul>
          <?php foreach(array_slice($footerCols,0,4) as $col): ?>
          <li><a href="/collections/<?= e($col['handle']) ?>"><?= e($col['title']) ?></a></li>
          <?php endforeach; ?>
          <li><a href="/collections">Tout voir</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h5>Informations</h5>
        <ul>
          <li><a href="/blog">Blog & Conseils</a></li>
          <li><a href="/a-propos">À propos</a></li>
          <li><a href="/contact">Contact</a></li>
          <li><a href="/faq">FAQ</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h5>Légal</h5>
        <ul>
          <li><a href="/mentions-legales">Mentions légales</a></li>
          <li><a href="/cgv">CGV</a></li>
          <li><a href="/confidentialite">Confidentialité</a></li>
          <li><a href="/cookies">Cookies</a></li>
        </ul>
      </div>
    </div>
  </div>
  <div class="footer-bottom">
    <div class="container" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem">
      <p>© <?= $year ?> <?= e(SITE_NAME) ?> — Tous droits réservés</p>
      <div class="payment-icons" aria-label="Moyens de paiement acceptés">
        <svg width="38" height="24" viewBox="0 0 38 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Visa"><rect width="38" height="24" rx="4" fill="#1A1F71"/><text x="7" y="17" font-family="Arial" font-size="11" fill="#fff" font-weight="bold">VISA</text></svg>
        <svg width="38" height="24" viewBox="0 0 38 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Mastercard"><rect width="38" height="24" rx="4" fill="#252525"/><circle cx="14" cy="12" r="7" fill="#EB001B"/><circle cx="24" cy="12" r="7" fill="#F79E1B"/><path d="M19 6.8a7 7 0 0 1 0 10.4A7 7 0 0 1 19 6.8z" fill="#FF5F00"/></svg>
        <svg width="38" height="24" viewBox="0 0 38 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="PayPal"><rect width="38" height="24" rx="4" fill="#fff" stroke="#e8e8e8"/><text x="6" y="16" font-family="Arial" font-size="9" fill="#003087" font-weight="bold">Pay</text><text x="18" y="16" font-family="Arial" font-size="9" fill="#009cde" font-weight="bold">Pal</text></svg>
      </div>
    </div>
  </div>
</footer>

<div class="cookie-banner" role="alertdialog" aria-label="Cookies">
  <p>Nous utilisons des cookies pour améliorer votre expérience. <a href="/cookies">En savoir plus</a></p>
  <button class="btn btn-primary btn-accept-cookie">Accepter</button>
  <button class="btn btn-ghost" onclick="this.closest('.cookie-banner').style.display='none'">Refuser</button>
</div>

<div class="toast" role="status" aria-live="polite"></div>

<script src="/assets/js/main.js?v=<?= ASSETS_V ?>"></script>
</body>
</html>
`;
}

export function indexPhp(domain, brandName, niche) {
  return `<?php
require_once __DIR__ . '/includes/config.php';
$collections = loadData('collections');
$posts       = array_slice(loadData('posts'), 0, 3);

$title       = e(SITE_NAME) . ' — ' . e($config['tagline'] ?? 'Boutique en ligne');
$description = $config['meta_description'] ?? '';

$ldJson = json_encode([
  '@context' => 'https://schema.org',
  '@graph' => [
    ['@type'=>'WebSite','@id'=>SITE_URL.'/#website','url'=>SITE_URL,'name'=>SITE_NAME,
     'potentialAction'=>['@type'=>'SearchAction','target'=>SITE_URL.'/recherche?q={q}','query-input'=>'required name=q']],
    ['@type'=>'Organization','@id'=>SITE_URL.'/#org','name'=>SITE_NAME,'url'=>SITE_URL,
     'logo'=>['@type'=>'ImageObject','url'=>SITE_URL.'/assets/img/logo.png']],
  ]
], JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);

include __DIR__ . '/includes/header.php';
?>

<main>
  <!-- Hero -->
  <section class="hero" aria-label="Bannière principale">
    <div class="hero-overlay" aria-hidden="true"></div>
    <div class="hero-pattern" aria-hidden="true"></div>
    <div class="container">
      <div class="hero-content">
        <span class="hero-eyebrow"><?= e($config['hero_eyebrow'] ?? '✨ Nouvelle collection') ?></span>
        <h1><?= e($config['hero_title'] ?? SITE_NAME) ?></h1>
        <p class="hero-sub"><?= e($config['hero_subtitle'] ?? 'Découvrez notre sélection exclusive.') ?></p>
        <div class="hero-ctas">
          <a href="/collections" class="btn btn-ghost">Voir les collections</a>
          <a href="/collections/<?= e($collections[0]['handle'] ?? '') ?>" class="btn btn-outline">
            <?= e($collections[0]['title'] ?? 'Découvrir') ?>
          </a>
        </div>
      </div>
    </div>
    <div class="hero-scroll" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
      <span>Découvrir</span>
    </div>
  </section>

  <!-- Collections -->
  <section class="collections" aria-label="Nos collections">
    <div class="container">
      <div class="section-header">
        <h2>Nos Collections</h2>
        <div class="section-sep" aria-hidden="true"></div>
        <p>Explorez notre sélection organisée par thème pour trouver exactement ce qu'il vous faut.</p>
      </div>
      <div class="collections-grid">
        <?php foreach($collections as $col): ?>
        <article class="coll-card">
          <a href="/collections/<?= e($col['handle']) ?>" tabindex="-1" aria-hidden="true">
            <div class="coll-thumb">
              <?php if(!empty($col['image'])): ?>
              <img loading="lazy" src="<?= e($col['image']) ?>" alt="<?= e($col['title']) ?>">
              <?php else: ?>
              <div class="coll-thumb-placeholder" aria-hidden="true"><?= e($col['emoji'] ?? '🛍') ?></div>
              <?php endif; ?>
            </div>
          </a>
          <div class="coll-info">
            <?php if(!empty($col['tag'])): ?><span class="tag"><?= e($col['tag']) ?></span><?php endif; ?>
            <h3><a href="/collections/<?= e($col['handle']) ?>"><?= e($col['title']) ?></a></h3>
            <?php if(!empty($col['count'])): ?>
            <p class="coll-meta"><?= (int)$col['count'] ?> produits</p>
            <?php endif; ?>
            <a href="/collections/<?= e($col['handle']) ?>" class="coll-link">
              Explorer <span aria-hidden="true"></span>
            </a>
          </div>
        </article>
        <?php endforeach; ?>
      </div>
      <div style="text-align:center;margin-top:2.5rem">
        <a href="/collections" class="btn btn-primary">Voir toutes les collections</a>
      </div>
    </div>
  </section>

  <!-- USP -->
  <section class="usp-bar" aria-label="Nos engagements">
    <div class="container">
      <div class="usp-grid">
        <?php foreach(($config['usp'] ?? [
          ['icon'=>'🚚','title'=>'Livraison rapide','desc'=>'Expédition sous 24-48h ouvrées'],
          ['icon'=>'🔒','title'=>'Paiement sécurisé','desc'=>'SSL + 3D Secure sur tous les paiements'],
          ['icon'=>'↩','title'=>'Retours gratuits','desc'=>'14 jours pour changer d\'avis'],
          ['icon'=>'💬','title'=>'Service client','desc'=>'Disponible 7j/7 par email & chat'],
        ]) as $usp): ?>
        <div class="usp-item">
          <div class="usp-icon" aria-hidden="true"><?= e($usp['icon']) ?></div>
          <h4><?= e($usp['title']) ?></h4>
          <p><?= e($usp['desc']) ?></p>
        </div>
        <?php endforeach; ?>
      </div>
    </div>
  </section>

  <!-- Blog preview -->
  <?php if(!empty($posts)): ?>
  <section class="blog-section" aria-label="Nos derniers articles">
    <div class="container">
      <div class="section-header">
        <h2>Blog & Conseils</h2>
        <div class="section-sep" aria-hidden="true"></div>
        <p>Inspirations, guides d'achat et tendances pour mieux choisir.</p>
      </div>
      <div class="blog-grid">
        <?php foreach($posts as $post): ?>
        <article class="blog-card">
          <?php if(!empty($post['image'])): ?>
          <a href="/blog/<?= e($post['slug']) ?>" tabindex="-1" aria-hidden="true">
            <div class="blog-thumb">
              <img loading="lazy" src="<?= e($post['image']) ?>" alt="<?= e($post['title']) ?>">
            </div>
          </a>
          <?php endif; ?>
          <div class="blog-body">
            <?php if(!empty($post['tag'])): ?><span class="tag blog-tag"><?= e($post['tag']) ?></span><?php endif; ?>
            <h3><a href="/blog/<?= e($post['slug']) ?>"><?= e($post['title']) ?></a></h3>
            <p><?= e(truncate($post['excerpt'] ?? '', 140)) ?></p>
            <div class="blog-meta">
              <span><?= e($post['author'] ?? SITE_NAME) ?></span>
              <?php if(!empty($post['date'])): ?><time datetime="<?= e($post['date']) ?>"><?= date('d M Y', strtotime($post['date'])) ?></time><?php endif; ?>
            </div>
            <a href="/blog/<?= e($post['slug']) ?>" class="blog-read-more">Lire l'article →</a>
          </div>
        </article>
        <?php endforeach; ?>
      </div>
      <div style="text-align:center;margin-top:2.5rem">
        <a href="/blog" class="btn btn-outline">Tous les articles</a>
      </div>
    </div>
  </section>
  <?php endif; ?>

  <!-- Newsletter -->
  <section class="newsletter" aria-label="Newsletter">
    <div class="container">
      <h2>Restez informé·e</h2>
      <p>Recevez nos offres exclusives, nouveautés et conseils directement dans votre boîte mail.</p>
      <form class="newsletter-form" novalidate>
        <input type="email" placeholder="Votre adresse email" aria-label="Email" required autocomplete="email">
        <button type="submit" class="btn btn-ghost">S'inscrire</button>
      </form>
    </div>
  </section>
</main>

<?php include __DIR__ . '/includes/footer.php'; ?>
`;
}

export function collectionsIndexPhp() {
  return `<?php
require_once __DIR__ . '/../includes/config.php';
$collections = loadData('collections');

$title       = 'Collections — ' . e(SITE_NAME);
$description = 'Découvrez toutes nos collections. ' . e(SITE_NAME) . '.';

$ldJson = json_encode([
  '@context'=>'https://schema.org',
  '@type'=>'CollectionPage',
  'name'=>'Collections — '.SITE_NAME,
  'url'=>SITE_URL.'/collections',
], JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);

include __DIR__ . '/../includes/header.php';
?>
<main>
  <div class="coll-hero">
    <div class="container">
      <nav class="breadcrumb" aria-label="Fil d'Ariane">
        <span><a href="/">Accueil</a></span>
        <span>Collections</span>
      </nav>
      <h1>Toutes nos collections</h1>
      <p>Explorez l'ensemble de notre catalogue organisé par thème et tendance.</p>
    </div>
  </div>
  <section class="collections" style="padding-top:2rem">
    <div class="container">
      <div class="collections-grid">
        <?php foreach($collections as $col): ?>
        <article class="coll-card">
          <a href="/collections/<?= e($col['handle']) ?>" tabindex="-1" aria-hidden="true">
            <div class="coll-thumb">
              <?php if(!empty($col['image'])): ?>
              <img loading="lazy" src="<?= e($col['image']) ?>" alt="<?= e($col['title']) ?>">
              <?php else: ?>
              <div class="coll-thumb-placeholder" aria-hidden="true"><?= e($col['emoji'] ?? '🛍') ?></div>
              <?php endif; ?>
            </div>
          </a>
          <div class="coll-info">
            <h3><a href="/collections/<?= e($col['handle']) ?>"><?= e($col['title']) ?></a></h3>
            <?php if(!empty($col['count'])): ?>
            <p class="coll-meta"><?= (int)$col['count'] ?> produits</p>
            <?php endif; ?>
            <?php if(!empty($col['description'])): ?>
            <p style="font-size:.88rem;color:var(--text-muted);margin-bottom:.75rem"><?= e(truncate($col['description'],100)) ?></p>
            <?php endif; ?>
            <a href="/collections/<?= e($col['handle']) ?>" class="coll-link">Explorer</a>
          </div>
        </article>
        <?php endforeach; ?>
      </div>
    </div>
  </section>
</main>
<?php include __DIR__ . '/../includes/footer.php'; ?>
`;
}

export function collectionPhp() {
  return `<?php
require_once __DIR__ . '/../includes/config.php';
$handle = preg_replace('/[^a-z0-9-]/', '', $_GET['handle'] ?? '');
if(!$handle){ header('Location: /collections'); exit; }

$collections = loadData('collections');
$col = null;
foreach($collections as $c){ if($c['handle']===$handle){ $col=$c; break; } }
if(!$col){ http_response_code(404); include __DIR__.'/../includes/header.php'; echo '<main><div class="container" style="padding:4rem 0;text-align:center"><h1>Collection introuvable</h1><a href="/collections" class="btn btn-primary" style="margin-top:1.5rem">Retour aux collections</a></div></main>'; include __DIR__.'/../includes/footer.php'; exit; }

$products = loadData('products/'.$handle) ?: [];
$title       = e($col['title']) . ' — ' . e(SITE_NAME);
$description = !empty($col['description']) ? $col['description'] : 'Découvrez notre collection '.e($col['title']).' sur '.e(SITE_NAME).'.';

$ldJson = json_encode([
  '@context'=>'https://schema.org',
  '@type'=>'CollectionPage',
  'name'=>$col['title'],
  'description'=>$description,
  'url'=>SITE_URL.'/collections/'.$handle,
  'breadcrumb'=>['@type'=>'BreadcrumbList','itemListElement'=>[
    ['@type'=>'ListItem','position'=>1,'name'=>'Accueil','item'=>SITE_URL],
    ['@type'=>'ListItem','position'=>2,'name'=>'Collections','item'=>SITE_URL.'/collections'],
    ['@type'=>'ListItem','position'=>3,'name'=>$col['title'],'item'=>SITE_URL.'/collections/'.$handle],
  ]],
], JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);

include __DIR__ . '/../includes/header.php';
?>
<main>
  <div class="coll-hero">
    <div class="container">
      <nav class="breadcrumb" aria-label="Fil d'Ariane">
        <span><a href="/">Accueil</a></span>
        <span><a href="/collections">Collections</a></span>
        <span><?= e($col['title']) ?></span>
      </nav>
      <h1><?= e($col['title']) ?></h1>
      <?php if(!empty($col['description'])): ?>
      <p><?= e($col['description']) ?></p>
      <?php endif; ?>
      <div class="coll-hero-meta">
        <?php if(!empty($col['count'])): ?>
        <span class="badge"><?= (int)$col['count'] ?> produits</span>
        <?php endif; ?>
        <?php if(!empty($col['tag'])): ?>
        <span class="tag"><?= e($col['tag']) ?></span>
        <?php endif; ?>
      </div>
    </div>
  </div>
  <div class="container" style="padding-bottom:4rem">
    <div class="filter-bar">
      <select aria-label="Trier par">
        <option value="default">Trier par défaut</option>
        <option value="price-asc">Prix croissant</option>
        <option value="price-desc">Prix décroissant</option>
        <option value="alpha">A-Z</option>
      </select>
      <span class="results-count"><?= count($products) ?> résultat<?= count($products)>1?'s':'' ?></span>
    </div>
    <?php if(!empty($products)): ?>
    <div class="products-grid">
      <?php foreach($products as $p): ?>
      <article class="prod-card">
        <div class="prod-thumb">
          <?php if(!empty($p['image'])): ?>
          <img loading="lazy" src="<?= e($p['image']) ?>" alt="<?= e($p['title']) ?>">
          <?php else: ?>
          <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2.5rem;background:var(--surface)">🛍</div>
          <?php endif; ?>
          <?php if(!empty($p['badge'])): ?><span class="badge prod-badge"><?= e($p['badge']) ?></span><?php endif; ?>
        </div>
        <div class="prod-info">
          <?php if(!empty($p['brand'])): ?><p class="prod-brand"><?= e($p['brand']) ?></p><?php endif; ?>
          <h3 class="prod-name"><?= e($p['title']) ?></h3>
          <?php if(!empty($p['price'])): ?><p class="prod-price"><?= e($p['price']) ?> €</p><?php endif; ?>
          <div class="prod-actions">
            <?php if(!empty($p['url'])): ?>
            <a href="<?= e($p['url']) ?>" class="btn btn-outline" target="_blank" rel="noopener sponsored">Voir</a>
            <?php endif; ?>
          </div>
        </div>
      </article>
      <?php endforeach; ?>
    </div>
    <?php else: ?>
    <div style="text-align:center;padding:4rem 0;color:var(--text-muted)">
      <p style="font-size:1.1rem">Aucun produit dans cette collection pour l'instant.</p>
      <a href="/collections" class="btn btn-primary" style="margin-top:1.5rem">Voir les autres collections</a>
    </div>
    <?php endif; ?>
  </div>
</main>
<?php include __DIR__ . '/../includes/footer.php'; ?>
`;
}

export function blogIndexPhp() {
  return `<?php
require_once __DIR__ . '/../includes/config.php';
$posts = loadData('posts');
$page  = max(1,(int)($_GET['page']??1));
$per   = 9;
$total = count($posts);
$pages = max(1,(int)ceil($total/$per));
$page  = min($page,$pages);
$items = array_slice($posts,($page-1)*$per,$per);

$title       = 'Blog & Conseils — ' . e(SITE_NAME);
$description = 'Conseils, guides et tendances sur ' . e(SITE_NAME) . '.';

$ldJson = json_encode(['@context'=>'https://schema.org','@type'=>'Blog','name'=>'Blog — '.SITE_NAME,'url'=>SITE_URL.'/blog'],JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);

include __DIR__ . '/../includes/header.php';
?>
<main>
  <div class="coll-hero">
    <div class="container">
      <nav class="breadcrumb" aria-label="Fil d'Ariane">
        <span><a href="/">Accueil</a></span>
        <span>Blog</span>
      </nav>
      <h1>Blog & Conseils</h1>
      <p>Inspirations, guides d'achat et tendances pour mieux choisir.</p>
    </div>
  </div>
  <div class="container" style="padding:2rem 0 4rem">
    <div class="blog-grid">
      <?php foreach($items as $post): ?>
      <article class="blog-card">
        <?php if(!empty($post['image'])): ?>
        <a href="/blog/<?= e($post['slug']) ?>" tabindex="-1" aria-hidden="true">
          <div class="blog-thumb"><img loading="lazy" src="<?= e($post['image']) ?>" alt="<?= e($post['title']) ?>"></div>
        </a>
        <?php endif; ?>
        <div class="blog-body">
          <?php if(!empty($post['tag'])): ?><span class="tag blog-tag"><?= e($post['tag']) ?></span><?php endif; ?>
          <h2 style="font-size:1.1rem"><a href="/blog/<?= e($post['slug']) ?>"><?= e($post['title']) ?></a></h2>
          <p><?= e(truncate($post['excerpt']??'',140)) ?></p>
          <div class="blog-meta">
            <span><?= e($post['author']??SITE_NAME) ?></span>
            <?php if(!empty($post['date'])): ?><time datetime="<?= e($post['date']) ?>"><?= date('d M Y',strtotime($post['date'])) ?></time><?php endif; ?>
          </div>
          <a href="/blog/<?= e($post['slug']) ?>" class="blog-read-more">Lire l'article →</a>
        </div>
      </article>
      <?php endforeach; ?>
    </div>
    <?php if($pages>1): ?>
    <nav class="pagination" aria-label="Pagination">
      <?php if($page>1): ?><a href="/blog?page=<?= $page-1 ?>" class="page-btn">‹</a><?php endif; ?>
      <?php for($i=1;$i<=$pages;$i++): ?>
      <a href="/blog?page=<?= $i ?>" class="page-btn<?= $i===$page?' active':'' ?>" <?= $i===$page?'aria-current="page"':'' ?>><?= $i ?></a>
      <?php endfor; ?>
      <?php if($page<$pages): ?><a href="/blog?page=<?= $page+1 ?>" class="page-btn">›</a><?php endif; ?>
    </nav>
    <?php endif; ?>
  </div>
</main>
<?php include __DIR__ . '/../includes/footer.php'; ?>
`;
}

export function articlePhp() {
  return `<?php
require_once __DIR__ . '/../includes/config.php';
$slug = preg_replace('/[^a-z0-9-]/', '', $_GET['slug'] ?? '');
if(!$slug){ header('Location: /blog'); exit; }

$posts = loadData('posts');
$post = null;
foreach($posts as $p){ if($p['slug']===$slug){ $post=$p; break; } }
if(!$post){ http_response_code(404); include __DIR__.'/../includes/header.php'; echo '<main><div class="container" style="padding:4rem 0;text-align:center"><h1>Article introuvable</h1><a href="/blog" class="btn btn-primary" style="margin-top:1.5rem">Retour au blog</a></div></main>'; include __DIR__.'/../includes/footer.php'; exit; }

$title       = e($post['title']) . ' — ' . e(SITE_NAME);
$description = e(truncate($post['excerpt']??'',160));

$ldJson = json_encode([
  '@context'=>'https://schema.org',
  '@type'=>'Article',
  'headline'=>$post['title'],
  'description'=>$post['excerpt']??'',
  'url'=>SITE_URL.'/blog/'.$slug,
  'author'=>['@type'=>'Organization','name'=>SITE_NAME],
  'publisher'=>['@type'=>'Organization','name'=>SITE_NAME,'logo'=>['@type'=>'ImageObject','url'=>SITE_URL.'/assets/img/logo.png']],
  'datePublished'=>$post['date']??date('Y-m-d'),
],JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);

include __DIR__ . '/../includes/header.php';
?>
<main>
  <div class="article-hero">
    <div class="container">
      <div class="article-header">
        <nav class="breadcrumb" aria-label="Fil d'Ariane">
          <span><a href="/">Accueil</a></span>
          <span><a href="/blog">Blog</a></span>
          <span><?= e($post['title']) ?></span>
        </nav>
        <?php if(!empty($post['tag'])): ?><span class="tag" style="margin-top:1rem;display:inline-block"><?= e($post['tag']) ?></span><?php endif; ?>
        <h1 style="margin-top:.75rem"><?= e($post['title']) ?></h1>
        <div class="article-meta">
          <span><?= e($post['author']??SITE_NAME) ?></span>
          <?php if(!empty($post['date'])): ?><time datetime="<?= e($post['date']) ?>"><?= date('d M Y',strtotime($post['date'])) ?></time><?php endif; ?>
          <?php if(!empty($post['read_time'])): ?><span><?= e($post['read_time']) ?> min de lecture</span><?php endif; ?>
        </div>
      </div>
    </div>
  </div>
  <?php if(!empty($post['image'])): ?>
  <div class="container" style="max-width:800px;padding-top:2.5rem">
    <img src="<?= e($post['image']) ?>" alt="<?= e($post['title']) ?>" style="border-radius:calc(var(--radius)*2);box-shadow:var(--shadow-md);width:100%">
  </div>
  <?php endif; ?>
  <article class="article-body">
    <?= $post['content'] ?? '<p>' . e($post['excerpt']??'') . '</p>' ?>
  </article>
  <div style="text-align:center;padding:2rem 0 4rem">
    <a href="/blog" class="btn btn-outline">← Retour au blog</a>
  </div>
</main>
<?php include __DIR__ . '/../includes/footer.php'; ?>
`;
}

export function sitemapPhp(domain) {
  return `<?php
require_once __DIR__ . '/includes/config.php';
header('Content-Type: application/xml; charset=UTF-8');
$collections = loadData('collections');
$posts       = loadData('posts');
$now         = date('Y-m-d');
echo '<?xml version="1.0" encoding="UTF-8"?>';
?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc><?= SITE_URL ?>/</loc><changefreq>weekly</changefreq><priority>1.0</priority><lastmod><?= $now ?></lastmod></url>
  <url><loc><?= SITE_URL ?>/collections</loc><changefreq>weekly</changefreq><priority>0.9</priority><lastmod><?= $now ?></lastmod></url>
  <url><loc><?= SITE_URL ?>/blog</loc><changefreq>daily</changefreq><priority>0.8</priority><lastmod><?= $now ?></lastmod></url>
  <?php foreach($collections as $c): ?>
  <url><loc><?= SITE_URL ?>/collections/<?= e($c['handle']) ?></loc><changefreq>weekly</changefreq><priority>0.8</priority><lastmod><?= $now ?></lastmod></url>
  <?php endforeach; ?>
  <?php foreach($posts as $p): ?>
  <url><loc><?= SITE_URL ?>/blog/<?= e($p['slug']) ?></loc><changefreq>monthly</changefreq><priority>0.6</priority><?php if(!empty($p['date'])): ?><lastmod><?= e($p['date']) ?></lastmod><?php endif; ?></url>
  <?php endforeach; ?>
  <url><loc><?= SITE_URL ?>/mentions-legales</loc><changefreq>yearly</changefreq><priority>0.2</priority></url>
  <url><loc><?= SITE_URL ?>/cgv</loc><changefreq>yearly</changefreq><priority>0.2</priority></url>
  <url><loc><?= SITE_URL ?>/confidentialite</loc><changefreq>yearly</changefreq><priority>0.2</priority></url>
</urlset>
`;
}

export function mentionsLegalesPhp(domain, brandName) {
  return `<?php
require_once __DIR__ . '/includes/config.php';
$title = 'Mentions légales — ' . e(SITE_NAME);
$description = 'Mentions légales du site ' . e(SITE_NAME) . '.';
include __DIR__ . '/includes/header.php';
?>
<main>
  <div class="container" style="max-width:800px;padding:3rem 1.25rem 5rem">
    <nav class="breadcrumb"><span><a href="/">Accueil</a></span><span>Mentions légales</span></nav>
    <h1 style="margin:1.5rem 0 2rem">Mentions légales</h1>
    <h2>Éditeur du site</h2>
    <p>Le site <strong><?= e(SITE_DOMAIN) ?></strong> est édité par <?= e(SITE_NAME) ?>.<br>
    Email : <a href="mailto:contact@<?= e(SITE_DOMAIN) ?>">contact@<?= e(SITE_DOMAIN) ?></a></p>
    <h2>Hébergement</h2>
    <p>Ce site est hébergé par un prestataire d'hébergement professionnel.</p>
    <h2>Propriété intellectuelle</h2>
    <p>Tous les contenus présents sur ce site (textes, images, logos) sont la propriété exclusive de <?= e(SITE_NAME) ?> et sont protégés par le droit d'auteur. Toute reproduction est interdite sans autorisation préalable.</p>
    <h2>Responsabilité</h2>
    <p><?= e(SITE_NAME) ?> s'efforce d'assurer l'exactitude des informations diffusées sur ce site, mais ne saurait être tenu responsable des omissions ou inexactitudes.</p>
    <h2>Données personnelles</h2>
    <p>Conformément à la loi Informatique et Libertés et au RGPD, vous disposez d'un droit d'accès, de rectification et de suppression de vos données. Contactez-nous à <a href="mailto:contact@<?= e(SITE_DOMAIN) ?>">contact@<?= e(SITE_DOMAIN) ?></a>.</p>
  </div>
</main>
<?php include __DIR__ . '/includes/footer.php'; ?>
`;
}

export function configJson(domain, brandName, niche) {
  return JSON.stringify({
    site_name: brandName,
    domain,
    niche,
    tagline: `La référence ${niche} en ligne`,
    meta_description: `${brandName} — Découvrez notre sélection de produits ${niche}. Livraison rapide, paiement sécurisé, retours gratuits.`,
    hero_eyebrow: '✨ Nouvelle collection',
    hero_title: `${brandName}`,
    hero_subtitle: `Votre destination pour les meilleurs produits ${niche}.`,
    footer_desc: `${brandName} vous propose une sélection premium de produits ${niche}.`,
    collections: [],
    usp: [
      { icon: '🚚', title: 'Livraison rapide', desc: 'Expédition sous 24-48h ouvrées' },
      { icon: '🔒', title: 'Paiement sécurisé', desc: 'SSL + 3D Secure sur tous les paiements' },
      { icon: '↩', title: 'Retours gratuits', desc: '14 jours pour changer d\'avis' },
      { icon: '💬', title: 'Service client', desc: 'Disponible 7j/7 par email & chat' },
    ],
  }, null, 2);
}

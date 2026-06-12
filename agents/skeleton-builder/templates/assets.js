export const htaccess = `Options -Indexes
ServerSignature Off

# Security headers
<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set X-Frame-Options "SAMEORIGIN"
  Header always set X-XSS-Protection "1; mode=block"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set Permissions-Policy "camera=(), microphone=(), geolocation=()"
</IfModule>

# URL rewriting
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /

  # Skip existing files/dirs
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d

  # Collections
  RewriteRule ^collections/([^/]+)/?$ collections/collection.php?handle=$1 [L,QSA]
  RewriteRule ^collections/?$ collections/index.php [L]

  # Blog
  RewriteRule ^blog/([^/]+)/?$ blog/article.php?slug=$1 [L,QSA]
  RewriteRule ^blog/?$ blog/index.php [L]

  # Root
  RewriteRule ^$ index.php [L]
</IfModule>

# Caching
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType text/css "access plus 1 year"
  ExpiresByType application/javascript "access plus 1 year"
  ExpiresByType image/webp "access plus 1 year"
  ExpiresByType image/jpeg "access plus 1 year"
  ExpiresByType image/png "access plus 1 year"
  ExpiresByType image/svg+xml "access plus 1 year"
  ExpiresByType font/woff2 "access plus 1 year"
  ExpiresByType text/html "access plus 1 hour"
</IfModule>

# Gzip compression
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css application/javascript application/json text/xml
</IfModule>

# Prevent access to sensitive files
<FilesMatch "\\.(json|env|log|sh|sql)$">
  Order allow,deny
  Deny from all
</FilesMatch>
<Files "config.php">
  Order allow,deny
  Deny from all
</Files>
`;

export const robotsTxt = (domain) => `User-agent: *
Allow: /
Disallow: /includes/
Disallow: /data/
Disallow: /assets/
Allow: /assets/

Sitemap: https://${domain}/sitemap.xml
`;

export const mainJs = `// Main JS — minimal, no jQuery
(function(){
  'use strict';

  // Page loader
  const loader = document.querySelector('.page-loader');
  if(loader) window.addEventListener('load', () => { loader.classList.add('hide'); });

  // Mobile nav toggle
  const ham = document.querySelector('.hamburger');
  const nav = document.querySelector('.nav-list');
  if(ham && nav){
    ham.addEventListener('click', () => {
      nav.classList.toggle('open');
      ham.setAttribute('aria-expanded', nav.classList.contains('open'));
    });
  }

  // Cookie banner
  const cb = document.querySelector('.cookie-banner');
  if(cb && !localStorage.getItem('cookie_ok')){
    cb.style.display = 'flex';
    document.querySelector('.btn-accept-cookie')?.addEventListener('click', () => {
      localStorage.setItem('cookie_ok','1');
      cb.style.display = 'none';
    });
  }

  // Newsletter
  const nlForm = document.querySelector('.newsletter-form');
  if(nlForm){
    nlForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = nlForm.querySelector('input[type=email]');
      if(!input?.value.includes('@')) return;
      nlForm.innerHTML = '<p class="newsletter-success">✓ Merci pour votre inscription !</p>';
    });
  }

  // Toast helper
  window.showToast = function(msg, type=''){
    let t = document.querySelector('.toast');
    if(!t){ t = document.createElement('div'); t.className='toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.className = 'toast ' + type;
    requestAnimationFrame(() => { t.classList.add('show'); });
    setTimeout(() => t.classList.remove('show'), 3400);
  };

  // Add to cart feedback
  document.querySelectorAll('.btn-add-cart').forEach(btn => {
    btn.addEventListener('click', () => {
      showToast('Ajouté au panier ✓', 'success');
    });
  });

  // Lazy images
  if('IntersectionObserver' in window){
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if(e.isIntersecting){
          const img = e.target;
          if(img.dataset.src){ img.src = img.dataset.src; img.removeAttribute('data-src'); }
          io.unobserve(img);
        }
      });
    },{rootMargin:'200px'});
    document.querySelectorAll('img[data-src]').forEach(img => io.observe(img));
  }

})();
`;

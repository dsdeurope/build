// V35 Platform — shared utilities
const API = 'https://v35-build-api.ernestpedanou.workers.dev/api';
const SUPPLIER_API = 'https://v35-supplier-resolver.ernestpedanou.workers.dev';
const AUTH_KEY = 'v35_auth';
const AUTH_HASH = 'c0e1ef644e74252419e56e7818885cbeaf7bd35bec04b0dfda954678e4f16354';

// ── Auth ─────────────────────────────────────────────────────────────────────
export function checkAuth() {
  if (sessionStorage.getItem(AUTH_KEY) !== AUTH_HASH) {
    window.location.href = '/login.html';
    return false;
  }
  return true;
}

export function logout() {
  sessionStorage.removeItem(AUTH_KEY);
  window.location.href = '/login.html';
}

// ── API ──────────────────────────────────────────────────────────────────────
export async function apiFetch(path, opts = {}) {
  const token = sessionStorage.getItem(AUTH_KEY) || '';
  const isWrite = opts.method && opts.method !== 'GET';
  const res = await fetch(API + path, {
    headers: {
      'Content-Type': 'application/json',
      ...(isWrite ? { 'Authorization': `Bearer ${token}` } : {}),
      ...opts.headers,
    },
    ...opts,
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'API error');
  return data;
}

export async function apiGet(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  return apiFetch(path + (qs ? '?' + qs : ''));
}

export async function apiPost(path, body) {
  return apiFetch(path, { method: 'POST', body: JSON.stringify(body) });
}

export async function apiPut(path, body) {
  return apiFetch(path, { method: 'PUT', body: JSON.stringify(body) });
}

export async function apiDelete(path) {
  return apiFetch(path, { method: 'DELETE' });
}

// ── Toast ────────────────────────────────────────────────────────────────────
export function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('toasts')?.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ── Modal ────────────────────────────────────────────────────────────────────
export function openModal(id) {
  document.getElementById(id)?.classList.add('open');
}

export function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

export function closeAllModals() {
  document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
}

// ── Nav ──────────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { href: '/index.html',                 icon: '◈', label: 'Dashboard' },
  { href: '/pipeline.html',              icon: '⚡', label: 'Pipeline' },
  { href: '/boutiques.html',             icon: '◉', label: 'Boutiques' },
  { href: '/cloner.html',               icon: '🚀', label: 'À cloner' },
  { href: '/scrapping.html',            icon: '🕷', label: 'Scrapping' },
  { href: '/aliexpress.html',           icon: '🛒', label: 'Aliexpress' },
  { href: '/expired-domains.html',      icon: '🔥', label: 'Domaines Exp.' },
  { href: '/traduction.html',           icon: '🌐', label: 'Traduction' },
  { href: '/domaines-footprints.html',   icon: '◎', label: 'Footprints' },
  { href: '/dorks.html',                 icon: '🔍', label: 'Dorks' },
  { href: '/market-intel.html',          icon: '📊', label: 'Market Intel' },
  { href: '/clone-intel.html',           icon: '🔬', label: 'Clone Intel' },
  { href: '/scrape-monitor.html',        icon: '📡', label: 'Scrape Monitor' },
  { href: '/fulfillment.html',           icon: '📦', label: 'Fulfillment' },
  { href: '/memoire.html',               icon: '📌', label: 'Pour mémoire' },
  { href: '/sites.html',                 icon: '✦', label: 'Sites' },
  { href: '/contenu.html',               icon: '⌁', label: 'Contenu' },
  { href: '/domaines.html',              icon: '⏣', label: 'Domaines' },
  { href: '/domaines-anciens-v2.html',   icon: '⊞', label: 'Aged Domains' },
  { href: '/images.html',                icon: '⟐', label: 'Images' },
  { href: '/squelettes.html',            icon: '⬡', label: 'Squelettes' },
  { href: '/monitoring.html',            icon: '⊟', label: 'Monitoring' },
  { href: '/calendrier.html',            icon: '◌', label: 'Calendrier' },
  { href: '/settings.html',              icon: '⚙', label: 'Paramètres' },
];

export function buildNav() {
  const cur = window.location.pathname.split('/').pop() || 'index.html';
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  sidebar.innerHTML = `
    <div class="logo">V35<span>Build</span></div>
    <nav>${NAV_ITEMS.map(n => {
      const file = n.href.replace('/', '');
      const active = (cur === file || (cur === '' && file === 'index.html')) ? 'active' : '';
      return `<a href="${n.href}" class="nav-link ${active}"><span class="nav-icon">${n.icon}</span>${n.label}</a>`;
    }).join('')}</nav>
    <div class="sidebar-footer">
      <button class="btn btn-sm" onclick="import('/assets/platform.js').then(m=>m.logout())">Déconnexion</button>
    </div>`;
}

// ── Topbar ───────────────────────────────────────────────────────────────────
export function buildTopbar(title = '') {
  const el = document.getElementById('topbar-title');
  if (el) el.textContent = title;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
export function fmt(n) { return (n || 0).toLocaleString('fr-FR'); }
export function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' });
}
export function badge(status) {
  const map = {
    pending: 'badge-warn', running: 'badge-info', scraped: 'badge-info',
    orchestrating: 'badge-info', done: 'badge-success', live: 'badge-success',
    error: 'badge-err', available: 'badge-success', taken: 'badge-err',
  };
  return `<span class="badge ${map[status]||'badge-warn'}">${status}</span>`;
}
export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}
export function qs(sel) { return document.querySelector(sel); }

// ── Pagination ───────────────────────────────────────────────────────────────
export function paginationHtml(page, pages, onPage) {
  if (pages <= 1) return '';
  let h = '<div class="pagination">';
  if (page > 1) h += `<button onclick="${onPage}(${page-1})">‹</button>`;
  for (let i = Math.max(1,page-2); i <= Math.min(pages,page+2); i++) {
    h += `<button class="${i===page?'active':''}" onclick="${onPage}(${i})">${i}</button>`;
  }
  if (page < pages) h += `<button onclick="${onPage}(${page+1})">›</button>`;
  h += '</div>';
  return h;
}

// ── Stats mini-chart ─────────────────────────────────────────────────────────
// ── Supplier resolver ────────────────────────────────────────────────────────
export async function resolveSupplier(boutiqueId, domain, niche, keywords = []) {
  const res = await fetch(`${SUPPLIER_API}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain, niche, keywords, boutique_id: boutiqueId }),
  });
  return res.json();
}

export function supplierBadge(result) {
  if (!result?.resolved) return `<span class="badge badge-err">Aucun fournisseur</span>`;
  const icons = { aliexpress: '🛒', cjdropshipping: '📦', dhgate: '🏪', '1688': '🇨🇳' };
  const icon = icons[result.supplier] || '✓';
  return `<a href="${result.supplier_url}" target="_blank" class="badge badge-success">${icon} ${result.supplier_name} ${result.supplier_pct}%</a>`;
}

export function supplierChainHtml(chain = []) {
  return chain.map(p => {
    const cls = p.pct >= 30 ? 'badge-success' : p.pct >= 10 ? 'badge-warn' : 'badge-err';
    return `<span class="badge ${cls}">${p.name}: ${p.pct}%</span>`;
  }).join(' ');
}

export function sparkline(values, maxVal) {
  const max = maxVal || Math.max(...values, 1);
  return values.map(v => {
    const h = Math.round((v / max) * 40);
    return `<span class="bar" style="height:${h}px"></span>`;
  }).join('');
}

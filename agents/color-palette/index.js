// Niche base hues (HSL degrees)
const NICHES = {
  lingerie:      { h: 330, s: 60, name: 'Lingerie & Bain' },
  luminaires:    { h:  45, s: 70, name: 'Luminaires & Éclairage' },
  sport:         { h: 130, s: 65, name: 'Sport & Outdoor' },
  bijoux:        { h:  42, s: 80, name: 'Bijoux & Accessoires' },
  deco:          { h: 200, s: 45, name: 'Décoration Intérieure' },
  mode:          { h: 270, s: 50, name: 'Mode & Vêtements' },
  enfants:       { h: 190, s: 70, name: 'Enfants & Jouets' },
  jardin:        { h: 100, s: 60, name: 'Jardin & Extérieur' },
  cuisine:       { h:  20, s: 75, name: 'Cuisine & Arts de Table' },
  beaute:        { h: 340, s: 55, name: 'Beauté & Cosmétiques' },
  electronique:  { h: 210, s: 65, name: 'Électronique & High-Tech' },
  livres:        { h:  35, s: 50, name: 'Livres & Papeterie' },
  animaux:       { h:  80, s: 55, name: 'Animaux & Accessoires' },
  sante:         { h: 160, s: 55, name: 'Santé & Bien-être' },
  auto:          { h: 215, s: 60, name: 'Auto & Moto' },
  maison:        { h: 195, s: 40, name: 'Maison & Linge' },
  voyage:        { h: 230, s: 65, name: 'Voyage & Bagages' },
  gastronomie:   { h:  15, s: 80, name: 'Gastronomie & Épicerie' },
};

const DEFAULT = { h: 220, s: 55, name: 'Générique' };

function hsl(h, s, l) {
  return `hsl(${h},${s}%,${l}%)`;
}

function hex(h, s, l) {
  // Convert HSL to hex
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function palette(niche) {
  const n = NICHES[niche] || DEFAULT;
  const { h, s } = n;

  // Accent: complementary hue +140° for contrast
  const ha = (h + 140) % 360;

  return {
    niche,
    name: n.name,
    primary:       hex(h,  s,     42),
    primary_dark:  hex(h,  s,     28),
    primary_light: hex(h,  s - 10, 90),
    secondary:     hex(h,  s - 15, 55),
    accent:        hex(ha, 70,    50),
    surface:       hex(h,  15,    97),
    bg:            hex(h,  8,     99),
    text:          hex(h,  10,    12),
    text_muted:    hex(h,  8,     50),
    border:        hex(h,  15,    88),
    gradient_from: hex(h,  s,     38),
    gradient_to:   hex(h,  s - 5, 22),
    hero_text:     '#ffffff',
  };
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    const niche = url.searchParams.get('niche') || url.pathname.replace(/^\//, '').split('/')[0] || '';
    const key = niche.toLowerCase().trim();

    if (url.pathname === '/niches' || url.searchParams.get('list')) {
      return Response.json(Object.fromEntries(
        Object.entries(NICHES).map(([k, v]) => [k, v.name])
      ), { headers: CORS });
    }

    return Response.json(palette(key), { headers: CORS });
  }
};

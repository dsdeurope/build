const MIME = {
  '.html': 'text/html;charset=UTF-8',
  '.xml':  'application/xml',
  '.txt':  'text/plain',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // /{slug}/{...path} or ?site={slug}&path={path}
    const parts = url.pathname.replace(/^\//, '').split('/');
    const sl = parts[0] || url.searchParams.get('site');
    if (!sl) return new Response('Usage: /{slug}/{path}', {status:400});

    const path = '/' + parts.slice(1).join('/');
    const normalPath = path.endsWith('/') ? path : (path.includes('.') ? path : path+'/');
    const key = `site:${sl}:${normalPath}`;
    const meta = await env.KV.get(`site:${sl}:__meta`);
    if (!meta) return new Response(notFound(sl), {status:404, headers:{'Content-Type':'text/html;charset=UTF-8'}});

    const content = await env.KV.get(key);
    if (!content) return new Response(notFound(sl), {status:404, headers:{'Content-Type':'text/html;charset=UTF-8'}});

    const ext = normalPath.includes('.') ? '.'+normalPath.split('.').pop() : '.html';
    const ct = MIME[ext] || 'text/html;charset=UTF-8';
    return new Response(content, {
      headers: {
        'Content-Type': ct,
        'Cache-Control': 'public,max-age=3600',
        'X-Site': sl,
      }
    });
  }
};

function notFound(sl) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>404</title><style>body{font-family:sans-serif;text-align:center;padding:4rem;color:#555}h1{font-size:3rem;color:#e2e8f0}a{color:#3b82f6}</style></head><body><h1>404</h1><p>Page introuvable pour le site <strong>${sl}</strong>.</p><p><a href="/${sl}/">← Accueil</a></p></body></html>`;
}

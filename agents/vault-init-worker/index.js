// vault-init-worker — sert /assets/vault-init.js avec les clés injectées depuis secrets CF
// Route dans CF Pages: /assets/vault-init.js → ce worker

export default {
  async fetch(request, env) {
    const orKey = env.OR_KEY || '';
    const js = `// vault-init — auto-generated, never committed\nwindow.__OR_KEY__ = ${JSON.stringify(orKey)};\n`;
    return new Response(js, {
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    });
  },
};

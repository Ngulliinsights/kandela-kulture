'use strict';
// Cloudflare Worker entrypoint: /api/* routes, everything else -> static assets.
import { api, runPurge, SEC } from './app.mjs';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/api/')) return await api(request, env, url, ctx);
      const res = await env.ASSETS.fetch(request);
      // Asset responses carry the platform's cache headers; re-wrap to add
      // the site's security headers uniformly.
      const headers = new Headers(res.headers);
      for (const [k, v] of Object.entries(SEC)) headers.set(k, v);
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    } catch (e) {
      console.error(e && e.message ? e.message : e);
      return new Response(JSON.stringify({ error: 'Something went wrong.' }), {
        status: 500,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...SEC },
      });
    }
  },

  // Daily retention purge (wrangler.toml [triggers] crons).
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runPurge(env)
      .then(r => console.log('purge', JSON.stringify(r)))
      .catch(e => console.error('purge failed:', e && e.message ? e.message : e)));
  },
};

// Serves Sidewalks of Mexico at https://www.opensidewalks.org/mx/. The us-sidewalks Worker owns the rest of that
// host as a Custom Domain; the routes for /mx and /mx/* in wrangler.jsonc take precedence over it.
// The built page sits at the root of dist/; the visitor sees it under /mx. The national archive stays in
// R2 and is served in capped byte ranges, cached at the edge under its ETag.
const PREFIX = "/mx";
const HOST = "www.opensidewalks.org";
// Files in the bucket the map may read, by the name it asks for under /mx/data/.
const SERVED = /^mexico_sidewalks(-\d+)?\.pmtiles$/;
const RANGE_MAX = 2 * 1024 * 1024;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // The route also catches paths like /mxyz; those belong to the Custom Domain Worker behind this one.
    if (url.pathname !== PREFIX && !url.pathname.startsWith(PREFIX + "/")) return fetch(request);
    // One address, as for /us: the bare domain and plain http go to https://www.opensidewalks.org/mx/.
    // Temporary redirects, like the US site's. Other hosts (local development) keep their own origin.
    const pub = url.hostname === HOST || url.hostname === "opensidewalks.org";
    const origin = pub ? `https://${HOST}` : url.origin;
    const path0 = url.pathname === PREFIX ? PREFIX + "/" : url.pathname;
    if (origin !== url.origin || path0 !== url.pathname) return Response.redirect(`${origin}${path0}${url.search}`, 302);
    const path = url.pathname.slice(PREFIX.length);
    const data = /^\/data\/([^/]+)$/.exec(path);
    if (data && SERVED.test(data[1])) return object(request, env, ctx, data[1]);
    const res = await env.ASSETS.fetch(new Request(new URL(path + url.search, url.origin), request));
    // The asset server redirects without the prefix.
    const to = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && to?.startsWith("/") && !to.startsWith("//")) {
      const headers = new Headers(res.headers);
      headers.set("location", PREFIX + to);
      return new Response(null, { status: res.status, headers });
    }
    // Vite fingerprints everything under /assets, so it can be cached for good.
    if (res.ok && path.startsWith("/assets/")) {
      const out = new Response(res.body, res);
      out.headers.set("cache-control", "public, max-age=31536000, immutable");
      return out;
    }
    return res;
  },
};

async function object(request, env, ctx, key) {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
  const archive = key.endsWith(".pmtiles");
  const m = /^bytes=(\d+)-(\d+)$/.exec(request.headers.get("range") || "");
  // Archives only go out in closed ranges; the small JSON files go out whole.
  if (archive && !(m && +m[1] <= +m[2] && +m[2] - +m[1] < RANGE_MAX))
    return new Response("This file is only served in byte ranges.", { status: 416 });
  const head = await env.BUCKET.head(key);
  if (!head) return new Response("Not found", { status: 404 });
  if (!archive) {
    const obj = await env.BUCKET.get(key);
    return new Response(request.method === "HEAD" ? null : obj.body, {
      headers: { "content-type": "application/json", etag: obj.httpEtag, "cache-control": "public, max-age=3600" },
    });
  }
  const start = +m[1], end = Math.min(+m[2], head.size - 1);
  if (start >= head.size) return new Response("Range not satisfiable", { status: 416, headers: { "content-range": `bytes */${head.size}` } });
  const cacheKey = new Request(`https://r2-cache.internal/${key}?v=${head.etag}&r=${start}-${end}`);
  let hit = await caches.default.match(cacheKey);
  if (!hit) {
    const obj = await env.BUCKET.get(key, { range: { offset: start, length: end - start + 1 }, onlyIf: { etagMatches: head.etag } });
    if (!obj?.body) return new Response("Archive changed, retry", { status: 503, headers: { "retry-after": "1" } });
    hit = new Response(await obj.arrayBuffer(), { headers: { "cache-control": "public, max-age=86400" } });
    ctx.waitUntil(caches.default.put(cacheKey, hit.clone()));
  }
  return new Response(request.method === "HEAD" ? null : hit.body, {
    status: 206,
    headers: {
      "content-type": "application/octet-stream",
      "content-range": `bytes ${start}-${end}/${head.size}`,
      "accept-ranges": "bytes",
      etag: head.httpEtag,
      "cache-control": "public, max-age=86400",
    },
  });
}

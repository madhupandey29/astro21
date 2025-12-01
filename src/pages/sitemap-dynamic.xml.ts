import type { APIRoute } from 'astro';

export const prerender = false;

/* ========= Env & config (with fallbacks) ========= */
const SITE = (import.meta.env.SITE || 'https://astro-landing-page-rho.vercel.app').replace(/\/+$/, '');

// Accept either API_BASE or API_BASE_URL
const _apiBase =
  (import.meta.env.API_BASE as string) ||
  (import.meta.env.API_BASE_URL as string) ||
  'https://test.amrita-fashions.com';
const API_BASE = _apiBase.replace(/\/+$/, ''); // trims trailing slash

// Optional auth headers (your API uses these)
const API_KEY = (import.meta.env.NEXT_PUBLIC_API_KEY || '').trim();
const API_KEY_HEADER = (import.meta.env.NEXT_API_KEY_HEADER || 'x-api-key').trim();
const ADMIN_EMAIL = (import.meta.env.NEXT_PUBLIC_ADMIN_EMAIL || '').trim();
const ADMIN_EMAIL_HEADER = (import.meta.env.NEXT_PUBLIC_ADMIN_EMAIL_HEADER || 'x-admin-email').trim();

function authHeaders() {
  const h: Record<string, string> = { accept: 'application/json' };
  if (API_KEY) h[API_KEY_HEADER] = API_KEY;
  if (ADMIN_EMAIL) h[ADMIN_EMAIL_HEADER] = ADMIN_EMAIL;
  return h;
}

const PRODUCTS_URL = `${API_BASE}/product`;
const CITIES_URL   = `${API_BASE}/cities`;

function toInt(v: any, d: number) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
}
const MAX_PRODUCTS = toInt(import.meta.env.SITEMAP_MAX_PRODUCTS, 200);
const MAX_CITIES   = toInt(import.meta.env.SITEMAP_MAX_CITIES, 200);
const HARD_LIMIT   = toInt(import.meta.env.SITEMAP_HARD_LIMIT, 48000);

/* ================= Helpers ================= */
function slugify(input: string): string {
  return (input || '')
    .toString()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/--+/g, '-');
}
function esc(s: string) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function safeJson(url: string) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: authHeaders() });
    if (!res.ok) {
      console.error('SITEMAP fetch not ok:', res.status, url);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error('SITEMAP fetch error:', url, e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ================= Route ================= */
export const GET: APIRoute = async () => {
  try {
    const [prodRes, cityRes] = await Promise.all([
      safeJson(PRODUCTS_URL),
      safeJson(CITIES_URL),
    ]);

    const products: any[] = ((prodRes && 'data' in prodRes ? prodRes.data : prodRes) || []).slice(0, MAX_PRODUCTS);
    const cities: any[]   = ((cityRes && 'data' in cityRes ? cityRes.data : cityRes) || []).slice(0, MAX_CITIES);

    const nowIso = new Date().toISOString();
    const urls: string[] = [];

    // Always include core pages
    for (const p of ['/', '/about', '/products', '/gallery', '/updates', '/contact']) {
      urls.push(`<url>
  <loc>${esc(SITE + p)}</loc>
  <lastmod>${nowIso}</lastmod>
  <changefreq>weekly</changefreq>
  <priority>0.6</priority>
</url>`);
    }

    const getPSlug = (p: any) => (p?.slug || p?.seoSlug || slugify(p?.name || p?.title || '') || '').toString();
    const getCSlug = (c: any) => (c?.slug || c?.code || slugify(c?.name || '') || '').toString();

    outer: for (const p of products) {
      const ps = getPSlug(p);
      if (!ps) continue;

      const last =
        p?.updatedAt && !Number.isNaN(Date.parse(p.updatedAt))
          ? new Date(p.updatedAt).toISOString()
          : nowIso;

      for (const c of cities) {
        const cs = getCSlug(c);
        if (!cs) continue;

        urls.push(`<url>
  <loc>${esc(`${SITE}/${ps}/${cs}/`)}</loc>
  <lastmod>${last}</lastmod>
  <changefreq>weekly</changefreq>
  <priority>0.8</priority>
</url>`);

        if (urls.length >= HARD_LIMIT) break outer;
      }
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;

    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (e) {
    console.error('SITEMAP fatal error:', e);
    const fallback = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${esc(SITE)}/</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>
</urlset>`;
    return new Response(fallback, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
  }
};

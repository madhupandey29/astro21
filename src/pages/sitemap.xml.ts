import type { APIRoute } from "astro";

export const prerender = false;

/* ---------------------------
   Config using YOUR env vars
---------------------------- */

const SITE = (import.meta.env.SITE || "https://astro-landing-page-rho.vercel.app")
  .toString()
  .replace(/\/+$/, "");

const API_BASE = (
  import.meta.env.API_BASE_URL || "https://test.amrita-fashions.com/landing/"
)
  .toString()
  .replace(/\/+$/, "");

// final SEO list endpoint => https://test.amrita-fashions.com/landing/seo
const SEO_ENDPOINT = `${API_BASE}/seo`;

// headers + keys from your .env
const API_KEY_HEADER =
  (import.meta.env.NEXT_API_KEY_HEADER as string) || "x-api-key";
const ADMIN_EMAIL_HEADER =
  (import.meta.env.NEXT_PUBLIC_ADMIN_EMAIL_HEADER as string) || "x-admin-email";

const API_KEY = (import.meta.env.NEXT_PUBLIC_API_KEY as string) || "";
const ADMIN_EMAIL =
  (import.meta.env.NEXT_PUBLIC_ADMIN_EMAIL as string) || "";

/* ---------------------------
   Types
---------------------------- */

type SeoDoc = {
  slug?: string;
  updatedAt?: string;
};

/* ---------------------------
   Helpers
---------------------------- */

function buildAuthHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (API_KEY) h[API_KEY_HEADER] = API_KEY;
  if (ADMIN_EMAIL) h[ADMIN_EMAIL_HEADER] = ADMIN_EMAIL;
  return h;
}

function normalizePathFromSlug(raw: string): string {
  return raw.split("#")[0].trim().replace(/^\/+/, "");
}

function collapseDoubleSlashes(url: string): string {
  return url.replace(/([^:]\/)\/+/g, "$1");
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function fetchSeoSlugs(): Promise<SeoDoc[]> {
  try {
    const res = await fetch(SEO_ENDPOINT, {
      headers: buildAuthHeaders(),
      cache: "no-store",
    });

    if (!res.ok) {
      console.error("Sitemap: failed to fetch SEO slugs", res.status);
      return [];
    }

    const data = await res.json();
    if (Array.isArray(data)) return data as SeoDoc[];
    if (Array.isArray((data as any)?.data)) return (data as any).data as SeoDoc[];
    return [];
  } catch (err) {
    console.error("Sitemap fetch error:", err);
    return [];
  }
}

/* ---------------------------
   GET handler
---------------------------- */

export const GET: APIRoute = async () => {
  const now = new Date();

  const urls: {
    loc: string;
    lastmod: string;
    changefreq: string;
    priority: string;
  }[] = [];

  // Home page
  urls.push({
    loc: `${SITE}/`,
    lastmod: now.toISOString(),
    changefreq: "weekly",
    priority: "1",
  });

  // Dynamic SEO URLs
  const seoDocs = await fetchSeoSlugs();
  const seen = new Set<string>();

  for (const doc of seoDocs) {
    const path = normalizePathFromSlug(doc?.slug || "");
    if (!path) continue;

    const loc = collapseDoubleSlashes(`${SITE}/${path}`);
    if (seen.has(loc)) continue;
    seen.add(loc);

    urls.push({
      loc,
      lastmod: (doc?.updatedAt
        ? new Date(doc.updatedAt)
        : now
      ).toISOString(),
      changefreq: "weekly",
      priority: "0.7",
    });
  }

  // Safety filter
  const safeUrls = urls.filter((u) => /^https?:\/\/[^ ]+$/i.test(u.loc));

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    safeUrls
      .map(
        (u) => `  <url>
    <loc>${escapeXml(u.loc)}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
      )
      .join("\n") +
    `\n</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // roughly same idea as revalidate=3600 in Next
      "Cache-Control": "public, max-age=0, s-maxage=3600",
    },
  });
};

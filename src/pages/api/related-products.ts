/// <reference types="astro/client" />
import type { APIRoute } from "astro";

export const prerender = false;

const API_ROOT = (import.meta.env.PUBLIC_API_BASE_URL ?? "https://test.amrita-fashions.com/landing")
  .toString()
  .replace(/\/+$/, "");

export const POST: APIRoute = async ({ request }) => {
  try {
    const { ids = [], offset = 0, limit = 3 } = await request.json();

    const res = await fetch(`${API_ROOT}/product`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return new Response(JSON.stringify({ items: [], total: 0, error: "upstream-failed" }), { status: 502 });
    }

    const j = await res.json();
    const all: any[] =
      Array.isArray(j?.data) ? j.data :
      Array.isArray(j?.data?.products) ? j.data.products :
      Array.isArray(j) ? j : [];

    const ordered = (Array.isArray(ids) ? ids : [])
      .map((id: any) => all.find((p: any) => String(p?._id) === String(id)))
      .filter(Boolean);

    const start = Number(offset) || 0;
    const end = start + (Number(limit) || 3);
    const slice = ordered.slice(start, end);

    return new Response(JSON.stringify({ items: slice, total: ordered.length }), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" }
    });
  } catch {
    return new Response(JSON.stringify({ items: [], total: 0, error: "bad-request" }), { status: 400 });
  }
};

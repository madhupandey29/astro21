import type { APIRoute } from "astro";

const S = (x: unknown) => (typeof x === "string" ? x : String(x ?? ""));
const A = (x: unknown) =>
  Array.isArray(x) ? x.map((y) => String(y)) : typeof x === "string" ? [x] : [];

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const ct = (req.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("application/json")) {
    return (await req.json()) as Record<string, unknown>;
  }
  if (
    ct.includes("multipart/form-data") ||
    ct.includes("application/x-www-form-urlencoded") ||
    ct.includes("text/plain")
  ) {
    const fd = await req.formData();
    const obj: Record<string, unknown> = Object.fromEntries(fd.entries());
    const ft: string[] = [];
    for (const [k, v] of (fd as unknown as Iterable<[string, FormDataEntryValue]>)) {
      if (k === "fabricTypes") ft.push(String(v));
    }
    if (ft.length) obj.fabricTypes = ft;
    return obj;
  }
  const t = await req.text();
  return t ? Object.fromEntries(new URLSearchParams(t)) : {};
}

function allBlank(v: Record<string, unknown>) {
  const vals = Object.values(v);
  if (vals.length === 0) return true;
  return vals.every((x) => {
    if (Array.isArray(x)) return x.length === 0;
    const s = typeof x === "string" ? x : String(x ?? "");
    return s.trim() === "";
  });
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const src = await readBody(request);

    // Map Next-style names → backend schema
    const body = {
      companyName: S(src.companyName),
      contactPerson: S(src.contactPerson),
      email: S(src.email),
      phoneNumber: S(src.phoneNumber ?? src.phone),
      businessType: S(src.businessType),
      annualFabricVolume: S(src.annualFabricVolume ?? src.annualVolume),
      primaryMarkets: S(src.primaryMarkets),
      fabricTypesOfInterest: A(src.fabricTypesOfInterest ?? src.fabricTypes),
      specificationsRequirements: S(src.specificationsRequirements ?? src.specifications),
      timeline: S(src.timeline),
      additionalMessage: S(src.additionalMessage ?? src.message),
      source: S(src.source ?? "astro-landing-contact"),
    };

    // Do NOT create an empty contact
    if (allBlank(body)) {
      return new Response(
        JSON.stringify({
          ok: false,
          error:
            "Empty payload received. Ensure the form sends JSON with the Next-style field names.",
          echo: { received: src }
        }),
        { status: 422, headers: { "Content-Type": "application/json" } }
      );
    }

    // Create
    const upstream = await fetch("https://test.amrita-fashions.com/landing/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return new Response(JSON.stringify({ ok: false, error: data?.message || "Upstream error" }), {
        status: upstream.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Optional: also PUT if client sends draft id
    const id = (src.draftId as string) || (src.id as string) || "";
    if (id) {
      await fetch(`https://test.amrita-fashions.com/landing/contacts/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      }).catch(() => null);
    }

    return new Response(JSON.stringify({ ok: true, data, echo: { received: src, mapped: body } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message || "Unknown error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const GET: APIRoute = async () =>
  new Response(JSON.stringify({ ok: false, error: "POST JSON from the form." }), {
    status: 405,
    headers: { "Content-Type": "application/json" },
  });

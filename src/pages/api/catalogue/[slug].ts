// src/pages/api/catalogue/[slug].ts
import type { APIRoute } from 'astro';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/* ===== Brand palette ===== */
const COL = {
  blue: rgb(0.173, 0.298, 0.592),        // #2C4C97
  gold: rgb(0.839, 0.655, 0.294),        // #D6A74B
  ink: rgb(0.06, 0.09, 0.13),
  ink2: rgb(0.28, 0.33, 0.40),
  line: rgb(0.88, 0.90, 0.93),
  panel: rgb(0.97, 0.98, 0.99),
  border: rgb(0.90, 0.92, 0.94),
  white: rgb(1, 1, 1),
};

const API_ROOT = (import.meta.env.PUBLIC_API_BASE_URL ?? 'https://test.amrita-fashions.com/landing').replace(/\/+$/, '');
const API_KEY   = import.meta.env.PUBLIC_API_KEY ?? '';
const ADMIN     = import.meta.env.PUBLIC_ADMIN_EMAIL ?? '';

/* ===== Helpers ===== */
const norm = (s: any) => String(s ?? '').trim().toLowerCase();
const toId = (v: any) => (typeof v === 'string' ? v.trim() : v?._id ? String(v._id).trim() : '');

function toWinAnsiSafe(input: any): string {
  let s = String(input ?? '');
  s = s.replace(/[\u200E\u200F\u202A-\u202E]/g, '');
  s = s.replace(/\u00A0/g, ' ');
  s = s.normalize('NFKD').replace(/[\u0300-\u036F]/g, '');
  s = s.replace(/[^\x00-\xFF]/g, '');
  return s;
}

function cloudinaryToJpeg(url: string | undefined): string | null {
  if (!url) return null;
  if (!/https?:\/\//i.test(url)) return url;
  if (url.includes('res.cloudinary.com')) {
    return url.includes('/upload/')
      ? url.replace('/upload/', '/upload/f_jpg/')
      : url;
  }
  return url;
}

async function fetchJson(url: string) {
  try {
    const r = await fetch(url, {
      headers: {
        Accept: 'application/json',
        ...(API_KEY ? { 'x-api-key': API_KEY } : {}),
        ...(ADMIN   ? { 'x-admin-email': ADMIN } : {}),
      },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

/** return Uint8Array or null (never throws) */
async function getBytes(url: string): Promise<Uint8Array | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const ab = await r.arrayBuffer();
    return new Uint8Array(ab);
  } catch { return null; }
}

/** sniff file magic bytes */
function sniffFormat(bytes?: Uint8Array | null): 'jpg'|'png'|null {
  if (!bytes || bytes.length < 4) return null;
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'jpg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'png';
  return null;
}

/** safely embed (sniff → try → fallback), returns null on failure */
async function safeEmbedImage(pdf: PDFDocument, bytes: Uint8Array | null, hintExt?: 'jpg'|'png') {
  if (!bytes) return null;
  const first = sniffFormat(bytes) || hintExt || 'jpg';
  try {
    return first === 'png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  } catch {
    try {
      return first === 'png' ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
    } catch { return null; }
  }
}

/** Load logo bytes from env URL or from /public using the current request origin */
async function fetchLogoBytes(origin: string): Promise<Uint8Array | null> {
  const envUrl = (import.meta.env.PUBLIC_PDF_LOGO_URL || '').trim();
  const candidates = [
    envUrl && (/^https?:\/\//i.test(envUrl) ? envUrl : `${origin}${envUrl.startsWith('/') ? '' : '/'}${envUrl}`),
    `${origin}/images/brand/age.jpg`,
    `${origin}/images/brand/age.png`,
    `${origin}/amrita.png`,
  ].filter(Boolean) as string[];

  for (const u of candidates) {
    const b = await getBytes(u);
    if (b) return b;
  }
  return null;
}

function shapeProduct(p: any) {
  return {
    name: p?.name ?? 'Product',
    slug: p?.slug ?? '',
    sku: p?.sku ?? p?.productIdentifier ?? '',
    productdescription: p?.productdescription ?? p?.description ?? '',
    img: p?.img,
    image1: p?.image1,
    image2: p?.image2,
    gsm: p?.gsm, oz: p?.oz, cm: p?.cm, inch: p?.inch,
    content: p?.content?.name ?? p?.content ?? '',
    design: p?.design?.name ?? p?.design ?? '',
    subfinish: p?.subfinish?.name ?? p?.subfinish ?? '',
    substructure: p?.substructure?.name ?? p?.substructure ?? '',
    colors: Array.isArray(p?.color) ? p.color.map((c:any)=> c?.name || c).filter(Boolean).join(', ')
           : (p?.colors || ''),
  };
}

function pageMargins(pageWidth: number) {
  const left = 42, right = 42;
  return { left, right, contentWidth: pageWidth - left - right };
}

export const GET: APIRoute = async ({ params, request }) => {
  const slug = String(params.slug || '').trim();
  if (!slug) return new Response('Missing slug', { status: 400 });

  const [seoJson, prodJson, officeJson] = await Promise.all([
    fetchJson(`${API_ROOT}/seo`),
    fetchJson(`${API_ROOT}/product`),
    fetchJson(`${API_ROOT}/officeinformation`),
  ]);

  const seos: any[] = Array.isArray(seoJson?.data) ? seoJson.data : [];
  const products: any[] =
    Array.isArray(prodJson?.data) ? prodJson.data :
    Array.isArray(prodJson?.data?.products) ? prodJson.data.products :
    Array.isArray(prodJson) ? prodJson : [];

  let product = products.find(p => norm(p?.slug) === norm(slug)) ?? null;
  if (!product) {
    const seoRow = seos.find(s => norm(s?.slug) === norm(slug));
    if (seoRow) {
      const pid = toId(seoRow.product);
      product = products.find(p => toId(p?._id) === pid) ?? null;
    }
  }
  if (!product) return new Response('Product not found for slug', { status: 404 });

  const shaped = shapeProduct(product);

  // Office info
  const office = officeJson?.data?.[0] ?? null;
  const companyName    = toWinAnsiSafe(office?.companyName ?? 'Amrita Global Enterprises');
  const companyAddress = toWinAnsiSafe(office?.companyAddress ?? '');
  const phone1         = toWinAnsiSafe(office?.companyPhone1 ?? '');
  const phone2         = toWinAnsiSafe(office?.companyPhone2 ?? '');
  const wa             = toWinAnsiSafe(office?.companyWhatsApp ?? '');
  const email          = toWinAnsiSafe(office?.companyEmail ?? '');
  const website        = toWinAnsiSafe(office?.companyWebsite ?? '');

  // Images
  const candidates = [shaped.img, shaped.image1, shaped.image2].filter(Boolean) as string[];
  const imageUrls: string[] = [];
  for (const raw of candidates) {
    const u = cloudinaryToJpeg(raw) ?? '';
    if (!u || /\.(webp)(\?|$)/i.test(u)) continue;
    imageUrls.push(u);
  }

  /* ===== Build PDF ===== */
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);   // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageW = page.getWidth();
  const pageH = page.getHeight();
  const { left, contentWidth } = pageMargins(pageW);

  /* ---------- HEADER: logo + centered brand + twin blue/gold rules ---------- */
  const origin = new URL(request.url).origin;
  const logoBytes = await fetchLogoBytes(origin);

  // Brand text
  const brandTitle = (companyName || 'Amrita Global Enterprises').toUpperCase();
  const titleSize = 16;
  const titleW = fontBold.widthOfTextAtSize(brandTitle, titleSize);
  const titleY = pageH - 60;

  // Logo (left), robust embed
  if (logoBytes) {
    const logoImg = await safeEmbedImage(pdf, logoBytes); // sniff & embed
    if (logoImg) {
      const Lw = 44, Lh = 44;
      page.drawImage(logoImg, { x: left - 10, y: pageH - 62, width: Lw, height: Lh });
    }
  }

  page.drawText(brandTitle, {
    x: (pageW - titleW) / 2,
    y: titleY,
    size: titleSize,
    font: fontBold,
    color: COL.blue,
  });

  // Blue + gold bars (full width)
  const blueY = titleY - 12;
  page.drawRectangle({ x: 0, y: blueY, width: pageW, height: 4, color: COL.blue });
  page.drawRectangle({ x: 0, y: blueY - 6, width: pageW, height: 6, color: COL.gold });

  let y = blueY - 20;

  /* --- Images: main (60%) + two thumbs (40%) --- */
  const mainW = contentWidth * 0.60;
  const mainH = 184;
  const sideW = contentWidth * 0.40 - 16;
  const sideH = 88;

  if (imageUrls.length) {
    page.drawRectangle({ x:left, y:y - mainH, width:mainW, height:mainH, color: COL.panel, borderColor: COL.border, borderWidth: 1 });

    const mainUrl = imageUrls[0];
    const mainBytes = await getBytes(mainUrl);
    const mainImg = await safeEmbedImage(pdf, mainBytes, /\.png(\?|$)/i.test(mainUrl) ? 'png' : 'jpg');
    if (mainImg) {
      const scale = Math.min(mainW / mainImg.width, mainH / mainImg.height);
      const dw = mainImg.width * scale, dh = mainImg.height * scale;
      page.drawImage(mainImg, { x: left + (mainW - dw)/2, y: y - mainH + (mainH - dh)/2, width: dw, height: dh });
    } else {
      page.drawText('Image failed to load', { x:left + 12, y: y - 16, size: 10, font, color: COL.ink2 });
    }

    const extras = imageUrls.slice(1,3);
    for (let i=0; i<2; i++) {
      const ex = extras[i];
      const x = left + mainW + 16;
      const yy = y - (i * (sideH + 16));
      page.drawRectangle({ x, y: yy - sideH, width: sideW, height: sideH, color: COL.panel, borderColor: COL.border, borderWidth: 1 });

      if (ex) {
        const b = await getBytes(ex);
        const img = await safeEmbedImage(pdf, b, /\.png(\?|$)/i.test(ex) ? 'png' : 'jpg');
        if (img) {
          const scale = Math.min(sideW / img.width, sideH / img.height);
          const dw = img.width * scale, dh = img.height * scale;
          page.drawImage(img, { x: x + (sideW - dw)/2, y: yy - sideH + (sideH - dh)/2, width: dw, height: dh });
        }
      }
    }
    y -= (mainH + 24);
  } else {
    page.drawRectangle({ x:left, y:y - 110, width:contentWidth, height:110, color: COL.panel, borderColor: COL.border, borderWidth: 1 });
    page.drawText('No images available', { x:left + 12, y: y - 64, size: 12, font, color: COL.ink2 });
    y -= 130;
  }

  /* --- Product title bar --- */
  const barH = 28;
  page.drawRectangle({ x: left, y: y - barH, width: contentWidth, height: barH, color: COL.blue });
  page.drawText(toWinAnsiSafe(shaped.name || 'Product'), {
    x: left + 12, y: y - barH + 8, size: 16, font: fontBold, color: COL.white,
  });
  const skuText = shaped.sku ? `SKU: ${toWinAnsiSafe(shaped.sku)}` : '';
  if (skuText) {
    const w = font.widthOfTextAtSize(skuText, 12);
    page.drawText(skuText, { x: left + contentWidth - w - 12, y: y - barH + 8, size: 12, font, color: COL.white });
  }
  y -= (barH + 18);

  /* --- Measurements table --- */
  const tW = contentWidth * 0.80;
  const colW = tW / 4;
  const tX = left + (contentWidth - tW)/2;
  const headerH = 24;
  const cellH = 24;

  page.drawRectangle({ x:tX, y:y - (headerH + cellH), width:tW, height:(headerH + cellH), color: COL.white, borderColor: COL.border, borderWidth: 1 });
  for (let i=1; i<4; i++) {
    const x = tX + i*colW;
    page.drawLine({ start:{x, y:y}, end:{x, y:y - (headerH + cellH)}, thickness: 0.6, color: COL.line });
  }
  page.drawLine({ start:{x:tX, y:y - headerH}, end:{x:tX + tW, y:y - headerH}, thickness: 0.6, color: COL.line });

  const labels = ['GSM','OZ','CM','INCH'];
  const vals = [shaped.gsm ?? '—', shaped.oz ?? '—', shaped.cm ?? '—', shaped.inch ?? '—'];
  for (let i=0; i<4; i++) {
    const cx = tX + i*colW + 6;
    page.drawText(labels[i], { x: cx, y: y - 16, size: 12, font: fontBold, color: COL.ink2 });
    page.drawText(String(vals[i]), { x: cx, y: y - headerH - 16, size: 12, font, color: COL.ink });
  }
  y -= (headerH + cellH + 20);

  /* --- Product Specifications --- */
  page.drawText('Product Specifications:', { x:left, y, size: 12, font: fontBold, color: COL.blue });
  y -= 16;

  const specs: [string,string][] = [
    ['Content', toWinAnsiSafe(shaped.content || '—')],
    ['Design', toWinAnsiSafe(shaped.design || '—')],
    ['Finish', toWinAnsiSafe(shaped.subfinish || '—')],
    ['Structure', toWinAnsiSafe(shaped.substructure || '—')],
    ['Colors', toWinAnsiSafe(shaped.colors || '—')],
  ];

  const gap = 18;
  const half = (contentWidth - gap) / 2;
  let rowY = y;
  for (let i=0; i<specs.length; i++) {
    const [label, value] = specs[i];
    const colX = i % 2 === 0 ? left : left + half + gap;
    if (i % 2 !== 0) rowY -= 20;

    page.drawText(label + ':', { x: colX, y: rowY, size: 11, font: fontBold, color: COL.ink2 });
    page.drawText(value, { x: colX + 64, y: rowY, size: 11, font, color: COL.ink });
  }
  y = rowY - 26;

  /* --- Description --- */
  const rawDesc = shaped.productdescription ? toWinAnsiSafe(shaped.productdescription) : '';
  if (rawDesc) {
    page.drawText('Description:', { x:left, y, size: 12, font: fontBold, color: COL.blue });
    y -= 16;

    const maxW = contentWidth, size = 11, lh = 14;
    const words = rawDesc.replace(/\s+/g,' ').trim().split(' ');
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) > maxW && line) {
        page.drawText(line, { x:left, y, size, font, color: COL.ink });
        line = w; y -= lh; if (y < 110) break;
      } else line = test;
    }
    if (y >= 110 && line) { page.drawText(line, { x:left, y, size, font, color: COL.ink }); y -= lh; }
  }

  /* --- Footer --- */
  const footerBase = 34;
  if (companyAddress) page.drawText(companyAddress, { x:left, y: footerBase + 44, size:10, font, color: COL.ink2 });

  const contacts: string[] = [];
  if (phone1) contacts.push(`Phone: ${phone1}`);
  if (phone2) contacts.push(phone2);
  if (wa)     contacts.push(`WhatsApp: ${wa}`);
  if (email)  contacts.push(`Email: ${email}`);

  let cx = left;
  for (let i=0; i<contacts.length; i++) {
    const t = contacts[i];
    page.drawText(t, { x: cx, y: footerBase + 28, size:10, font, color: COL.ink2 });
    cx += font.widthOfTextAtSize(t, 10) + 10;
    if (i < contacts.length - 1) {
      page.drawText('|', { x: cx, y: footerBase + 28, size:10, font, color: COL.ink2 });
      cx += 8;
    }
  }

  if (website) {
    const clean = website.replace(/^https?:\/\//, '').replace(/\/$/,'');
    page.drawText(`Website: ${clean}`, { x:left, y: footerBase + 12, size:10, font, color: COL.ink2 });
  }

  const thanks = 'Thank you for your interest in our products!';
  const dateStr = new Date().toLocaleDateString();
  const midX = left + contentWidth / 2;
  page.drawText(thanks, { x: midX - font.widthOfTextAtSize(thanks, 10)/2, y: footerBase - 4, size:10, font, color: COL.ink2 });
  page.drawText(dateStr, { x: midX - font.widthOfTextAtSize(dateStr, 8)/2, y: footerBase - 18, size:8, font, color: rgb(0.53,0.58,0.67) });

  /* --- Send response --- */
  const bytes = await pdf.save();
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

  const fname = `${toWinAnsiSafe(shaped.name || 'catalog').replace(/[^a-z0-9\-]+/gi,'-')}-${slug}-${new Date().toISOString().slice(0,10)}.pdf`;
  const headers = new Headers({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${fname}"`,
    'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=86400',
  });

  return new Response(ab, { status: 200, headers });
};

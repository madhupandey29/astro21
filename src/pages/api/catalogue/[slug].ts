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

/** Load logo bytes - HTTP only for deployment compatibility */
async function fetchLogoBytes(origin: string): Promise<Uint8Array | null> {
  // Use HTTP fetch (works in both dev and production)
  const httpCandidates = [
    `${origin}/images/brand/age.jpg`,
    `${origin}/images/brand/my_logo.png`,
    `${origin}/apple-touch-icon.png`,
  ];
  
  for (const url of httpCandidates) {
    try {
      const bytes = await getBytes(url);
      if (bytes) return bytes;
    } catch {
      continue;
    }
  }
  
  return null;
}

function shapeProduct(p: any) {
  // Format leadtime - handle both array and string
  let leadtimeStr = '';
  if (Array.isArray(p?.leadtime) && p.leadtime.length > 0) {
    leadtimeStr = p.leadtime.join(', ');
  } else if (p?.leadtime) {
    leadtimeStr = String(p.leadtime);
  }

  return {
    name: p?.name ?? 'Product',
    slug: p?.slug ?? '',
    sku: p?.sku ?? '',
    fullProductDescription: p?.fullProductDescription ?? p?.productdescription ?? p?.description ?? '',
    image1: p?.image1,
    image2: p?.image2,
    image3: p?.image3,
    gsm: p?.gsm, 
    oz: p?.oz, 
    cm: p?.cm, 
    inch: p?.inch,
    content: p?.content?.name ?? p?.content ?? '',
    design: p?.design?.name ?? p?.design ?? '',
    subfinish: p?.subfinish?.name ?? p?.subfinish ?? '',
    substructure: p?.substructure?.name ?? p?.substructure ?? '',
    motif: p?.motif?.name ?? p?.motif ?? '',
    leadtime: leadtimeStr,
    rating_value: p?.rating_value ?? 0,
    rating_count: p?.rating_count ?? 0,
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

  // Images - prioritize image3 (main), then image1, image2
  const candidates = [shaped.image3, shaped.image1, shaped.image2].filter(Boolean) as string[];
  const imageUrls: string[] = [];
  for (const raw of candidates) {
    const u = cloudinaryToJpeg(raw) ?? '';
    if (!u || /\.(webp)(\?|$)/i.test(u)) continue;
    imageUrls.push(u);
  }

  /* ===== Build PDF ===== */
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 680]);   // Custom compact size
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageW = page.getWidth();
  const pageH = page.getHeight();
  const { left, contentWidth } = pageMargins(pageW);

  /* ---------- HEADER: company name (right) + logo (left between lines) ---------- */
  const origin = new URL(request.url).origin;
  
  // Try to load logo (will work in runtime, not during build)
  let logoBytes: Uint8Array | null = null;
  try {
    logoBytes = await fetchLogoBytes(origin);
  } catch (e) {
    console.error('Logo loading failed:', e);
  }

  const headerY = pageH - 38;
  const logoSize = 50;
  
  // Brand text (right side, above lines)
  const brandTitle = (companyName || 'Amrita Global Enterprises').toUpperCase();
  const titleSize = 18;
  const titleW = fontBold.widthOfTextAtSize(brandTitle, titleSize);
  const { right } = pageMargins(pageW);
  page.drawText(brandTitle, {
    x: pageW - right - titleW,
    y: headerY + 16,
    size: titleSize,
    font: fontBold,
    color: COL.blue,
  });
  
  // Full-width horizontal lines
  const lineY = headerY;
  page.drawRectangle({ x: 0, y: lineY, width: pageW, height: 3, color: COL.gold });
  page.drawRectangle({ x: 0, y: lineY - 5, width: pageW, height: 2, color: COL.blue });

  // Logo on left (overlapping the lines, centered vertically)
  // Note: WEBP not supported by pdf-lib, so we skip logo for now
  // You can convert your logo to PNG/JPG and update the URL in fetchLogoBytes
  if (logoBytes) {
    try {
      const format = sniffFormat(logoBytes);
      let logoImg = null;
      
      if (format === 'jpg') {
        logoImg = await pdf.embedJpg(logoBytes);
      } else if (format === 'png') {
        logoImg = await pdf.embedPng(logoBytes);
      } else {
        // Try both formats
        try {
          logoImg = await pdf.embedPng(logoBytes);
        } catch {
          try {
            logoImg = await pdf.embedJpg(logoBytes);
          } catch (e) {
            console.error('Logo format not supported (WEBP?). Convert to PNG/JPG:', e);
          }
        }
      }
      
      if (logoImg) {
        const logoY = lineY - (logoSize / 2) + 1;
        page.drawImage(logoImg, { x: left, y: logoY, width: logoSize, height: logoSize });
      }
    } catch (err) {
      console.error('Logo embedding error:', err);
    }
  }

  let y = lineY - 28;

  /* --- Images: main (60%) + two thumbs (40%) --- */
  const mainW = contentWidth * 0.58;
  const mainH = 120;
  const sideW = contentWidth * 0.42 - 10;
  const sideH = 55;

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
      const x = left + mainW + 10;
      const yy = y - (i * (sideH + 10));
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
    y -= (mainH + 18);
  } else {
    page.drawRectangle({ x:left, y:y - 110, width:contentWidth, height:110, color: COL.panel, borderColor: COL.border, borderWidth: 1 });
    page.drawText('No images available', { x:left + 12, y: y - 64, size: 12, font, color: COL.ink2 });
    y -= 130;
  }

  /* --- Product title bar --- */
  const barH = 26;
  page.drawRectangle({ x: left, y: y - barH, width: contentWidth, height: barH, color: COL.blue });
  page.drawText(toWinAnsiSafe(shaped.name || 'Product'), {
    x: left + 12, y: y - barH + 8, size: 14, font: fontBold, color: COL.white,
  });
  const skuText = shaped.sku ? `SKU: ${toWinAnsiSafe(shaped.sku)}` : '';
  if (skuText) {
    const w = font.widthOfTextAtSize(skuText, 11);
    page.drawText(skuText, { x: left + contentWidth - w - 12, y: y - barH + 8, size: 11, font, color: COL.white });
  }
  y -= (barH + 16);

  /* --- Product Specifications --- */
  page.drawText('Product Specifications:', { x:left, y, size: 12, font: fontBold, color: COL.blue });
  y -= 16;

  // Build weight string
  const weightParts = [];
  if (shaped.gsm) weightParts.push(`${shaped.gsm} gsm`);
  if (shaped.oz) weightParts.push(`${shaped.oz} oz`);
  const weightStr = weightParts.length > 0 ? weightParts.join(' / ') : '—';

  // Build width string
  const widthParts = [];
  if (shaped.cm) widthParts.push(`${shaped.cm} cm`);
  if (shaped.inch) widthParts.push(`${shaped.inch} inch`);
  const widthStr = widthParts.length > 0 ? widthParts.join(' / ') : '—';

  const specs: [string,string][] = [
    ['Content', toWinAnsiSafe(shaped.content || '—')],
    ['Weight', toWinAnsiSafe(weightStr)],
    ['Width', toWinAnsiSafe(widthStr)],
    ['Finish', toWinAnsiSafe(shaped.subfinish || '—')],
    ['Design', toWinAnsiSafe(shaped.design || '—')],
    ['Motif', toWinAnsiSafe(shaped.motif || 'None/ NA')],
    ['Structure', toWinAnsiSafe(shaped.substructure || '—')],
    ['Colors', toWinAnsiSafe(shaped.colors || '—')],
    ['Lead time', shaped.leadtime || '—'],
  ];

  const specGap = 20;
  const half = (contentWidth - specGap) / 2;
  let rowY = y;
  for (let i=0; i<specs.length; i++) {
    const [label, value] = specs[i];
    const colX = i % 2 === 0 ? left : left + half + specGap;
    if (i % 2 !== 0) rowY -= 18;

    page.drawText(label + ':', { x: colX, y: rowY, size: 10, font: fontBold, color: COL.ink2 });
    page.drawText(value, { x: colX + 60, y: rowY, size: 10, font, color: COL.ink });
  }
  y = rowY - 20;

  /* --- Rating & Reviews --- */
  if (shaped.rating_value > 0 || shaped.rating_count > 0) {
    page.drawLine({ start:{x:left, y:y}, end:{x:left + contentWidth, y:y}, thickness: 0.8, color: COL.line, dashArray: [3, 3] });
    y -= 12;

    const rating = Math.round(shaped.rating_value);
    const ratingText = `${rating}/5`;
    
    page.drawText('Rating:', { x: left, y, size: 10, font: fontBold, color: COL.ink2 });
    page.drawText(ratingText, { x: left + 45, y, size: 11, font: fontBold, color: rgb(0.96, 0.62, 0.04) });
    
    if (shaped.rating_count > 0) {
      page.drawText('Reviews:', { x: left + 100, y, size: 10, font: fontBold, color: COL.ink2 });
      page.drawText(String(shaped.rating_count), { x: left + 150, y, size: 10, font, color: COL.ink });
    }
    
    y -= 12;
    page.drawLine({ start:{x:left, y:y}, end:{x:left + contentWidth, y:y}, thickness: 0.8, color: COL.line, dashArray: [3, 3] });
    y -= 12;
  }

  /* --- Description --- */
  const rawDesc = shaped.fullProductDescription ? toWinAnsiSafe(shaped.fullProductDescription) : '';
  if (rawDesc) {
    page.drawText('Description:', { x:left, y, size: 12, font: fontBold, color: COL.blue });
    y -= 16;

    const maxW = contentWidth, size = 10, lh = 14;
    // Strip HTML tags for PDF
    const cleanDesc = rawDesc.replace(/<[^>]*>/g, '').replace(/\s+/g,' ').trim();
    const words = cleanDesc.split(' ');
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) > maxW && line) {
        page.drawText(line, { x:left, y, size, font, color: COL.ink });
        line = w; y -= lh; if (y < 90) break;
      } else line = test;
    }
    if (y >= 90 && line) { page.drawText(line, { x:left, y, size, font, color: COL.ink }); y -= lh; }
  }

  /* --- Footer --- */
  const footerBase = 38;
  
  // Gold and blue lines (matching header)
  page.drawRectangle({ x: 0, y: footerBase + 44, width: pageW, height: 3, color: COL.gold });
  page.drawRectangle({ x: 0, y: footerBase + 41, width: pageW, height: 2, color: COL.blue });
  
  // Address in gold (with more space from line)
  if (companyAddress) {
    page.drawText(companyAddress, { x:left, y: footerBase + 30, size:11, font: fontBold, color: COL.gold });
  }

  // All contact info on one line horizontally
  const contacts: string[] = [];
  if (phone1) contacts.push(`Phone: ${phone1}`);
  if (phone2) contacts.push(`+${phone2}`);
  if (email) contacts.push(`Email: ${email}`);
  
  if (contacts.length > 0) {
    let cx = left;
    for (let i=0; i<contacts.length; i++) {
      const t = contacts[i];
      page.drawText(t, { x: cx, y: footerBase + 18, size:10, font, color: COL.gold });
      cx += font.widthOfTextAtSize(t, 10) + 8;
      if (i < contacts.length - 1) {
        page.drawText('|', { x: cx, y: footerBase + 18, size:10, font, color: COL.gold });
        cx += 10;
      }
    }
  }

  // Thank you message in gold (centered)
  const thanks = 'Thank you for your interest in our products!';
  const dateStr = new Date().toLocaleDateString();
  const midX = left + contentWidth / 2;
  page.drawText(thanks, { x: midX - fontBold.widthOfTextAtSize(thanks, 12)/2, y: footerBase + 2, size:12, font: fontBold, color: COL.gold });
  
  // Date in lighter gold
  const dateColor = rgb(0.72, 0.63, 0.44); // #B8A06F
  page.drawText(dateStr, { x: midX - font.widthOfTextAtSize(dateStr, 9)/2, y: footerBase - 12, size:9, font, color: dateColor });

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

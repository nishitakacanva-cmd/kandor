/**
 * Kandor — photo recognition endpoint (Cloudflare Pages Function)
 * Route: /api/identify
 *
 * GET  → { configured: true|false }   (lets the app know photo recognition is available)
 * POST → { image: <base64 JPEG/PNG/WebP>, mime: "image/jpeg", catalog: [{id, nm, br, cat}, ...] }
 *        ← { status: "match", id, confidence, seen }
 *        ← { status: "new", confidence, product, scores, notes, ingredients, details }
 *        ← { status: "none", reason }
 *
 * The Gemini key lives ONLY in the Cloudflare secret GEMINI_API_KEY — never in the page.
 * Optional settings:  GEMINI_MODEL (e.g. "gemini-flash-latest"),  ALLOWED_ORIGINS (comma-separated).
 */

const DEFAULT_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest'];
const CATS = ['dairy', 'staples', 'personal', 'beverages', 'household', 'snacks', 'other'];
const ICONS = ['grain', 'packaging', 'factory', 'chemical', 'nutrition', 'processing', 'water', 'money', 'ethics', 'leaf', 'palm', 'sugar', 'store', 'heart'];
const VERDICTS = ['good', 'check', 'flag'];

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

function originAllowed(request, env) {
  const origin = request.headers.get('origin');
  if (!origin) return true;                       // same-origin form posts / server tools
  let host;
  try { host = new URL(origin).host; } catch { return false; }
  if (host === new URL(request.url).host) return true;
  const extra = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  return extra.some(o => { try { return new URL(o).host === host; } catch { return o === host; } });
}

export async function onRequestGet({ env }) {
  return json({ configured: Boolean(env.GEMINI_API_KEY) });
}

export async function onRequestPost({ request, env }) {
  if (!originAllowed(request, env)) return json({ error: 'forbidden' }, 403);
  if (!env.GEMINI_API_KEY) return json({ error: 'not_configured' }, 503);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const image = body && body.image;
  const mime = (body && body.mime) || 'image/jpeg';
  if (typeof image !== 'string' || image.length < 200 || image.length > 7_000_000) return json({ error: 'bad_image' }, 400);
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(mime)) return json({ error: 'bad_image' }, 400);

  const catalog = Array.isArray(body.catalog) ? body.catalog.slice(0, 300) : [];
  const ids = new Set(catalog.map(p => String(p.id)));
  const list = catalog
    .map(p => [p.id, p.br, p.nm, p.cat].map(v => String(v ?? '').replace(/[\n|]/g, ' ').slice(0, 100)).join(' | '))
    .join('\n');

  const models = [env.GEMINI_MODEL, ...DEFAULT_MODELS].filter((m, i, a) => m && a.indexOf(m) === i);
  let lastErr = 'upstream_error';
  for (const model of models) {
    let r;
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mime, data: image } }, { text: prompt(list) }] }],
          generationConfig: { temperature: 0.1, responseMimeType: 'application/json', responseSchema: SCHEMA },
        }),
      });
    } catch { lastErr = 'upstream_unreachable'; continue; }
    if (r.status === 429) return json({ error: 'rate_limited' }, 429);
    if (r.status === 400 || r.status === 401 || r.status === 403) {
      const t = await r.text();
      if (/API key|API_KEY|permission/i.test(t)) return json({ error: 'bad_key' }, 502);
      lastErr = 'upstream_rejected'; continue;
    }
    if (!r.ok) { lastErr = r.status === 404 ? 'model_not_found' : 'upstream_error'; continue; }
    let out;
    try {
      const data = await r.json();
      const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
      out = JSON.parse(text);
    } catch { lastErr = 'bad_model_output'; continue; }
    return json({ ...clean(out, ids), model });
  }
  return json({ error: lastErr }, 502);
}

/* ---------- prompt: identification + Kandor's own scoring method ---------- */
function prompt(list) {
  return `You are the product recogniser for Kandor, an Indian app that grades packaged groceries and personal-care products.

STEP 1 — IDENTIFY. Look at the photo. Read the brand, logo, product name, variant, pack colours and shape. If no packaged product is clearly visible, answer status "none" with a short reason.

STEP 2 — MATCH. Compare it with Kandor's catalogue below (id | brand | product | category). If the photo shows the SAME brand AND the same product line as a catalogue entry (pack size or minor flavour wording may differ), answer status "match" with that exact id. Do not match a different product from the same brand (e.g. Amul Butter is not Amul Kool). Do not guess: if unsure, it is not a match.

CATALOGUE:
${list || '(empty)'}

STEP 3 — SCORE NEW PRODUCTS. If the product is identifiable but not in the catalogue, answer status "new" and score it with Kandor's published methodology. Every sub-score is 0–100 (higher is better), judged for the Indian market:
ECO
- packaging: material, recyclability, single-use vs reusable. Glass and paper score highest; multilayer plastic lowest.
- sourcing: local vs imported, distance from farm to shelf; Indian-grown scores higher.
- carbon: estimated carbon per kg from supply chain and processing.
- ethics: labour practices, certifications, controversy history of the brand/parent company.
HEALTH (for non-food products, judge the formula's safety for skin/body instead of nutrition)
- ingredients: additives, preservatives, artificial colours, flagged against FSSAI and WHO guidance.
- nutrition: sugar, sodium, saturated fat, fibre, protein per 100 g / 100 ml.
- processing: NOVA level — minimally processed scores high, ultra-processed low.
VALUE
- price_per_unit: typical Indian retail price per 100 g/ml vs the category average.
- score_per_rupee: health and eco benefit per rupee.
- availability: widely available in local Indian shops scores higher than online-only.
Grade guide: 75–100 good, 50–74 mixed, below 50 significant concerns. Be honest and consistent: sugary drinks, ultra-processed snacks and multilayer plastic packs should land low on the relevant parts.

Also give: 3–4 short "thread" notes (what connects this product to bigger systems: sourcing, labour, packaging, health), the main ingredients as printed or typical for this product, a few eco details, and a typical Indian MRP with pack size (e.g. "₹20/52g"). Keep every text short and plain. Never invent certifications you cannot see or reasonably know.`;
}

const sub = (keys) => ({ type: 'OBJECT', properties: Object.fromEntries(keys.map(k => [k, { type: 'INTEGER' }])), required: keys });
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    status: { type: 'STRING', enum: ['match', 'new', 'none'] },
    match_id: { type: 'STRING' },
    confidence: { type: 'NUMBER' },
    seen: { type: 'STRING', description: 'What the photo shows, e.g. "Lay\'s Classic Salted 52 g packet"' },
    reason: { type: 'STRING' },
    product: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING' }, brand: { type: 'STRING' },
        category: { type: 'STRING', enum: CATS }, price: { type: 'STRING' },
      },
    },
    eco: sub(['packaging', 'sourcing', 'carbon', 'ethics']),
    health: sub(['ingredients', 'nutrition', 'processing']),
    value: sub(['price_per_unit', 'score_per_rupee', 'availability']),
    notes: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { icon: { type: 'STRING', enum: ICONS }, text: { type: 'STRING' }, detail: { type: 'STRING' }, verdict: { type: 'STRING', enum: VERDICTS } }, required: ['text', 'verdict'] },
    },
    ingredients: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, verdict: { type: 'STRING', enum: VERDICTS }, label: { type: 'STRING' } }, required: ['name', 'verdict'] },
    },
    details: { type: 'ARRAY', items: { type: 'OBJECT', properties: { label: { type: 'STRING' }, value: { type: 'STRING' } }, required: ['label', 'value'] } },
  },
  required: ['status', 'confidence'],
};

/* ---------- never trust model output blindly ---------- */
function clean(o, ids) {
  const s = v => String(v ?? '').slice(0, 160);
  const n = v => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
  const conf = Math.max(0, Math.min(1, Number(o.confidence) || 0));
  if (o.status === 'match' && ids.has(String(o.match_id))) return { status: 'match', id: String(o.match_id), confidence: conf, seen: s(o.seen) };
  if (o.status === 'none' || !o.product || !o.product.name) return { status: 'none', reason: s(o.reason || 'No product recognised') };
  const pick = (obj, keys) => (obj && typeof obj === 'object' ? Object.fromEntries(keys.map(k => [k, n(obj[k])])) : null);
  return {
    status: 'new',
    confidence: conf,
    seen: s(o.seen),
    product: {
      name: s(o.product.name), brand: s(o.product.brand || 'Unknown brand'),
      category: CATS.includes(o.product.category) ? o.product.category : 'other', price: s(o.product.price),
    },
    scores: {
      eco: pick(o.eco, ['packaging', 'sourcing', 'carbon', 'ethics']),
      health: pick(o.health, ['ingredients', 'nutrition', 'processing']),
      value: pick(o.value, ['price_per_unit', 'score_per_rupee', 'availability']),
    },
    notes: (o.notes || []).slice(0, 4).map(x => ({ icon: ICONS.includes(x.icon) ? x.icon : 'leaf', text: s(x.text), detail: s(x.detail), verdict: VERDICTS.includes(x.verdict) ? x.verdict : 'check' })),
    ingredients: (o.ingredients || []).slice(0, 15).map(x => ({ name: s(x.name), verdict: VERDICTS.includes(x.verdict) ? x.verdict : 'check', label: s(x.label || '') })),
    details: (o.details || []).slice(0, 6).map(x => ({ label: s(x.label), value: s(x.value) })),
  };
}

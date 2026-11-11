// SAMO-tour qidiruv adapteri: Toshkent IDsi, mamlakatlar ro'yxati va narxlarni olish.
import { COUNTRY_ALIASES } from "./operators.mjs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const META_TTL = 6 * 3600 * 1000;
const meta = new Map(); // key -> { at, data }

const decode = (s) => s
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;|&#39;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const text = (h) => decode(h.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
export const normCountry = (s) => { const k = s.toLowerCase().replace(/\s+/g, " ").trim(); return COUNTRY_ALIASES[k] || k; };

export async function get(url, timeoutMs = 25000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ru,uz;q=0.8" }, signal: ctl.signal });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.text();
  } finally { clearTimeout(t); }
}

function selectOptions(html, name) {
  const m = html.match(new RegExp(`<select[^>]*name="${name}"[^>]*>([\\s\\S]*?)</select>`));
  if (!m) return null;
  return [...m[1].matchAll(/<option[^>]*value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/g)].map(x => ({ v: x[1], t: text(x[2]) }));
}

// Operator uchun: Toshkent IDsi, mamlakatlar {nom -> id}, USD valyuta kodi
export async function getMeta(op) {
  const c = meta.get(op.key);
  if (c && Date.now() - c.at < META_TTL) return c.data;
  let data;
  try {
    const h1 = await get(op.base + "/search_tour");
    const towns = selectOptions(h1, "TOWNFROMINC");
    const tas = towns && towns.find(o => /Ташкент|Tashkent|Toshkent/i.test(o.t));
    if (!tas) throw new Error("Toshkent topilmadi");
    const h2 = await get(op.base + "/search_tour?TOWNFROMINC=" + tas.v);
    const states = selectOptions(h2, "STATEINC") || [];
    const cur = selectOptions(h2, "CURRENCY") || [];
    const usd = cur.find(o => o.t === "USD");
    data = { tas: tas.v, currency: usd ? usd.v : (cur[0] && cur[0].v), states: Object.fromEntries(states.map(s => [normCountry(s.t), s.v])) };
  } catch (e) {
    if (!op.fallback) throw e;
    const f = op.fallback;
    data = { tas: f.tas, currency: f.currency, states: Object.fromEntries(Object.entries(f.states).map(([id, n]) => [normCountry(n), id])) };
  }
  meta.set(op.key, { at: Date.now(), data });
  return data;
}

const MEAL = [[/ultra|UAI/i, "UAI"], [/\bAI\b|all incl|все включ/i, "AI"], [/\bFB\b|полный|full board/i, "FB"], [/\bHB\b|полупанс|half board/i, "HB"], [/\bBB\b|\bABF\b|завтрак|breakfast/i, "BB"], [/\bRO\b|без питания|room only/i, "RO"]];
const mealCode = (s) => { for (const [re, c] of MEAL) if (re.test(s)) return c; return s.slice(0, 20); };

// "Hotel Name 4* (Dubai (Deira))" -> ["Hotel Name 4*", "Dubai (Deira)"]
function splitRegion(s) {
  s = s.trim();
  if (!s.endsWith(")")) return [s, ""];
  let depth = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] === ")") depth++;
    else if (s[i] === "(" && --depth === 0) return [s.slice(0, i).trim(), s.slice(i + 1, -1).trim()];
  }
  return [s, ""];
}

function parseRows(js, op) {
  // Javascript javobi ichidagi eng uzun satr — natijalar jadvalining HTMLi
  let best = "";
  for (let i = js.indexOf('"'); i !== -1 && i < js.length; ) {
    let j = i + 1;
    while (j < js.length && js[j] !== '"') j += js[j] === "\\" ? 2 : 1;
    if (j - i - 1 > best.length) best = js.slice(i + 1, j);
    i = js.indexOf('"', j + 1);
  }
  if (best.length < 1000) return [];
  let html;
  try { html = JSON.parse('"' + best + '"'); } catch { return []; }
  const out = [];
  for (const m of html.matchAll(/<tr([^>]*price_info[^>]*)>([\s\S]*?)<\/tr>/g)) {
    const attrs = m[1], body = m[2];
    const tds = [...body.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)].map(x => ({ cls: x[1], html: x[2], txt: text(x[2]) }));
    const by = (re) => tds.find(t => re.test(t.cls));
    const sortie = by(/sortie/), tour = by(/class="tour/), hotel = by(/link-hotel/), price = by(/td_price/);
    if (!sortie || !hotel || !price) continue;
    const iHotel = tds.indexOf(hotel);
    // mehmonxonadan keyin: joylar(nw), ovqat, xona
    const rest = tds.slice(iHotel + 1).filter(t => !/nw|attributes|statistic|td_price/.test(t.cls) || /^$/.test(t.cls));
    const meal = rest[0] ? rest[0].txt : "";
    const room = rest[1] ? rest[1].txt : "";
    const pm = price.txt.match(/([\d\s.,]+)\s*([A-Z]{3}|сум|USD|EUR)/);
    if (!pm) continue;
    const amount = Math.round(parseFloat(pm[1].replace(/\s/g, "").replace(",", ".")));
    const d = (sortie.txt.match(/\d{2}\.\d{2}\.\d{4}/) || [""])[0];
    const time = (sortie.txt.match(/\d{1,2}:\d{2}/) || [""])[0];
    const [hotelName, region] = splitRegion(hotel.txt);
    const stars = (hotelName.match(/(\d)\s*\*/) || [])[1] || ((hotelName.match(/\*+/) || [""])[0].length || "");
    const nightsTd = tds[tds.indexOf(tour) + 1];
    out.push({
      op: op.key, opName: op.name,
      date: d, time: time || "", nights: nightsTd ? nightsTd.txt : (attrs.match(/nights-(\d+)/) || [])[1],
      tour: tour ? tour.txt : "", hotel: hotelName, region, stars: stars ? +stars : null,
      meal: mealCode(meal), mealText: meal, room,
      price: amount, currency: pm[2] === "сум" ? "UZS" : pm[2],
      code: text(by(/type_price/)?.html || ""),
      claim: (attrs.match(/data-cat-claim="([^"]+)"/) || [])[1] || "",
      sf: (attrs.match(/data-statefrom="(\d+)"/) || [])[1] || "", st: (attrs.match(/data-state="(\d+)"/) || [])[1] || "", tf: (attrs.match(/data-townfrom="(\d+)"/) || [])[1] || "",
      // Fun&Sun mehmonxona sahifasiga havola beradi (rasmlar o'sha yerda)
      hid: (hotel.html.match(/fstravel\.com\\?\/hotel\\?\/(\d+)/) || [])[1] || "",
      seats: /hotel_availability_N/.test(body) ? "yo'q" : /hotel_availability_Y/.test(body) ? "bor" : "so'rov bo'yicha"
    });
  }
  return out;
}

const ymd = (iso) => iso.replace(/-/g, "");

// q: { country, dateFrom, dateTo, nightsMin, nightsMax, adults, kids, kidAges[] }
export async function searchOperator(op, q) {
  const t0 = Date.now();
  const m = await getMeta(op);
  const stateId = m.states[normCountry(q.country)];
  if (!stateId) return { op: op.key, name: op.name, status: "yo'nalish yo'q", results: [], ms: Date.now() - t0 };
  const p = new URLSearchParams({
    samo_action: "PRICES", TOWNFROMINC: m.tas, STATEINC: stateId,
    CHECKIN_BEG: ymd(q.dateFrom), CHECKIN_END: ymd(q.dateTo),
    NIGHTS_FROM: q.nightsMin, NIGHTS_TILL: q.nightsMax,
    ADULT: q.adults, CHILD: q.kids || 0, CURRENCY: m.currency || "2",
    TOWNS_ANY: 1, STARS_ANY: 1, HOTELS_ANY: 1, MEALS_ANY: 1, ROOMS_ANY: 1, FILTER: 1, PRICEPAGE: q.page || 1
  });
  (q.kidAges || []).slice(0, q.kids || 0).forEach((a, i) => p.set("AGE" + (i + 1), a));
  const js = await get(op.base + "/search_tour?" + p.toString(), q.timeoutMs || 30000);
  const results = parseRows(js, op);
  return { op: op.key, name: op.name, status: results.length ? "ok" : "natija yo'q", results, ms: Date.now() - t0 };
}

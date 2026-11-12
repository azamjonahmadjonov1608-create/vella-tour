// Turlar bo'yicha erkin savollarga javob — ma'lumot faqat operatorlar saytlaridan:
//  • mehmonxona haqida (plyaj, basseyn, joylashuv, xona, bolalar, ovqat, xizmatlar) — Fun&Sun katalogidagi tavsif
//  • davlat bo'yicha narxlar (eng arzon, yulduz bo'yicha, operatorlar) — operatorlardan har kuni yig'iladigan narxlar (packages.json)
//  • oxirgi qidiruvdagi tur: reys, bagaj, transfer, sug'urta — operator paket tarkibi (CONTENT/STATS)
// Turga aloqasi yo'q savollarga javob berilmaydi.
import fs from "node:fs";
import { hotelInfo } from "./hotelinfo.mjs";
import { tripPhotos } from "./tripphotos.mjs";
import { OPERATORS, COUNTRY_UZ } from "./operators.mjs";
import { tourDetails, detailsLines } from "./details.mjs";
import { countrySearchUrl } from "./oplinks.mjs";

const PAGES = process.env.PAGES_URL || "https://azamjonahmadjonov1608-create.github.io/vella-tour";
const money = (n) => "$" + Math.round(n).toLocaleString("en-US").replace(/,/g, " ");
const MON = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const dUz = (iso) => { const [y, m, d] = iso.split("-"); return `${+d} ${MON[+m - 1]}`; };
const MEAL = { RO: "ovqatsiz", BB: "nonushta", HB: "nonushta+kechki", FB: "3 mahal", AI: "hammasi kiritilgan", UAI: "ultra AI" };

// ---- operatorlardan yig'ilgan narxlar (har kuni yangilanadi) ----
let PK = null, PKat = 0;
export async function packages() {
  if (PK && Date.now() - PKat < 3600e3) return PK;
  try {
    const r = await fetch(PAGES + "/packages.json", { signal: AbortSignal.timeout(20000) });
    if (r.ok) { PK = await r.json(); PKat = Date.now(); return PK; }
  } catch {}
  if (!PK) try { PK = JSON.parse(fs.readFileSync(new URL("../public/packages.json", import.meta.url), "utf8")); PKat = Date.now() - 3000e3; } catch {}
  return PK;
}
// snapshot.mjs dagi tartib: V1, V2… = faol operatorlar ro'yxatidagi o'rni
const opInfo = (src) => { const ops = OPERATORS.filter(o => !o.disabled); const i = parseInt(String(src).slice(1)) - 1; return ops[i] || { key: "", name: src }; };
const opName = (src) => opInfo(src).name;
const addDays = (iso, n) => new Date(Date.parse(iso) + n * 864e5).toISOString().slice(0, 10);
// operatorlar bo'yicha guruhlash: [{src, rows}] eng arzonidan boshlab
const byOp = (rows) => { const m = new Map(); for (const p of rows) (m.get(p.src) || m.set(p.src, []).get(p.src)).push(p); return [...m].map(([src, r]) => ({ src, rows: r.sort((a, b) => a.p - b.p) })).sort((a, b) => a.rows[0].p - b.rows[0].p); };

// ---- mehmonxona nomini savoldan topish ----
const GEN = new Set(["hotel", "hotels", "resort", "resorts", "spa", "beach", "the", "and", "otel", "отель", "club", "suites", "suite", "inn", "apartments", "villa", "villas", "boutique", "deluxe", "premium", "plaza", "city", "garden", "park", "palace", "grand", "royal", "international", "bay", "sea", "view", "family", "collection", "house", "mehmonxona", "mehmonxonasi"]);
const toks = (s) => String(s || "").toLowerCase().replace(/\d\s*\*+|\*+/g, " ").replace(/\([^)]*\)/g, " ").split(/[^a-zа-яё0-9']+/i).filter(w => w.length >= 3 && !GEN.has(w) && !/^\d+$/.test(w));

// shahar/hudud nomlari — yolg'iz o'zi mehmonxonani aniqlamaydi ("Sharjah" ≠ "Sharjah Palace")
const GEO = new Set("dubai sharjah ajman abu dhabi fujairah ras khaimah doha antalya kemer alanya side belek istanbul sharm sheikh hurghada makadi phu quoc nha trang cam ranh danang nang sanya guangzhou beijing shanghai baku tbilisi batumi kuala lumpur langkawi penang bali phuket patong pattaya bangkok male maldives colombo muscat salalah jeddah riyadh madinah makkah medina airport center centre downtown marina jbr deira bur jumeirah palm kuta ubud nusa dua seminyak legian sanur jimbaran tashkent samarkand cairo giza luxor kazan moscow almaty".split(" "));

const TR = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya" };
const lat = (s) => String(s || "").toLowerCase().split("").map(ch => TR[ch] ?? ch).join("");

export function findHotel(text, cands) {
  const tw = new Set(String(text).toLowerCase().split(/[^a-zа-яё0-9']+/i).filter(Boolean));
  const qGeo = [...tw].filter(w => GEO.has(w));
  const df = new Map();
  for (const c of cands) for (const w of new Set(toks(c.name))) df.set(w, (df.get(w) || 0) + 1);
  let best = [];
  for (const c of cands) {
    const ct = [...new Set(toks(c.name))];
    const core = ct.filter(w => !GEO.has(w)); // nomning o'ziga xos qismi
    if (!core.length) continue;
    const hitCore = core.filter(w => tw.has(w));
    if (!hitCore.length) continue;
    const hitAll = ct.filter(w => tw.has(w)).length;
    const score = hitCore.length / core.length;
    const rare = hitCore.some(w => w.length >= 4 && (df.get(w) || 0) <= 6);
    if (!(score >= 0.5 && (rare || hitCore.length >= 2))) continue;
    // savolda shahar aytilgan bo'lsa — mehmonxona o'sha shaharda bo'lishi kerak
    if (qGeo.length) { const rl = lat(c.region).replace(/[^a-z]/g, ""); if (!qGeo.every(g => ct.includes(g) || rl.includes(g.slice(0, 4)))) continue; }
    best.push({ c, s: hitAll + score });
  }
  best.sort((a, b) => b.s - a.s || (a.c.price || 1e9) - (b.c.price || 1e9));
  if (!best.length) return null;
  const top = best[0].s;
  return { hotel: best[0].c, others: best.filter(x => x.s >= top - 0.01 && x.c !== best[0].c).slice(0, 4).map(x => x.c) };
}

// Mehmonxona nomzodlari: oxirgi qidiruv + operatorlardan yig'ilgan narxlar
export async function hotelCands(last) {
  const out = new Map();
  const add = (c) => { const k = toks(c.name).join(" "); if (!k) return; const o = out.get(k); if (!o || (!o.hid && c.hid) || (c.price && (!o.price || c.price < o.price))) out.set(k, { ...o, ...c, hid: c.hid || (o && o.hid) || "" }); };
  for (const b of (last && last.blocks) || []) for (const h of [...b.hotels, ...(b.more || [])]) add({ name: h.best.hotel, region: h.best.region, hid: h.hid || "", h, b });
  const pk = await packages();
  for (const p of (pk && pk.pkgs) || []) add({ name: p.h, region: p.rg, hid: p.ph || "", country: p.c, stars: p.s, price: p.p });
  return [...out.values()];
}

// ---- savol mavzusi (mehmonxona bo'yicha) ----
const ASPECTS = [
  { re: /plyaj|dengiz|qum|qirg'oq|пляж|мор[ея]|линия/i, label: "🏖 Plyaj va dengiz", keys: ["Расстояние до моря", "Описание пляжа"] },
  { re: /basseyn|akvapark|tepalik|горк|бассейн|аквапарк/i, label: "🏊 Basseyn", keys: ["Бассейны и водные развлечения"] },
  { re: /qayer|joylash|aeroport|markaz|uzoq|yaqin|где|аэропорт|центр|metro/i, label: "📍 Joylashuv", keys: ["Где находится"] },
  { re: /(^|[^a-z'])xona|nomer|номер|konditsioner|seyf|balkon|qavat/i, label: "🛏 Xonalar", keys: ["В номере", "Номерной фонд"] },
  { re: /bola|детск|дет[иея]|chaqaloq|aniмат|animat/i, label: "👶 Bolalar uchun", keys: ["Для детей"] },
  { re: /ovqat|restoran|nonushta|kechki|tushlik|bar\b|питан|ресторан|halol|halal/i, label: "🍽 Ovqat va restoranlar", keys: ["Типы питания", "Рестораны и бары"] },
  { re: /wi-?fi|internet|spa|sauna|fitnes|sport|zal|xizmat|услуг|тренаж|massaj/i, label: "🛎 Xizmatlar", keys: ["Удобства и услуги", "Услуги Спа", "Развлечения и спорт"] },
  { re: /kirish|chiqish|check|заезд|выезд|soat\s*nechada/i, label: "🕑 Kirish/chiqish vaqti", keys: ["Время заезда/выезда"] },
  { re: /alkogol|spirt|depozit|депозит|алкогол/i, label: "ℹ️ Qo'shimcha", keys: ["Дополнительная информация", "Депозит"] }
];
const FLIGHT = /bagaj|багаж|reys|рейс|aviakompaniya|samolyot|uchish|uchadi|qaytish|vaqt|transfer|трансфер|sug'?urta|страхов|qo'l\s*yuk/i;

const clean = (s) => String(s).replace(/​/g, "").replace(/&ndash;/g, "–").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

async function hotelAnswer(text, m, pk) {
  const c = m.hotel;
  const info = c.hid ? await hotelInfo(c.hid) : { facts: {}, photos: [], uz: "" };
  const f = info.facts || {};
  const tq = String(text).replace(/mehmonxona\S*|меҳмонхона\S*/gi, " ");
  const asp = ASPECTS.filter(a => a.re.test(tq));
  const L = [`🏨 ${c.name}${c.region ? " — " + c.region : ""}${c.country ? ", " + (COUNTRY_UZ[c.country] || c.country) : ""}`];
  if (info.uz) L.push("ℹ️ " + info.uz);
  const keys = asp.length ? asp.flatMap(a => a.keys) : ["Краткое описание", "Где находится", "Расстояние до моря", "Описание пляжа", "Типы питания", "Время заезда/выезда"];
  const got = keys.filter(k => f[k]);
  if (got.length) {
    L.push("", "📋 Operator (Fun&Sun) saytidagi tavsif:");
    for (const k of got) L.push(`• ${k}: ${cut(clean(f[k]), asp.length ? 600 : 300)}`);
  } else if (Object.keys(f).length) {
    L.push("", `📋 Operator saytida «${asp.map(a => a.label).join(", ")}» bo'yicha ma'lumot yo'q.`);
  } else {
    L.push("", "📋 Operatorlar saytida bu mehmonxonaning tavsifi yo'q — faqat narxlari bor.");
  }
  // shu mehmonxona narxlari — har bir operator alohida bo'lim
  const key = toks(c.name).join(" ");
  const rows = ((pk && pk.pkgs) || []).filter(p => toks(p.h).join(" ") === key);
  const sections = [];
  if (rows.length) {
    L.push("", `💵 ${byOp(rows).length} ta operatorda narx bor (2 katta, ${pk.at ? new Date(pk.at).toLocaleDateString("ru-RU") : ""} ma'lumoti) — pastda har biri alohida.`);
    for (const [i, g] of byOp(rows).entries()) {
      const o = opInfo(g.src), p0 = g.rows[0];
      sections.push({ op: o.name, url: await countrySearchUrl(o.key, { country: p0.c, from: p0.d, to: p0.d, n1: p0.n }),
        text: [`${i + 1}. 🏢 ${o.name} — ${c.name}`, ...g.rows.slice(0, 4).map(p => `• ${dUz(p.d)}, ${p.n} kecha, ${MEAL[p.m] || p.m}, ${p.rm} — ${money(p.p)}`)].join("\n") });
    }
  } else if (c.h) {
    const r = c.h.best; L.push("", `💵 Oxirgi qidiruvda: ${r.d ? r.d + ", " : ""}${r.n} kecha, ${MEAL[r.meal] || r.meal} — ${money(r.price)} (${c.b.opName})`);
  }
  if (m.others.length) L.push("", "🔎 Shu nomga o'xshash: " + m.others.map(o => o.name).join("; ") + ". Aniqroq yozing.");
  let photos = info.photos || [];
  if (!photos.length) photos = (await tripPhotos(c.name, 6, c.region).catch(() => ({ photos: [] }))).photos;
  return { text: L.join("\n"), photos: photos.slice(0, 6), caption: c.name, sections };
}

async function flightAnswer(text, last, m) {
  const list = [];
  if (m && m.hotel.h) list.push({ h: m.hotel.h, b: m.hotel.b });
  else for (const b of last.blocks.slice(0, 4)) if (b.hotels[0]) list.push({ h: b.hotels[0], b });
  const L = ["✈️ Oxirgi qidiruvdagi turlar — operator paket tarkibi:"];
  for (const { h, b } of list.slice(0, 4)) {
    const r = h.best;
    let d = h.det;
    if (!d) d = await tourDetails({ opKey: r.op, claim: r.claim, sf: r.sf, st: r.st, tf: r.tf }).catch(() => null);
    h.det = d;
    L.push("", `🏨 ${r.hotel} — ${b.opName}`);
    const lines = detailsLines(d, { manager: true });
    L.push(...(lines.length ? lines : ["(operator tafsilot bermadi)"]));
  }
  return { text: L.join("\n") };
}

async function countryAnswer(q, pk) {
  const all = ((pk && pk.pkgs) || []).filter(p => p.c === q.country);
  const name = COUNTRY_UZ[q.country] || q.country;
  if (!all.length) return { text: `🌍 ${name}: operatorlardan yig'ilgan narxlar orasida bu yo'nalish yo'q. Jonli qidiruvni bosing — hozir barcha operatorlardan tekshiraman.`, live: true };
  let rows = all;
  const g = q.given || {};
  if (g.date) rows = rows.filter(p => p.d >= q.from && p.d <= q.to);
  if (g.nights) rows = rows.filter(p => p.n >= q.n1 && p.n <= q.n2);
  if (g.stars && q.stars) rows = rows.filter(p => p.s >= q.stars);
  if (g.meal && q.meal) rows = rows.filter(p => p.m === q.meal || (q.meal === "AI" && p.m === "UAI"));
  const at = pk.at ? new Date(pk.at) : null;
  const L = [`🌍 ${name} — operatorlar saytlaridan yig'ilgan narxlar (2 katta uchun${at ? ", " + at.toLocaleDateString("ru-RU") + " holatiga" : ""}):`];
  if (!rows.length) { L.push("Shu shartlarga mos tur bu ro'yxatda yo'q. Jonli qidiruvda tekshirib ko'ring."); return { text: L.join("\n"), live: true }; }
  rows.sort((a, b) => a.p - b.p);
  const days = [...new Set(rows.map(p => p.d))].sort();
  const nights = [...new Set(rows.map(p => p.n))].sort((a, b) => a - b);
  L.push(`📦 ${rows.length} ta variant · uchish ${dUz(days[0])} – ${dUz(days[days.length - 1])} · ${nights.join(", ")} kecha`);
  L.push(`💵 Eng arzoni: ${money(rows[0].p)} (1 kishiga ${money(rows[0].pp)}) — ${rows[0].h}, ${dUz(rows[0].d)}, ${rows[0].n} kecha, ${MEAL[rows[0].m] || rows[0].m} · ${opName(rows[0].src)}`);
  const byS = [3, 4, 5].map(s => { const r = rows.find(p => p.s === s); return r && `${s}★ ${money(r.p)}`; }).filter(Boolean);
  if (byS.length) L.push("⭐ Yulduz bo'yicha eng arzon: " + byS.join(" · "));
  const groups = byOp(rows);
  L.push(`🏢 ${groups.length} ta operator — pastda har biri alohida bo'lim (operator saytiga tugma bilan).`);
  L.push("", "ℹ️ Narxlar operatorlar saytidan har kuni yig'iladi. Hozirgi aniq narx va joylar uchun «🔎 Jonli qidiruv»ni bosing.");
  const sections = [];
  for (const [i, gr] of groups.entries()) {
    const o = opInfo(gr.src), p0 = gr.rows[0];
    const seen = new Set(), top = [];
    for (const p of gr.rows) { if (seen.has(p.h)) continue; seen.add(p.h); top.push(p); if (top.length === 3) break; }
    sections.push({ op: o.name,
      url: await countrySearchUrl(o.key, { country: q.country, from: g.date ? q.from : p0.d, to: g.date ? q.to : addDays(p0.d, 6), n1: g.nights ? q.n1 : p0.n, n2: g.nights ? q.n2 : p0.n }),
      text: [`${i + 1}. 🏢 ${o.name}`, `📦 ${gr.rows.length} ta variant · ${money(p0.p)} dan`, ...top.map(p => `• ${p.h} — ${money(p.p)} · ${dUz(p.d)}, ${p.n} kecha, ${MEAL[p.m] || p.m}`)].join("\n") });
  }
  return { text: L.join("\n"), live: true, sections };
}

// Yo'nalishlar bo'yicha eng arzon narxlar ("dekabrda qayerga borsa bo'ladi?")
async function allCountries(q, pk) {
  let rows = (pk && pk.pkgs) || [];
  const g = q.given || {};
  if (g.date) rows = rows.filter(p => p.d >= q.from && p.d <= q.to);
  if (g.nights) rows = rows.filter(p => p.n >= q.n1 && p.n <= q.n2);
  if (g.stars && q.stars) rows = rows.filter(p => p.s >= q.stars);
  const by = new Map();
  for (const p of rows) { const o = by.get(p.c); if (!o || p.p < o.p) by.set(p.c, p); }
  if (!by.size) return { text: "Shu davr uchun operatorlar narxlari ro'yxatida tur topilmadi." };
  const at = pk.at ? new Date(pk.at).toLocaleDateString("ru-RU") : "";
  const L = [`🌍 Yo'nalishlar — eng arzon tur (2 katta${g.date ? ", " + dUz(q.from) + " – " + dUz(q.to) : ""}, operatorlar saytlaridan, ${at} holatiga):`];
  for (const p of [...by.values()].sort((a, b) => a.p - b.p)) L.push(`• ${COUNTRY_UZ[p.c] || p.c} — ${money(p.p)} dan · ${p.h}, ${dUz(p.d)}, ${p.n} kecha · ${opName(p.src)}`);
  L.push("", "Davlatni yozsangiz batafsil ko'rsataman: «Misrga dekabrda tur qancha?»");
  return { text: L.join("\n") };
}

async function operatorsAnswer(q, pk) {
  const rows = ((pk && pk.pkgs) || []).filter(p => !q.country || p.c === q.country);
  const by = new Map();
  for (const p of rows) { const o = by.get(p.src) || { n: 0, min: 1e9, cs: new Set() }; o.n++; o.min = Math.min(o.min, p.p); o.cs.add(p.c); by.set(p.src, o); }
  if (!by.size) return { text: "🏢 Bu yo'nalish bo'yicha operator ma'lumoti yo'q — jonli qidiruvda tekshiring.", live: !!q.country };
  const head = q.country ? `🏢 ${COUNTRY_UZ[q.country] || q.country} bo'yicha tur beradigan operatorlar (${by.size} ta, saytlaridan):` : `🏢 Hamkor operatorlar (${by.size} ta) va yo'nalishlari (saytlaridan):`;
  const sections = [];
  for (const [i, [s0, o]] of [...by].sort((a, b) => a[1].min - b[1].min).entries()) {
    const op = opInfo(s0);
    sections.push({ op: op.name, url: q.country ? await countrySearchUrl(op.key, { country: q.country }) : (OPERATORS.find(x => x.key === op.key) || {}).base + "/search_tour",
      text: q.country ? `${i + 1}. 🏢 ${op.name} — ${o.n} ta variant, ${money(o.min)} dan` : `${i + 1}. 🏢 ${op.name} — ${[...o.cs].map(c => COUNTRY_UZ[c] || c).join(", ")}` });
  }
  return { text: head, live: !!q.country, sections };
}

// nom bo'lmagan oddiy so'zlar (davlatlar, savol so'zlari, umumiy so'zlar)
const COMMON = /^(turkiya|dubay|baa|misr|vyetnam|tailand|malayziya|maldiv|indoneziya|bali|xitoy|gruziya|ozarbayjon|qatar|ummon|shri|lanka|saudiya|hindiston|yaponiya|eng|yaxshi|arzon|qimmat|qaysi|qanaqa|qanday|nima|bormi|kerak|qancha|necha|bilan|uchun|turi|turlar?|davlat|shahar|mehmonxona|otel|hotel|hotels|kecha|kunlik|yulduz|narx|dekabr|yanvar|fevral|noyabr|mart|aprel|bola|bolalar|katta|kishi|oila|yangi|yil|shu|u?larda|dagi|ning|holda|yoki|ham|bor|yoq|yo'q|bo'ladi|borsa|borish|ketsa|ketish|dam|olish|qilsa|bering|ayting)/;
const TOURISH = /qayerga|yo'?nalish|mamlakat|davlat|dam\s*ol|sayohat|yanvar|fevral|mart|aprel|may\b|iyun|iyul|avgust|sentabr|oktabr|noyabr|dekabr|tur\b|turlar|turni|turga|paket|mehmonxona|otel|hotel|reys|aviabilet|chipta|samolyot|viza|bron|narx|qancha|operator|plyaj|dengiz|transfer|ovqat|kecha|sayohat|dam\s*olish|yulduz|bagaj|sug'?urta|pasport|hujjat|xona|basseyn|vaucher|тур|отел|гостиниц|рейс|виза|цена|стоимост/i;
const OPQ = /operator|оператор|firma|kompaniya|kim\s+beradi|qaysi\s+(firma|agent)/i;

// Asosiy kirish: { text, photos?, live? } yoki { offTopic: true } yoki null (tur so'rovi sifatida davom etadi)
export async function tourAnswer(text, q, last) {
  const pk = await packages();
  const cands = await hotelCands(last);
  const m = findHotel(text, cands);
  if (FLIGHT.test(text) && last && last.blocks && last.blocks.length && (!m || m.hotel.h)) return flightAnswer(text, last, m);
  if (m) return hotelAnswer(text, m, pk);
  if (!q.country && /qayerga|yo'?nalish|mamlakat|davlat/i.test(text)) return allCountries(q, pk);
  // mehmonxona xususiyati so'ralgan, nomga o'xshash so'z bor, lekin ro'yxatda yo'q
  const rest = String(text).toLowerCase().split(/[^a-z']+/).filter(w => w.length >= 4 && !COMMON.test(w) && !ASPECTS.some(a => a.re.test(w)));
  if (ASPECTS.some(a => a.re.test(String(text).replace(/mehmonxona\S*/gi, " "))) && rest.length)
    return { text: `🏨 «${rest.join(" ")}» operatorlarning bugungi narxlari ro'yxatida topilmadi (tavsif shu ro'yxatdagi mehmonxonalar uchun olinadi).\nNomini to'liqroq yozing yoki «🔎 Jonli qidiruv» bilan barcha operatorlardan qidiring.`, live: !!q.country };
  if (OPQ.test(text)) return operatorsAnswer(q, pk);
  if (q.country) return countryAnswer(q, pk);
  if (/arzon/i.test(text)) return allCountries(q, pk);
  if (!TOURISH.test(text)) return { offTopic: true };
  return null;
}

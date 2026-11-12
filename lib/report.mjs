// Bot javoblari: davlat bo'yicha umumiy ko'rinish + har bir turoperator uchun alohida blok
// (rasmlar, mehmonxona haqida, reyslar, narxga nima kiradi, ovqat/xona/sana bo'yicha narx farqi, qo'shimcha xizmatlar).
// Telegramdan mustaqil: xabarlar ro'yxatini qaytaradi, bot ularni yuboradi.
import { MEAL_UZ, ddUz, money, cityUz } from "./tur.mjs";
import { normName } from "./photos.mjs";
import { hotelInfo } from "./hotelinfo.mjs";
import { tourDetails } from "./details.mjs";

const STAR = (n) => n ? "★".repeat(n) : "";
const MEAL_ORDER = ["RO", "BB", "HB", "FB", "AI", "UAI"];
const mealName = (m) => MEAL_UZ[m] || m;
const hkey = (r) => normName(r.hotel) + "|" + (r.stars || 0);
const short = (s, n) => (s = String(s || "").replace(/\s+/g, " ").trim()).length > n ? s.slice(0, n - 1) + "…" : s;
const roomName = (s) => String(s || "").replace(/\s*\/\s*(\d+\s*AD.*|\d+\s*ADL.*|\d+Adl.*|DBL|SGL|TRPL?|TWN|DOUBLE|SINGLE)\s*$/i, "").trim() || s;
const ymdUz = (d) => { const [dd, mm] = d.split("."); return `${+dd}.${mm}`; };
const gImages = (r) => "https://www.google.com/search?tbm=isch&q=" + encodeURIComponent(`${r.hotel.replace(/\s*\d\s*\*+\s*$/, "")} ${r.region || ""}`);
// Bir shahar turli operatorlarda lotin/kirill yozilgan: "Phu Quoc" va "Фукуок" -> bitta nom
const CITY_ALIAS = [[/phu ?quoc|fukuok/i, "Fukuok"], [/nha ?trang|nyachang/i, "Nyachang"], [/cam ?ranh|kamran/i, "Kamran"], [/da ?nang|danang/i, "Danang"], [/hanoi|xanoy|ханой/i, "Xanoy"],
  [/dubai|dubay/i, "Dubay"], [/sharjah|sharja|shardj/i, "Sharja"], [/abu ?dhabi|abu-dabi/i, "Abu-Dabi"], [/ras ?al|ras al-xayma/i, "Ras al-Xayma"], [/antal/i, "Antaliya"], [/alany/i, "Alanya"], [/kemer/i, "Kemer"], [/belek/i, "Belek"],
  [/istanbul/i, "Istanbul"], [/sharm/i, "Sharm-ash-Shayx"], [/hurgh?ada|xurgada/i, "Xurgada"], [/phuket|pxuket/i, "Pxuket"], [/pattay/i, "Pattayya"], [/kuala/i, "Kuala-Lumpur"], [/langkaw/i, "Langkavi"], [/batumi/i, "Batumi"], [/tbilisi/i, "Tbilisi"], [/baku|boku/i, "Boku"], [/gabala|qabala/i, "Gabala"], [/bali|nusa|kuta|ubud|seminyak|jimbaran/i, "Bali"]];
const city = (s) => { const c = cityUz(String(s || "").replace(/\s*\(.*\)\s*$/, "").replace(/^(Городские|Пляжные|Загородные)\s+отели\s+/i, "")).trim(); for (const [re, n] of CITY_ALIAS) if (re.test(c)) return n; return c || "—"; };
const minBy = (arr, f) => arr.reduce((a, b) => (a == null || f(b) < f(a) ? b : a), null);

async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch { out[k] = null; } } }));
  return out;
}

// ---------- 1. Umumiy ko'rinish (Bronix uslubida: shaharlar, yulduz, ovqat, operatorlar) ----------
export function overview(res, q) {
  const r = res.so_rov, pre = res.pre || [];
  const head = `🌍 ${r.countryUz} — ${ddUz(r.from)}${r.to !== r.from ? " – " + ddUz(r.to) : ""} uchish, ${r.n1}${r.n2 !== r.n1 ? "–" + r.n2 : ""} kecha, ${r.adults} katta${r.kids ? " + " + r.kids + " bola" : ""}`;
  if (!pre.length) return `${head}\n\nBu sanalarda operatorlarda umuman tur topilmadi. Boshqa sana yoki kechalar sonini sinab ko'ring.`;
  const hotels = new Set(pre.map(hkey)), ops = new Set(pre.map(x => x.opName));
  const L = [head, `Jami: ${pre.length} variant · ${hotels.size} mehmonxona · ${ops.size} operator`, ""];
  // shaharlar
  const byCity = new Map();
  for (const x of pre) { const c = city(x.region); const o = byCity.get(c) || { min: Infinity, h: new Set() }; o.min = Math.min(o.min, x.sale); o.h.add(hkey(x)); byCity.set(c, o); }
  L.push("📍 Shaharlar / kurortlar (jami narx, eng arzon):");
  for (const [c, o] of [...byCity].sort((a, b) => a[1].min - b[1].min).slice(0, 8)) L.push(`   • ${c} — ${money(o.min)} dan (${o.h.size} mehmonxona)`);
  // yulduz
  const byStar = new Map(); for (const x of pre) byStar.set(x.stars || 0, Math.min(byStar.get(x.stars || 0) ?? Infinity, x.sale));
  L.push("", "⭐ Yulduz bo'yicha eng arzon:");
  L.push("   " + [...byStar].filter(([s]) => s).sort((a, b) => a[0] - b[0]).map(([s, p]) => `${s}★ ${money(p)}`).join(" · "));
  // ovqat
  const byMeal = new Map(); for (const x of pre) byMeal.set(x.meal, Math.min(byMeal.get(x.meal) ?? Infinity, x.sale));
  L.push("", "🍽 Ovqat bo'yicha eng arzon:");
  L.push("   " + [...byMeal].sort((a, b) => (MEAL_ORDER.indexOf(a[0]) + 99) % 99 - (MEAL_ORDER.indexOf(b[0]) + 99) % 99).map(([m, p]) => `${mealName(m)} ${money(p)}`).join(" · "));
  // tanlangan yulduz + ovqat kombinatsiyasi
  if (q && (q.stars || q.meal)) {
    const cnt = (res.rows || []).length;
    L.push("", `🎯 Sizning tanlovingiz (${[q.stars && q.stars + "★+", q.meal && mealName(q.meal)].filter(Boolean).join(", ")}): ${cnt ? cnt + " variant, " + money(Math.min(...res.rows.map(x => x.sale))) + " dan" : "topilmadi"}`);
  }
  // aviakompaniyalar
  const air = [...new Set(pre.map(x => x.air).filter(Boolean))];
  if (air.length) L.push("", "✈️ Aviakompaniyalar: " + air.join(", "));
  // operatorlar
  const byOp = new Map(); for (const x of pre) { const o = byOp.get(x.opName) || { n: 0, min: Infinity }; o.n++; o.min = Math.min(o.min, x.sale); byOp.set(x.opName, o); }
  L.push("", "🏢 Operatorlar (eng arzondan):");
  const secOf = (n) => { const s = (res.operatorlar || []).find(x => x.op === n); return s && s.ms ? ` · ⏱ ${Math.round(s.ms / 1000)} s` : ""; };
  for (const [n, o] of [...byOp].sort((a, b) => a[1].min - b[1].min)) L.push(`   • ${n} — ${o.n} variant, ${money(o.min)} dan${secOf(n)}`);
  const none = res.operatorlar.filter(s => !s.n);
  if (none.length) L.push(`   Natija bermadi: ${none.map(s => s.op + (/javob/.test(s.status) ? " (javob bermadi)" : /kechik/.test(s.status) ? " (kechikmoqda ⏳)" : /yo'nalish/.test(s.status) ? " (bu yo'nalish yo'q)" : "")).join(", ")}`);
  return L.join("\n");
}

// ---------- 2. Operator bloklari ----------
// Har bir operator uchun eng arzon `perOp` ta mehmonxona (foydalanuvchi filtri bilan)
export function buildBlocks(res, perOp = 3) {
  const rows = res.rows || [], pre = res.pre || [];
  const ops = new Map();
  for (const r of rows) (ops.get(r.op) || ops.set(r.op, []).get(r.op)).push(r);
  const blocks = [];
  for (const [op, list] of ops) {
    const byH = new Map();
    for (const r of list) (byH.get(hkey(r)) || byH.set(hkey(r), []).get(hkey(r))).push(r);
    const hotels = [...byH.values()].map(v => v.sort((a, b) => a.sale - b.sale)).sort((a, b) => a[0].sale - b[0].sale);
    const all = pre.filter(r => r.op === op);
    blocks.push({
      op, opName: list[0].opName, count: list.length, hotelsCount: byH.size, min: hotels[0][0].sale,
      hotels: hotels.slice(0, perOp).map(v => hotelEntry(v[0], all)),
      more: hotels.slice(perOp).map(v => hotelEntry(v[0], all))
    });
  }
  return blocks.sort((a, b) => a.min - b.min);
}

// Bitta mehmonxona: eng arzon variant + shu operatorda ovqat/xona/sana bo'yicha narxlar
function hotelEntry(best, opRows) {
  const same = opRows.filter(r => hkey(r) === hkey(best));
  const sameTrip = same.filter(r => r.date === best.date && r.n === best.n);
  const meals = new Map(); for (const r of (sameTrip.length ? sameTrip : same)) { const c = meals.get(r.meal); if (!c || r.sale < c.sale) meals.set(r.meal, r); }
  const rooms = new Map(); for (const r of sameTrip.filter(r => r.meal === best.meal)) { const k = roomName(r.room); const c = rooms.get(k); if (!c || r.sale < c.sale) rooms.set(k, r); }
  const dates = new Map(); for (const r of same.filter(r => r.meal === best.meal && r.n === best.n)) { const c = dates.get(r.d); if (!c || r.sale < c.sale) dates.set(r.d, r); }
  const nights = new Map(); for (const r of same.filter(r => r.meal === best.meal && r.date === best.date)) { const c = nights.get(r.n); if (!c || r.sale < c.sale) nights.set(r.n, r); }
  // matritsa (batafsil uchun): xona × ovqat
  const matrix = new Map();
  for (const r of sameTrip) { const k = roomName(r.room); const m = matrix.get(k) || new Map(); if (!m.has(r.meal) || m.get(r.meal) > r.sale) m.set(r.meal, r.sale); matrix.set(k, m); }
  return { best, hid: best.hid || "", meals, rooms, dates, nights, matrix, variants: same.length };
}

// Mehmonxona rasmlari va reys/xizmat tafsilotlari (parallel, cheklangan)
export async function enrich(blocks, { perOp } = {}) {
  const items = blocks.flatMap(b => b.hotels.slice(0, perOp || b.hotels.length));
  await pool(items, 10, async (h) => {
    const r = h.best;
    // tezlik uchun: rasm/tafsilot 8 soniyada kelmasa — ularsiz ko'rsatamiz
    const cap = (p, v) => Promise.race([p.catch(() => v), new Promise(r => setTimeout(() => r(v), 8000))]);
    const [info, det] = await Promise.all([
      h.hid ? cap(hotelInfo(h.hid), { photos: [], uz: "" }) : Promise.resolve({ photos: [], uz: "" }),
      cap(tourDetails({ opKey: r.op, claim: r.claim, sf: r.sf, st: r.st, tf: r.tf }), null)
    ]);
    h.info = info || { photos: [], uz: "" }; h.det = det;
  });
  return blocks;
}

// Reyslar (har yo'nalish uchun tanlangan reys)
function flightLines(d, best, all = false) {
  if (!d) return [];
  const dirs = [];
  for (const f of d.flights) { let g = dirs.find(x => x.date === f.date && x.route === f.route); if (!g) dirs.push(g = { date: f.date, route: f.route, list: [] }); g.list.push(f); }
  const ok = (f) => f.classes.some(c => c.seats === "bor" || c.seats === "kam");
  const L = [];
  dirs.forEach((g, i) => {
    const pick = all ? g.list : [g.list.find(f => ok(f) && f.dep === best.t) || g.list.find(ok) || g.list[0]];
    for (const f of pick) L.push(`${i === 0 ? "🛫 Borish" : "🛬 Qaytish"} ${ymdUz(g.date)}: ${f.airline} ${f.flight} · ${f.dep} ${f.depAp} → ${f.arr} ${f.arrAp} · joy: ${f.classes.map(c => c.seats).join("/")}`);
  });
  if (!dirs.length) for (const [i, x] of d.pack.filter(x => x.type === "freight").entries()) L.push(`${i === 0 ? "🛫 Borish" : "🛬 Qaytish"} ${ymdUz(x.from)}: ${short(x.text.replace(/,\s*(ECONOM|Эконом).*/i, ""), 70)}`);
  const bag = d.flights.map(f => (f.classes[0] || {}).bag).find(Boolean);
  if (bag) L.push(`🧳 ${bag}`);
  return L;
}

function includedLine(d) {
  if (!d) return "✅ Narxga kiradi: aviabilet borish-qaytish, mehmonxona, tanlangan ovqatlanish (transfer va sug'urtani operator tasdiqlaydi)";
  const inc = [];
  if (d.pack.some(x => x.type === "freight") || d.flights.length) inc.push("aviabilet borish-qaytish");
  if (d.pack.some(x => x.type === "hotel")) inc.push("mehmonxona");
  const tr = d.pack.filter(x => x.type === "service" && /трансфер|transfer/i.test(x.text));
  if (tr.length) inc.push("transfer" + (tr.some(x => /group|групп/i.test(x.text)) ? " (guruh)" : tr.some(x => /individ|индивид/i.test(x.text)) ? " (individual)" : ""));
  if (d.pack.some(x => x.type === "insure")) inc.push("tibbiy sug'urta");
  const other = d.pack.filter(x => x.type === "service" && !/трансфер|transfer/i.test(x.text)).map(x => short(x.text, 40));
  return "✅ Narxga kiradi: " + [...inc, ...other].join(", ");
}

const EX_UZ = [[/индивидуальн.*трансфер|individual.*transfer/i, "Individual transfer"], [/трансфер|transfer/i, "Transfer"], [/fast ?track|vip|бизнес.?зал|lounge/i, "Aeroportda VIP / Fast Track"], [/экскурс|excurs/i, "Ekskursiya"], [/страхов|insur/i, "Qo'shimcha sug'urta"], [/связь|sim|esim/i, "Mobil aloqa (SIM)"], [/виз|visa/i, "Viza"], [/багаж|baggage/i, "Qo'shimcha bagaj"], [/питан|ужин|обед|meal/i, "Qo'shimcha ovqat"]];
const exName = (t, g) => { for (const [re, n] of EX_UZ) if (re.test(t) || re.test(g || "")) return n; return short(t, 45); };
function extrasLines(d, max = 5, m = 1) {
  if (!d || !d.extras.length) return [];
  const best = new Map();
  for (const e of d.extras) {
    const v = parseFloat(String(e.price).replace(/\s/g, "").replace(",", ".")); if (!isFinite(v)) continue;
    const name = exName(e.text, e.group), cur = (String(e.price).match(/[A-Z]{3}/) || ["USD"])[0];
    if (!best.has(name) || best.get(name).v > v) best.set(name, { v, cur, text: e.text });
  }
  return [...best].sort((a, b) => a[1].v - b[1].v).slice(0, max).map(([n, x]) => `   • ${n} — +${Math.round(x.v * m)} ${x.cur}`);
}

// Ovqat bo'yicha narx qatori: "Nonushta $1 480 · Hammasi kiritilgan $2 050 (+$570)"
function mealLine(h) {
  const b = h.best;
  const arr = [...h.meals.values()].sort((a, c) => a.sale - c.sale);
  if (arr.length < 2) return `🍽 ${mealName(b.meal)} (boshqa ovqat turi shu operatorda yo'q)`;
  return "🍽 Ovqat tanlovi: " + arr.map(r => `${mealName(r.meal)} ${money(r.sale)}${r.sale !== b.sale ? ` (${r.sale > b.sale ? "+" : "−"}${money(Math.abs(r.sale - b.sale))})` : " ✓"}`).join(" · ");
}

// ---------- Matn: operator bloki ----------
export function operatorText(b, idx, total, pax = "") {
  const L = [`🏢 ${idx + 1}/${total}. ${b.opName}`, `${b.count} variant · ${b.hotelsCount} mehmonxona · ${money(b.min)} dan`, ""];
  b.hotels.forEach((h, i) => {
    const r = h.best;
    L.push(`${i + 1}️⃣ ${r.hotel.replace(/\s*\d\s*\*+\s*$/, "")} ${STAR(r.stars)} — ${city(r.region)}`);
    if (h.info && h.info.uz) L.push("ℹ️ " + h.info.uz);
    L.push(`📅 ${ddUz(r.d)}${r.t ? " " + r.t : ""} · ${r.n}${r.extra ? "+" + r.extra : ""} kecha · 🛏 ${roomName(r.room)}`);
    L.push(...flightLines(h.det, r));
    L.push(includedLine(h.det));
    L.push(mealLine(h));
    if (h.rooms.size > 1) L.push("🛏 Xonalar: " + [...h.rooms].sort((a, c) => a[1].sale - c[1].sale).slice(0, 4).map(([k, x]) => `${short(k, 28)} ${money(x.sale)}`).join(" · "));
    const ex = extrasLines(h.det, 3);
    if (ex.length) L.push("➕ Qo'shimcha (ixtiyoriy):", ...ex);
    L.push(`💰 Asl narx (${b.opName} saytida): ${money(r.price)} — ${pax || "jami"} · joy: ${r.seats}`);
    L.push("");
  });
  if (b.more.length) L.push(`… yana ${b.more.length} ta mehmonxona bor — «Ko'proq» tugmasini bosing.`);
  return L.join("\n").trim();
}

// ---------- Matn: bitta mehmonxona batafsil ----------
export function hotelDetailText(b, h) {
  const r = h.best;
  const L = [`🏨 ${r.hotel.replace(/\s*\d\s*\*+\s*$/, "")} ${STAR(r.stars)} — ${city(r.region)}`, `🏢 Operator: ${b.opName} · ${h.variants} variant`];
  if (h.info && h.info.uz) L.push("ℹ️ " + h.info.uz);
  const f = h.info && h.info.facts || {};
  for (const [k, uz] of [["Где находится", "📍 Joylashuv"], ["Описание пляжа", "🏖 Plyaj"], ["Питание", "🍽 Ovqatlanish"], ["Для детей", "👶 Bolalar uchun"]]) if (f[k]) L.push(`${uz}: ${short(f[k], 220)}`);
  L.push("", "✈️ Reyslar:", ...flightLines(h.det, r, true));
  L.push("", includedLine(h.det));
  if (h.matrix.size) {
    const meals = [...new Set([...h.matrix.values()].flatMap(m => [...m.keys()]))].sort((a, c) => MEAL_ORDER.indexOf(a) - MEAL_ORDER.indexOf(c));
    L.push("", `💵 Narxlar (${ddUz(r.d)}, ${r.n} kecha) — xona × ovqat:`);
    for (const [room, m] of [...h.matrix].sort((a, c) => Math.min(...a[1].values()) - Math.min(...c[1].values())).slice(0, 8))
      L.push(`• ${short(room, 40)}: ` + meals.filter(x => m.has(x)).map(x => `${x} ${money(m.get(x))}`).join(" · "));
    L.push("   (RO ovqatsiz · BB nonushta · HB nonushta+kechki · FB 3 mahal · AI hammasi kiritilgan)");
  }
  if (h.dates.size > 1) L.push("", "📅 Boshqa sanalar (shu xona/ovqat): " + [...h.dates].sort((a, c) => a[0] < c[0] ? -1 : 1).slice(0, 8).map(([d, x]) => `${ddUz(d)} ${money(x.sale)}`).join(" · "));
  if (h.nights.size > 1) L.push("🌙 Boshqa kechalar: " + [...h.nights].sort((a, c) => a[0] - c[0]).map(([n, x]) => `${n} kecha ${money(x.sale)}`).join(" · "));
  const ex = extrasLines(h.det, 12);
  if (ex.length) L.push("", "➕ Qo'shimcha xizmatlar (ixtiyoriy, narxga qo'shiladi):", ...ex);
  const cheaper = [...h.meals.values()].filter(x => x.sale < r.sale);
  L.push("", "💡 Arzonlashtirish: " + (cheaper.length ? cheaper.map(x => `${mealName(x.meal)} bilan ${money(x.sale)}`).join(", ") : "shu tanlov eng arzoni") + ". Paketdagi aviabilet/mehmonxona/transfer birga sotiladi — alohida olib tashlash kerak bo'lsa, operatordan so'raladi.");
  L.push(`💰 Asl narx (${b.opName} saytida): ${money(r.price)} · joy: ${r.seats}`);
  return L.join("\n");
}

// ================= MIJOZGA TAYYOR TAKLIF =================
// Ovqatlanish — mijozga tushunarli: kuniga necha mahal
export const MEAL_CLIENT = {
  RO: "Ovqatsiz (faqat yashash)",
  BB: "Nonushta — kuniga 1 mahal (ertalab, odatda shved stoli)",
  HB: "Yarim pansion — kuniga 2 mahal: nonushta + kechki ovqat",
  FB: "To'liq pansion — kuniga 3 mahal: nonushta, tushlik, kechki ovqat",
  AI: "Hammasi kiritilgan — kuniga 3 mahal ovqat + gazaklar va ichimliklar",
  UAI: "Ultra hammasi kiritilgan — 3 mahal ovqat, gazaklar, ichimliklar (premium ham)"
};
const mealClient = (r) => MEAL_CLIENT[r.meal] || r.mealText || r.meal;
const MON2 = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const dmy = (d) => { const [dd, mm] = d.split("."); return `${+dd} ${MON2[+mm - 1]}`; };
const routeCity = (x) => x === "Ташкент" ? "Toshkent" : city(x);

// Reyslar (mijoz uchun): har yo'nalishda bitta, joyi borini tanlab
function clientFlights(d, best) {
  const L = [];
  if (d && d.flights.length) {
    const dirs = [];
    for (const f of d.flights) { let g = dirs.find(x => x.date === f.date && x.route === f.route); if (!g) dirs.push(g = { date: f.date, route: f.route, list: [] }); g.list.push(f); }
    const ok = (f) => f.classes.some(c => c.seats === "bor" || c.seats === "kam");
    dirs.slice(0, 2).forEach((g, i) => {
      const f = g.list.find(f => ok(f) && f.dep === best.t) || g.list.find(ok) || g.list[0];
      const parts = g.route.split(/\s*(?:->|→)\s*/);
      const from = parts.length === 2 ? routeCity(parts[0]) : (i === 0 ? "Toshkent" : f.depAp), to = parts.length === 2 ? routeCity(parts[1]) : (i === 0 ? f.arrAp : "Toshkent");
      L.push(`   ${i === 0 ? "Borish" : "Qaytish"}: ${dmy(g.date)}, ${f.airline} ${f.flight} · ${f.dep} ${from} → ${f.arr.replace("+1", " (ertasi kuni)")} ${to}`);
    });
  } else if (d) {
    for (const [i, x] of d.pack.filter(x => x.type === "freight").slice(0, 2).entries()) L.push(`   ${i === 0 ? "Borish" : "Qaytish"}: ${dmy(x.from)}`);
  }
  if (!L.length) L.push(`   Uchish: ${ddUz(best.d)}${best.t ? ", " + best.t : ""}${best.air ? " · " + best.air : ""}`);
  return L;
}
const bagOf = (d) => { const b = d && d.flights.map(f => (f.classes[0] || {}).bag).find(Boolean); return b ? b.replace(/^bagaj/, "Bagaj").replace(" qo'l yuki", " + qo'l yuki") : ""; };
function transferOf(d) {
  if (!d) return "";
  const tr = d.pack.filter(x => x.type === "service" && /трансфер|transfer/i.test(x.text));
  if (!tr.length) return "";
  const kind = tr.some(x => /individ|индивид/i.test(x.text)) ? "individual (alohida mashina)" : tr.some(x => /group|групп/i.test(x.text)) ? "guruh (avtobus)" : "";
  const both = tr.length > 1 || tr.some(x => /airport-hotel-airport|аэропорт.*отель.*аэропорт/i.test(x.text));
  return `${both ? "Aeroport → mehmonxona → aeroport" : "Aeroport ↔ mehmonxona"}${kind ? ", " + kind : ""} — narxga kiritilgan`;
}
const nightsBetween2 = (a, b) => { const p = (x) => { const [d, m, y] = x.split("."); return Date.UTC(+y, +m - 1, +d); }; return Math.round((p(b) - p(a)) / 864e5); };

// { caption: rasm ostiga (≤1024 belgi, forward qilganda rasm bilan birga ketadi), text: to'liq ma'lumot }
export function clientOffer(h, so, contact = "", pct = 0) {
  const M = 1 + (+pct || 0) / 100, P = (x) => Math.round(x.price * M);
  const r = h.best, d = h.det, f = (h.info && h.info.facts) || {};
  const name = r.hotel.replace(/\s*\d\s*\*+\s*$/, "").trim(), place = `${city(r.region)}, ${so.countryUz}`;
  const ad = so.adults, kids = so.kids || 0, per = kids ? 0 : Math.round(P(r) / ad);
  const hotelPack = d && d.pack.find(x => x.type === "hotel");
  const stay = hotelPack ? `${dmy(hotelPack.from)} – ${dmy(hotelPack.to)} (${nightsBetween2(hotelPack.from, hotelPack.to)} kecha)` : `${ddUz(r.d)} dan ${r.n}${r.extra ? "+" + r.extra : ""} kecha`;
  const price = per ? `${money(per)} / 1 kishi (jami ${money(P(r))})` : `${money(P(r))} jami`;
  const pax = `${ad} kattalar${kids ? " + " + kids + " bola" : ""}`;
  const transfer = transferOf(d), bag = bagOf(d), insure = d && d.pack.some(x => x.type === "insure");
  const inc = ["aviabilet borish-qaytish", "mehmonxonada yashash", r.meal !== "RO" ? mealName(r.meal).toLowerCase() : "", transfer ? "transfer" : "", insure ? "tibbiy sug'urta" : ""].filter(Boolean);

  const T = [`🏝 ${name} ${STAR(r.stars)}`, `📍 ${place}`];
  if (h.info && h.info.uz) T.push(`ℹ️ ${h.info.uz}`);
  T.push("", `🗓 Yashash: ${stay}`, `👥 ${pax}`, "", "✈️ Aviaparvoz:", ...clientFlights(d, r));
  if (bag) T.push(`🧳 ${bag}`);
  T.push("", `🛏 Xona: ${roomName(r.room)}`, `🍽 Ovqatlanish: ${mealClient(r)}`);
  T.push(`🚐 Transfer: ${transfer || "aniqlashtiriladi (odatda guruh transferi kiritilgan)"}`);
  if (insure) T.push("🛡 Tibbiy sug'urta — kiritilgan");
  T.push("", `✅ Narxga kiradi: ${inc.join(", ")}`);
  const others = [...h.meals.values()].filter(x => x.meal !== r.meal).sort((a, b) => a.price - b.price);
  if (others.length) T.push(`🔁 Boshqa ovqatlanish bilan: ${others.map(x => `${mealName(x.meal)} ${P(x) > P(r) ? "+" : "−"}${money(Math.abs(P(x) - P(r)))}`).join(" · ")}`);
  const ex = extrasLines(d, 4, M);
  if (ex.length) T.push("➕ Xohlasangiz qo'shimcha (alohida to'lanadi):", ...ex);
  T.push("", `💰 Narx: ${price}`, "Narx joy borligiga qarab o'zgarishi mumkin — bron qilishda aniq tasdiqlaymiz.");
  if (contact) T.push("", contact);

  // qisqa — rasm ostiga
  const C = [`🏝 ${name} ${STAR(r.stars)}`, `📍 ${place}`, `🗓 ${stay} · ${pax}`];
  const fl = clientFlights(d, r).map(x => "✈️ " + x.trim());
  C.push(...fl.slice(0, 2));
  if (bag) C.push("🧳 " + bag);
  C.push(`🛏 ${roomName(r.room)}`, `🍽 ${mealClient(r)}`);
  if (transfer) C.push(`🚐 Transfer: ${transfer.replace(" — narxga kiritilgan", "")}`);
  if (insure) C.push("🛡 Sug'urta kiritilgan");
  C.push(`💰 ${price}`);
  if (contact) C.push(contact);
  let caption = C.join("\n");
  if (caption.length > 1020) caption = caption.slice(0, 1015) + "…";
  return { caption, text: T.join("\n") };
}

export const photosOf = (h, n = 6) => (h.info && h.info.photos || []).slice(0, n);
export { gImages };

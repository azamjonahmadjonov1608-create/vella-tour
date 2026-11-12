// Tur paketining to'liq tarkibi (operator saytidagi "Состав пакета" va "Места в транспорте"):
// reyslar (aviakompaniya, reys raqami, vaqtlar, bagaj, joylar), mehmonxona sanalari, transfer, sug'urta, qo'shimcha xizmatlar.
import { OPERATORS } from "./operators.mjs";
import { get } from "./samo.mjs";
import { cityUz } from "./tur.mjs";
const routeUz = (r) => r.split(/\s*(?:->|→)\s*/).map(x => x === "Ташкент" ? "Toshkent" : cityUz(x)).join(" → ");

const dec = (s) => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#8239;/g, " ");
const txt = (h) => dec(String(h).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
function longestString(js) {
  let best = "";
  for (let i = js.indexOf('"'); i !== -1 && i < js.length;) {
    let j = i + 1; while (j < js.length && js[j] !== '"') j += js[j] === "\\" ? 2 : 1;
    if (j - i - 1 > best.length) best = js.slice(i + 1, j);
    i = js.indexOf('"', j + 1);
  }
  try { return JSON.parse('"' + best + '"'); } catch { return best; }
}
const SEAT = { yesplace: "bor", yesnoplace: "kam", noplace: "yo'q", requestplace: "so'rov bo'yicha" };

function parseContent(h) {
  const pack = [], extras = [];
  const main = h.split(/Дополнительные услуги/)[0];
  for (const m of main.matchAll(/<tr class="[^"]*?\b(freight|hotel|insure|service)_\d+[^"]*">\s*<td class="caption">([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>/g)) {
    const [a, b] = txt(m[2]).split(/\s*-\s*/);
    pack.push({ type: m[1], from: a, to: b || a, text: txt(m[3]) });
  }
  const ex = h.split(/Дополнительные услуги/)[1] || "";
  let group = "";
  for (const m of ex.matchAll(/<th[^>]*>([\s\S]*?)<\/th>|<tr[^>]*>\s*<td class="caption">([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td class="price">([\s\S]*?)<\/td>/g)) {
    if (m[1]) group = txt(m[1]); else extras.push({ group, date: txt(m[2]), text: txt(m[3]).replace(/\s*\([^()]*,[^()]*\)\s*$/, ""), price: txt(m[4]) });
  }
  return { pack, extras };
}

function parseFlights(h) {
  const i = h.indexOf('id="freights"'); if (i < 0) return [];
  const part = h.slice(i);
  const out = [];
  const heads = [...part.matchAll(/<thead>\s*<tr>\s*<th[^>]*>([\s\S]*?)<\/th>/g)].map(m => {
    const t = txt(m[1]); const d = (t.match(/\d{2}\.\d{2}\.\d{4}/) || [""])[0];
    let route = t.replace(d, "").replace(/^,?\s*(Пн|Вт|Ср|Чт|Пт|Сб|Вс)(?![а-я])/, "").trim();
    route = route.replace(/^Туда$/i, "borish").replace(/^Обратно$/i, "qaytish");
    return { at: m.index, date: d, route };
  }).filter(h => h.date);
  heads.forEach((hd, k) => {
    const seg = part.slice(hd.at, k + 1 < heads.length ? heads[k + 1].at : undefined);
    for (const f of seg.matchAll(/class="c transportCompanyLogo">([\s\S]*?)<\/td>\s*<td class="width100p">([\s\S]*?)<\/td>\s*<td rowspan="2" class="nw transport">([\s\S]*?)<\/td>\s*<\/tr>\s*<tr>\s*<td>([\s\S]*?)<\/td>/g)) {
      const air = txt(f[1]) || ((f[1].match(/title="([^"]+)"/) || [])[1] || "");
      const fl = txt(f[2]).replace(/\s+/g, " ");
      const fm = fl.match(/^([A-Z0-9]{2}\s?\d+[A-Z]?)\.?\s*(?:\(([^)]*)\))?/);
      const classes = [...f[3].matchAll(/<span class="name\s*([a-z]*)"[^>]*>([^<]+)<\/span>(?:<span class="icon-replace" title="([^"]*)")?/g)]
        .map(c => ({ name: dec(c[2]).trim(), seats: SEAT[c[1]] || "so'rov bo'yicha", bag: (c[3] || "").replace(/\s+/g, " ").replace(/Багаж:\s*/, "bagaj ").replace(/Ручная кладь:\s*/, "qo'l yuki ").replace(/кг/g, " kg").replace(/\s+/g, " ").trim() }));
      const tm = txt(f[4]).match(/(\d{1,2}:\d{2})(\+\d)?\s*([A-Z]{3})\s*-\s*(\d{1,2}:\d{2})(\+\d)?\s*([A-Z]{3})/);
      out.push({ date: hd.date, route: hd.route.replace(/\s*->\s*/, " → "), airline: air.replace(/^UZAIRWAYS$/i, "Uzbekistan Airways"), flight: fm ? fm[1] : fl, aircraft: fm && fm[2] || "",
        dep: tm ? tm[1] : "", depAp: tm ? tm[3] : "", arr: tm ? tm[4] + (tm[5] || "") : "", arrAp: tm ? tm[6] : "", classes });
    }
  });
  return out;
}

const cache = new Map();
// v: natijadagi variant (opKey, claim, sf, st, tf bilan)
export async function tourDetails(v) {
  if (!v || !v.claim) return null;
  const op = OPERATORS.find(o => o.key === v.opKey); if (!op) return null;
  const key = op.key + v.claim;
  if (cache.has(key)) return cache.get(key);
  const p = (async () => {
    const base = { TOWNFROMINC: v.tf, STATEINC: v.st, CATCLAIM: v.claim, STATEFROM: v.sf || "", CURRENCY: "2" };
    const [c, s] = await Promise.all(["CONTENT", "STATS"].map(a => get(op.base + "/search_tour?" + new URLSearchParams({ samo_action: a, ...base }), 25000, op).then(longestString).catch(() => "")));
    const { pack, extras } = parseContent(c);
    return { pack, extras, flights: parseFlights(s) };
  })();
  cache.set(key, p);
  setTimeout(() => cache.delete(key), 30 * 60 * 1000).unref();
  return p;
}

// O'zbekcha qisqa ko'rinish
const ymdUz = (d) => { const [dd, mm] = d.split("."); return `${+dd}.${mm}`; };
const PACK_UZ = (x) => {
  if (x.type === "hotel") return `🏨 Mehmonxona: ${ymdUz(x.from)} – ${ymdUz(x.to)} (${x.text.replace(/<[^>]*>/g, "")})`;
  if (x.type === "insure") return "🛡 Tibbiy sug'urta — narxga kiritilgan";
  if (x.type === "service" && /трансфер|transfer/i.test(x.text)) return `🚐 Transfer${/group|групп/i.test(x.text) ? " (guruh)" : /individ|индивид/i.test(x.text) ? " (individual)" : ""}: ${/hotel\s*-\s*airport|отель\s*-\s*аэро|hotel - а\/п|hotel-air/i.test(x.text) && !/airport-hotel-airport/i.test(x.text) ? "mehmonxona → aeroport" : /airport-hotel-airport/i.test(x.text) ? "aeroport ↔ mehmonxona" : "aeroport → mehmonxona"} — kiritilgan`;
  if (x.type === "service") return `➕ ${x.text}`;
  return null;
};
export function detailsLines(d, opts = {}) {
  if (!d) return [];
  const L = [];
  const dirs = [];
  for (const f of d.flights) { let g = dirs.find(x => x.date === f.date && x.route === f.route); if (!g) dirs.push(g = { date: f.date, route: f.route, list: [] }); g.list.push(f); }
  for (const g of dirs) L.push(`✈️ ${ymdUz(g.date)} ${routeUz(g.route)}: ` + g.list.map(f => `${f.airline.replace("Uzbekistan Airways", "HY")} ${f.flight} ${f.dep}→${f.arr} (${f.classes.map(c => c.seats).join("/")})`).join(" | "));
  if (!dirs.length) for (const x of d.pack.filter(x => x.type === "freight")) L.push(`✈️ ${ymdUz(x.from)} ${routeUz(x.text.replace(/,\s*(ECONOM|Эконом)\b.*/i, ""))}`);
  const inc = [];
  const h = d.pack.find(x => x.type === "hotel");
  if (h) inc.push(`mehmonxona ${ymdUz(h.from)}–${ymdUz(h.to)}`);
  const tr = d.pack.filter(x => x.type === "service" && /трансфер|transfer/i.test(x.text));
  if (tr.length) inc.push("transfer" + (tr.some(x => /group|групп/i.test(x.text)) ? " (guruh)" : tr.some(x => /individ|индивид/i.test(x.text)) ? " (individual)" : ""));
  if (d.pack.some(x => x.type === "insure")) inc.push("sug'urta");
  const bag = d.flights.map(f => (f.classes[0] || {}).bag).find(Boolean);
  if (bag) inc.push(bag.replace("bagaj ", "bagaj ").replace(" qo'l yuki ", " + "));
  if (inc.length) L.push("📦 " + inc.join(" · "));
  if (opts.manager && d.extras.length) {
    const GR = { "Индивидуальный трансфер": "individual transfer", "Услуги в аэропорту": "aeroport xizmati (Fast Track)", "Экскурсии": "ekskursiyalar", "Страховка": "qo'shimcha sug'urta" };
    const mins = new Map();
    for (const e of d.extras) { const v = parseFloat(String(e.price).replace(/\s/g, "").replace(",", ".")); const k = e.group || e.text.slice(0, 30); if (!mins.has(k) || mins.get(k).v > v) mins.set(k, { v, cur: (String(e.price).match(/[A-Z]{3}/) || ["USD"])[0] }); }
    L.push("💵 Pullik qo'shimcha: " + [...mins].slice(0, 3).map(([k, m]) => `${GR[k] || k} ${m.v} ${m.cur} dan`).join("; "));
  }
  return L;
}

// Mijoz uchun: har yo'nalishda bitta reys (joyi borini), yashash sanalari, narxga kiradigan xizmatlar
const MON = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const dUz = (d) => { const [dd, mm] = d.split("."); return `${+dd} ${MON[+mm - 1]}`; };
const nightsBetween = (a, b) => { const p = (x) => { const [d, m, y] = x.split("."); return Date.UTC(+y, +m - 1, +d); }; return Math.round((p(b) - p(a)) / 864e5); };
export function clientDetails(d, b) {
  if (!d) return [];
  const L = [];
  const dirs = [];
  for (const f of d.flights) { let g = dirs.find(x => x.date === f.date && x.route === f.route); if (!g) dirs.push(g = { date: f.date, route: f.route, list: [] }); g.list.push(f); }
  const ok = (f) => f.classes.some(c => c.seats === "bor" || c.seats === "kam");
  dirs.forEach((g, i) => {
    const f = g.list.find(f => ok(f) && b && f.dep === b.t) || g.list.find(ok) || g.list[0];
    const r = routeUz(g.route).split(" → ");
    const from = r.length === 2 ? r[0] : (i === 0 ? "Toshkent" : ""), to = r.length === 2 ? r[1] : (i === 0 ? "" : "Toshkent");
    L.push(`✈️ ${i === 0 ? "Borish" : "Qaytish"}: ${dUz(g.date)}, ${f.airline} ${f.flight} · ${f.dep} ${from || f.depAp} → ${f.arr.replace("+1", " (ertasi kuni)")} ${to || f.arrAp}`);
  });
  const bag = d.flights.map(f => (f.classes[0] || {}).bag).find(Boolean);
  if (bag) L.push(`🧳 ${bag.replace(/^bagaj/, "Bagaj").replace(" qo'l", " + qo'l")}`);
  if (!d.flights.length) for (const [i, x] of d.pack.filter(x => x.type === "freight").entries()) L.push(`✈️ ${i === 0 ? "Borish" : "Qaytish"}: ${dUz(x.from)} — ${routeUz(x.text.replace(/,\s*(ECONOM|Эконом)(?![а-я]).*/i, "").replace(/,\s*ECONOM.*/i, ""))}${b && /GDS/i.test(b.tour) ? " (muntazam reys)" : ""}`);
  const h = d.pack.find(x => x.type === "hotel");
  if (h) L.push(`🏨 Yashash: ${dUz(h.from)} – ${dUz(h.to)} (${nightsBetween(h.from, h.to)} kecha)`);
  const inc = [];
  if (d.pack.some(x => x.type === "freight") || d.flights.length) inc.push("aviabilet borish-qaytish");
  if (h) inc.push("mehmonxona");
  if (d.pack.some(x => x.type === "service" && /трансфер|transfer/i.test(x.text))) inc.push("transfer aeroport ↔ mehmonxona");
  if (d.pack.some(x => x.type === "insure")) inc.push("tibbiy sug'urta");
  if (inc.length) L.push(`✅ Narxga kiradi: ${inc.join(", ")}`);
  return L;
}

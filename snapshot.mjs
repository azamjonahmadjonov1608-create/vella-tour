// Barcha operatorlardan tur paketlar "suratini" oladi va bitta JSON faylga yozadi.
// Server bo'lmasa ham sayt shu fayldan qidiradi. Ishga tushirish:
//   node snapshot.mjs [chiqish_fayli]   (standart: public/packages.json)
import fs from "node:fs";
import { OPERATORS } from "./lib/operators.mjs";
import { getMeta, searchOperator } from "./lib/samo.mjs";
import { learn, idFor, initPhotos, normName } from "./lib/photos.mjs";

const OUT = process.argv[2] || new URL("./public/packages.json", import.meta.url).pathname;
const MARKUP = +(process.env.MARKUP_PERCENT ?? 20) / 100;
const DESTS = process.env.DESTS ? process.env.DESTS.split(",") : ["оаэ", "египет", "турция", "грузия", "азербайджан", "вьетнам", "таиланд", "малайзия", "мальдивы", "индонезия", "китай", "саудовская аравия", "шри-ланка", "катар", "оман"];
const PER_WINDOW = 70; // har bir yo'nalish+oyna uchun saqlanadigan eng yaxshi takliflar

const iso = (d) => d.toISOString().slice(0, 10);
const day = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d; };
const WIN = +(process.env.WIN_DAYS || 10);
const WINDOWS = []; for (let a = 5; a < 65; a += WIN) WINDOWS.push([iso(day(a)), iso(day(Math.min(64, a + WIN - 1)))]);

initPhotos(new URL("./data", import.meta.url).pathname);
fs.mkdirSync(new URL("./data", import.meta.url).pathname, { recursive: true });

const ops = OPERATORS.filter(o => !o.disabled);
const metas = {};
await Promise.all(ops.map(async o => { try { metas[o.key] = await getMeta(o); } catch {} }));

const jobs = [];
const half = (a, b) => { const m = new Date((Date.parse(a) + Date.parse(b)) / 2); const m1 = iso(m), m2 = iso(new Date(m.getTime() + 86400000)); return [[a, m1], [m2, b]]; };
for (const c of DESTS) for (const [from, to] of WINDOWS) for (const o of ops) {
  if (!metas[o.key] || !metas[o.key].states[c]) continue;
  // Fun&Sun juda katta javob qaytaradi — oynani va kechalarni bo'lib so'raymiz
  if (o.key === "funsun" && WIN > 10) { for (const [a, b] of half(from, to)) for (const [n1, n2] of [[3, 7], [8, 14]]) jobs.push({ c, from: a, to: b, o, n1, n2, win: from }); }
  else if (o.key === "funsun") { for (const [n1, n2] of [[3, 7], [8, 14]]) jobs.push({ c, from, to, o, n1, n2, win: from }); }
  else jobs.push({ c, from, to, o, n1: 3, n2: 14, win: from });
}

const results = {}; // c|from -> []
let done = 0, ok = 0;
async function worker() {
  while (jobs.length) {
    const j = jobs.shift();
    try {
      const v = await searchOperator(j.o, { country: j.c, dateFrom: j.from, dateTo: j.to, nightsMin: j.n1, nightsMax: j.n2, adults: 2, kids: 0, timeoutMs: 60000 });
      learn(v.results);
      (results[j.c + "|" + j.win] ||= []).push(...v.results.filter(r => r.currency === "USD"));
      if (v.results.length) ok++;
    } catch {}
    done++;
    if (done % 10 === 0) process.stderr.write(`${done} so'rov, ${ok} natijali\n`);
  }
}
await Promise.all(Array.from({ length: 6 }, worker));

const AIR = [[/uzbekistan|uzairways|uz airways/i, "Uzbekistan Airways"], [/centrum/i, "Centrum Air"], [/fly ?dubai/i, "flydubai"], [/air ?arabia/i, "Air Arabia"], [/qanot/i, "Qanot Sharq"], [/azal/i, "AZAL"], [/turkish/i, "Turkish Airlines"], [/pegasus/i, "Pegasus"], [/air ?astana/i, "Air Astana"], [/saudia/i, "Saudia"], [/vietjet/i, "VietJet"]];
const airline = (t) => { for (const [re, n] of AIR) if (re.test(t)) return n; return ""; };
const ymd = (d) => d.split(".").reverse().join("-");

const pkgs = [];
for (const [k, list] of Object.entries(results)) {
  const c = k.split("|")[0];
  // bir mehmonxona+sana+kechalar+ovqat uchun eng arzoni; keyin turli kechalar guruhlaridan teng olamiz
  const best = new Map();
  for (const r of list) {
    const key = [r.date, r.nights, normName(r.hotel), r.meal].join("|");
    if (!best.has(key) || best.get(key).price > r.price) best.set(key, r);
  }
  const sorted = [...best.values()].filter(r => parseInt(r.nights) > 0 && r.seats !== "yo'q").sort((a, b) => a.price - b.price);
  // Har bir uchish sanasi va kechalar soni uchun eng arzon bir nechta mehmonxonani olamiz —
  // shunda istalgan sana/kecha tanlanganda natija chiqadi
  const PER_SLOT = 3, slots = new Map(), picked = [];
  for (const r of sorted) {
    const k = r.date + "|" + parseInt(r.nights);
    const arr = slots.get(k) || [];
    if (arr.length < PER_SLOT && !arr.some(x => normName(x.hotel) === normName(r.hotel))) { arr.push(r); slots.set(k, arr); picked.push(r); }
  }
  for (const r of picked) {
    const price = Math.round(r.price * (1 + MARKUP));
    const pid = idFor(r);
    pkgs.push({ c, d: ymd(r.date), t: r.time, n: parseInt(r.nights), h: r.hotel, rg: r.region, s: r.stars || 0, m: r.meal, mt: r.mealText, rm: r.room, a: airline(r.tour), p: price, pp: Math.round(price / 2), ph: pid || "", src: "V" + (ops.findIndex(o => o.key === r.op) + 1) });
  }
}
// rasm IDlari keyinroq to'ldirilgan bo'lishi mumkin — nom bo'yicha yana bog'laymiz
for (const p of pkgs) if (!p.ph) p.ph = idFor({ hotel: p.h }) || "";

const out = { at: new Date().toISOString(), adults: 2, markup: MARKUP, windows: WINDOWS, count: pkgs.length, pkgs };
fs.writeFileSync(OUT, JSON.stringify(out));
process.stderr.write(`Tayyor: ${pkgs.length} paket, ${(fs.statSync(OUT).size / 1024) | 0} KB -> ${OUT}\n`);

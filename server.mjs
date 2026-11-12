// Vella Tour — o'z serveringiz uchun API.
// Ishga tushirish:  node server.mjs   (Node 18+)
// Sozlamalar (.env yoki muhit o'zgaruvchilari): PORT, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, MARKUP_PERCENT
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OPERATORS, COUNTRY_UZ } from "./lib/operators.mjs";
import { getMeta, searchOperator, normCountry } from "./lib/samo.mjs";
import crypto from "node:crypto";
import { initOrders, createOrder, getOrder, updateOrder, allOrders, publicOrder } from "./lib/orders.mjs";
import { usdRate, paymentLinks, paymeHandler, clickHandler, paymentsEnabled } from "./lib/payments.mjs";
import { autoBook } from "./lib/booking.mjs";
import { initPhotos, learn, idFor, photoFor } from "./lib/photos.mjs";
import { startBot, runQuery, offerFor, describe, managerDetails, botWebhook } from "./lib/bot.mjs";
import { managerText, defaultPicks } from "./lib/tur.mjs";
import { recheck } from "./lib/recheck.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
// .env faylini o'qish (kutubxonasiz)
try {
  for (const line of fs.readFileSync(path.join(DIR, ".env"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const PORT = +(process.env.PORT || 3000);
const MARKUP = +(process.env.MARKUP_PERCENT ?? 20) / 100; // operator narxiga ustama, standart 20%
const ACTIVE = OPERATORS.filter(o => !o.disabled);
const CODE = Object.fromEntries(ACTIVE.map((o, i) => [o.key, "V" + (i + 1)])); // mijozga operator nomi ko'rsatilmaydi
const SEARCH_TTL = 15 * 60 * 1000;
const cache = new Map();
const TUR_CACHE = new Map();
// Windows/kompyuterda: har kuni 07:40 (Toshkent) da narxlar bazasini o'zi yangilaydi (Linux serverda buni systemd timer qiladi)
function dailySnapshot() {
  // Windows/kompyuter yoki DAILY_SNAPSHOT=1 (Render): har kuni tunda 00:00 (Toshkent) dan keyin bir marta,
  // yoki baza yo'q / 20 soatdan eski bo'lsa — darhol (Render uyg'onganda ham). Linux serverda buni systemd timer qiladi.
  if (process.platform !== "win32" && process.env.DAILY_SNAPSHOT !== "1") return;
  const file = path.join(DIR, "public", "packages.json");
  let running = false;
  const tick = async () => {
    if (running) return;
    let age = Infinity; try { age = Date.now() - fs.statSync(file).mtimeMs; } catch {}
    const tz = new Date(Date.now() + 5 * 3600e3), today = tz.toISOString().slice(0, 10);
    let madeDay = ""; try { madeDay = new Date(fs.statSync(file).mtimeMs + 5 * 3600e3).toISOString().slice(0, 10); } catch {}
    if (age > 20 * 3600e3 || madeDay !== today) {
      running = true;
      const { spawn } = await import("node:child_process");
      const p = spawn(process.execPath, ["snapshot.mjs", file], { cwd: DIR, stdio: "inherit" });
      p.on("exit", () => { running = false; });
    }
  };
  setInterval(tick, 10 * 60 * 1000).unref(); setTimeout(tick, 30000);
} // menejer qidiruvlari 10 daqiqa saqlanadi (taklif uchun boshqa mehmonxonalarni tanlaganda qayta qidirmaslik uchun)
const RESULTS = new Map(); // rid -> { r (operator ma'lumoti bilan), q, price, at } — narxni mijoz o'zgartira olmasligi uchun
initOrders(path.join(DIR, "data"));
initPhotos(path.join(DIR, "data"));
const AIRLINES = [[/uzbekistan|uzairways|uz airways/i, "Uzbekistan Airways"], [/centrum/i, "Centrum Air"], [/fly ?dubai/i, "flydubai"], [/air ?arabia/i, "Air Arabia"], [/qanot/i, "Qanot Sharq"], [/azal/i, "AZAL"], [/turkish/i, "Turkish Airlines"], [/pegasus/i, "Pegasus"], [/air ?astana/i, "Air Astana"], [/saudia/i, "Saudia"], [/vietjet/i, "VietJet"]];
const airlineOf = (t) => { for (const [re, n] of AIRLINES) if (re.test(t)) return n; return ""; };

const send = (res, code, body, type = "application/json; charset=utf-8") => {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": type.startsWith("application/json") ? "no-store" : "public, max-age=300",
    // sayt boshqa manzilda (GitHub Pages) turganda ham API ishlashi uchun
    "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, x-key, x-admin-key", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

async function countries() {
  const metas = await Promise.allSettled(ACTIVE.map(getMeta));
  const count = {};
  metas.forEach(m => { if (m.status === "fulfilled") for (const c of Object.keys(m.value.states)) count[c] = (count[c] || 0) + 1; });
  return Object.entries(count)
    .map(([key, n]) => ({ key, uz: COUNTRY_UZ[key] || key, operators: n }))
    .sort((a, b) => b.operators - a.operators || a.uz.localeCompare(b.uz));
}

function validDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || ""); }

// Operator qatorini mijozga ko'rsatiladigan ko'rinishga o'tkazadi va rid bilan eslab qoladi
function toClient(r, q) {
  const pax = (+q.adults) + (+q.kids || 0);
  const price = Math.round(r.price * (1 + MARKUP));
  const rid = crypto.createHash("sha1").update(JSON.stringify([r.op, r.claim || r.code, r.date, r.hotel, r.room, r.meal, r.price, q.adults, q.kids])).digest("hex").slice(0, 16);
  RESULTS.set(rid, { r, q, price, perPerson: Math.round(price / pax), at: Date.now() });
  return {
    rid, src: CODE[r.op], airline: airlineOf(r.tour), photo: idFor(r) ? "/api/photo?id=" + idFor(r) : "", date: r.date, time: r.time, nights: +r.nights, tour: r.tour,
    hotel: r.hotel, region: r.region, stars: r.stars, meal: r.meal, mealText: r.mealText, room: r.room,
    price, perPerson: Math.round(price / pax), currency: "USD", code: r.code, seats: r.seats
  };
}

async function search(q) {
  const key = JSON.stringify(q);
  const c = cache.get(key);
  if (c && Date.now() - c.at < SEARCH_TTL) return c.data;
  const settled = await Promise.allSettled(ACTIVE.map(op => searchOperator(op, q)));
  const ops = [], all = [];
  settled.forEach((s, i) => {
    const op = ACTIVE[i];
    if (s.status === "rejected") { ops.push({ code: CODE[op.key], status: "xato" }); return; }
    ops.push({ code: CODE[op.key], status: s.value.status, count: s.value.results.length, ms: s.value.ms });
    for (const r of s.value.results) all.push(r);
  });
  learn(all);
  // Bir xil paketlardan eng arzonini qoldiramiz
  const best = new Map();
  for (const r of all) {
    const k = [r.date, r.nights, r.hotel.toLowerCase(), r.meal, r.room.toLowerCase()].join("|");
    if (!best.has(k) || best.get(k).price > r.price) best.set(k, r);
  }
  const results = [...best.values()]
    .filter(r => r.currency === "USD" && r.seats !== "yo'q") // joyi yo'q turlarni ko'rsatmaymiz
    .map(r => toClient(r, q))
    .sort((a, b) => a.price - b.price)
    .slice(0, 300);
  const data = { at: new Date().toISOString(), total: results.length, operators: ops, results };
  cache.set(key, { at: Date.now(), data });
  return data;
}

async function telegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) throw new Error("Telegram sozlanmagan");
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text: "🆕 " + text })
  });
  if (!r.ok) throw new Error("Telegram xatosi " + r.status);
}

// To'lov tushganda: sizga Telegram xabari + avtomatik bron
function onPaid(o) {
  const t = o.tourists.map((x, i) => `${i + 1}) ${x.last} ${x.first}, ${x.birth}, pasport ${x.passport} (${x.passportExp})`).join("\n");
  const msg = `💳 TO'LANDI — buyurtma #${o.id}\n${o.pkg.hotel} (${o.pkg.region})\nUchish: ${o.pkg.date} ${o.pkg.time}, ${o.pkg.nights} kecha, ${o.pkg.meal}, ${o.pkg.room}\n` +
    `Mijoz to'ladi: ${o.amountUzs.toLocaleString("ru-RU")} so'm ($${o.priceUsd})\nOperator: ${o.pkg.opName} — $${o.pkg.opPriceUsd}, kod ${o.pkg.code}\nTel: ${o.phone} ${o.email}\nTuristlar:\n${t}`;
  telegram(msg).catch(() => {});
  autoBook(o, { updateOrder, telegram }).catch(e => telegram(`⚠️ #${o.id} avtomatik bron xatosi: ${e.message}. Qo'lda bron qiling.`).catch(() => {}));
}

const readBody = (req) => new Promise((ok, no) => {
  let b = ""; req.on("data", d => { b += d; if (b.length > 20000) { no(new Error("katta")); req.destroy(); } });
  req.on("end", () => ok(b)); req.on("error", no);
});

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    // Telegram webhook (Render): xabar keldi — darhol 200 qaytaramiz, botga uzatamiz
    if (botWebhook && req.method === "POST" && url.pathname === botWebhook.path) {
      if (req.headers["x-telegram-bot-api-secret-token"] !== botWebhook.secret) return send(res, 403, { error: "no" });
      const body = await readBody(req).catch(() => "");
      send(res, 200, { ok: true });
      try { botWebhook.handle(JSON.parse(body || "{}")); } catch {}
      return;
    }
    if (req.method === "OPTIONS") return send(res, 204, "");
    if (url.pathname === "/api/ping") return send(res, 200, { ok: true, at: Date.now() });
    if (url.pathname === "/api/countries") return send(res, 200, await countries());

    if (url.pathname === "/api/search") {
      const g = (k, d) => url.searchParams.get(k) || d;
      const q = {
        country: normCountry(g("country", "")), dateFrom: g("from"), dateTo: g("to", g("from")),
        nightsMin: Math.max(1, Math.min(30, +g("nmin", 5))), nightsMax: Math.max(1, Math.min(30, +g("nmax", 7))),
        adults: Math.max(1, Math.min(9, +g("adults", 2))), kids: Math.max(0, Math.min(4, +g("kids", 0))),
        kidAges: g("ages", "").split(",").filter(Boolean).map(n => Math.max(0, Math.min(16, +n)))
      };
      if (!q.country || !validDate(q.dateFrom) || !validDate(q.dateTo)) return send(res, 400, { error: "country, from, to kerak (YYYY-MM-DD)" });
      if (q.nightsMax < q.nightsMin) q.nightsMax = q.nightsMin;
      return send(res, 200, await search(q));
    }

    if (url.pathname === "/api/ariza" && req.method === "POST") {
      const body = JSON.parse(await readBody(req) || "{}");
      if (body.website) return send(res, 200, { ok: true }); // spam tuzog'i
      let text = String(body.text || "").trim().slice(0, 3500);
      if (text.length < 10) return send(res, 400, { error: "matn qisqa" });
      // Operatorning haqiqiy nomini faqat Telegram xabariga qo'shamiz
      if (body.extra) text += "\n— " + String(body.extra).slice(0, 500);
      if (body.src) {
        const op = ACTIVE.find(o => CODE[o.key] === body.src);
        if (op) text += `\n— Operator: ${op.name}${op.commission ? ` (komissiya ${Math.round(op.commission * 100)}%)` : ""}`;
      }
      await telegram(text);
      return send(res, 200, { ok: true });
    }

    // ---- Mehmonxona rasmi ----
    if (url.pathname === "/api/photo") {
      try {
        const p = await photoFor(url.searchParams.get("id"));
        if (!p || !p.main) return send(res, 404, { error: "rasm yo'q" });
        res.writeHead(302, { Location: p.main, "Cache-Control": "public, max-age=86400" }); return res.end();
      } catch { return send(res, 404, { error: "rasm yo'q" }); }
    }

    // ---- Onlayn buyurtma ----
    if (url.pathname === "/api/order" && req.method === "POST") {
      const b = JSON.parse(await readBody(req) || "{}");
      const hit = RESULTS.get(String(b.rid || ""));
      if (!hit || Date.now() - hit.at > 2 * 3600 * 1000) return send(res, 410, { error: "Narx eskirdi, qaytadan qidiring" });
      const pax = hit.q.adults + (hit.q.kids || 0);
      const tourists = Array.isArray(b.tourists) ? b.tourists.slice(0, pax) : [];
      const okT = tourists.length === pax && tourists.every(t => t && t.last && t.first && /^\d{4}-\d{2}-\d{2}$/.test(t.birth || "") && (t.passport || "").length >= 6 && /^\d{4}-\d{2}-\d{2}$/.test(t.passportExp || ""));
      const phone = String(b.phone || "").replace(/[^\d+]/g, "");
      if (!okT || phone.replace(/\D/g, "").length < 12) return send(res, 400, { error: "Turistlar ma'lumoti yoki telefon to'liq emas" });
      // To'lovdan oldin jonli tekshiruv: bu tur operatorda hozir ham shu narxda bormi? (RECHECK=0 bilan o'chiriladi)
      const op = ACTIVE.find(o => o.key === hit.r.op);
      if (op && process.env.RECHECK !== "0") {
        const chk = await recheck(op, hit.r, hit.q);
        if (chk.status === "sold_out") {
          const alternatives = chk.alternatives.map(x => toClient(x, hit.q));
          return send(res, 409, { status: "sold_out", error: "Afsuski, bu turda joy qolmadi. Shu sanaga boshqa variantlar:", alternatives });
        }
        if (chk.status === "price_changed") {
          const nr = toClient(chk.fresh, hit.q);
          return send(res, 409, { status: "price_changed", error: `Operator narxni o'zgartirdi: endi $${nr.price}. Rozi bo'lsangiz, yana «To'lovga o'tish»ni bosing.`, rid: nr.rid, price: nr.price, perPerson: nr.perPerson });
        }
        // "error" — operator javob bermadi: buyurtma qabul qilinadi, to'lovdan keyingi bron baribir tekshiradi
        if (chk.status === "error") telegram(`⚠️ Jonli tekshiruv o'tmadi (${op.name}: ${chk.error}). ${hit.r.hotel}, ${hit.r.date} — to'lovdan keyin qo'lda tekshiring.`).catch(() => {});
      }
      // Onlayn to'lov ulanmagan bo'lsa — sayt buyurtmani ariza sifatida Telegramga yuboradi (503)
      if (!paymentsEnabled()) return send(res, 503, { error: "Onlayn to'lov hali ulanmagan — ariza menejerga yuboriladi" });
      const rate = await usdRate();
      const amountUzs = Math.ceil(hit.price * rate / 1000) * 1000;
      const r = hit.r;
      const o = createOrder({
        pkg: { op: r.op, opName: r.opName, claim: r.claim, code: r.code, tour: r.tour, date: r.date, time: r.time, nights: +r.nights, hotel: r.hotel, region: r.region, meal: r.meal, room: r.room, opPriceUsd: r.price, q: hit.q },
        tourists: tourists.map(t => ({ last: String(t.last).toUpperCase().slice(0, 40), first: String(t.first).toUpperCase().slice(0, 40), birth: t.birth, passport: String(t.passport).toUpperCase().replace(/\s/g, "").slice(0, 15), passportExp: t.passportExp, gender: t.gender === "F" ? "F" : "M" })),
        phone, email: String(b.email || "").slice(0, 80), priceUsd: hit.price, rate, amountUzs
      });
      const back = (process.env.SITE_URL || `http://${req.headers.host}`) + "/order.html?id=" + o.id;
      return send(res, 200, { order: publicOrder(o), links: paymentLinks(o, back), statusUrl: back });
    }
    if (url.pathname === "/api/order" && req.method === "GET") {
      const o = getOrder(url.searchParams.get("id"));
      return o ? send(res, 200, publicOrder(o)) : send(res, 404, { error: "Topilmadi" });
    }

    // ---- To'lov tizimlari ----
    if (url.pathname === "/api/payme" && req.method === "POST") {
      let body; try { body = JSON.parse(await readBody(req)); } catch { return send(res, 200, { jsonrpc: "2.0", id: null, error: { code: -32700, message: { uz: "JSON", ru: "JSON", en: "JSON" } } }); }
      return send(res, 200, paymeHandler(req.headers.authorization || "", body, onPaid));
    }
    if ((url.pathname === "/api/click/prepare" || url.pathname === "/api/click/complete") && req.method === "POST") {
      const f = Object.fromEntries(new URLSearchParams(await readBody(req)));
      return send(res, 200, clickHandler(url.pathname.endsWith("prepare") ? "prepare" : "complete", f, onPaid));
    }

    // ---- Menejer qidiruvi (MANAGER_KEY yoki ADMIN_KEY bilan): oddiy matn -> barcha operatorlar ----
    if (url.pathname === "/api/tur" && req.method === "POST") {
      const key = req.headers["x-key"] || "";
      const ok = [process.env.MANAGER_KEY, process.env.ADMIN_KEY].filter(Boolean);
      if (!ok.length || !ok.includes(key)) return send(res, 401, { error: "Menejer kaliti noto'g'ri" });
      const b = JSON.parse(await readBody(req) || "{}");
      const text = String(b.text || "").slice(0, 400);
      const ck = text.toLowerCase().replace(/\s+/g, " ");
      let hit = TUR_CACHE.get(ck);
      if (!hit || Date.now() - hit.at > 10 * 60 * 1000) { hit = { at: Date.now(), ...(await runQuery(text)) }; TUR_CACHE.set(ck, hit); }
      const { q, res: r, error } = hit;
      if (error) { TUR_CACHE.delete(ck); return send(res, 400, { error, q }); }
      const picks = Array.isArray(b.picks) && b.picks.length ? b.picks.map(Number).filter(i => r.top[i]).slice(0, 5) : defaultPicks(r);
      const o = r.top.length ? await offerFor(r, picks) : { picks: [], infos: [], text: "" };
      if (!hit.det) hit.det = r.top.length ? await managerDetails(r, 8) : {};
      return send(res, 200, { q, desc: describe(q), res: r, det: hit.det, manager: managerText(r, 15, hit.det), client: o.text, picks: o.picks, infos: o.infos.map(i => ({ photos: i.photos.slice(0, 3), uz: i.uz })) });
    }

    // ---- Admin (ADMIN_KEY bilan): buyurtmalar ro'yxati, holat va hujjat qo'shish ----
    if (url.pathname.startsWith("/api/admin/")) {
      const key = req.headers["x-admin-key"] || url.searchParams.get("key");
      if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) return send(res, 401, { error: "Ruxsat yo'q" });
      if (url.pathname === "/api/admin/orders") return send(res, 200, allOrders().slice(0, 300));
      if (url.pathname === "/api/admin/order" && req.method === "POST") {
        const b = JSON.parse(await readBody(req) || "{}");
        const o = getOrder(b.id); if (!o) return send(res, 404, { error: "Topilmadi" });
        const patch = {};
        if (["new", "paid", "booking", "booked", "docs", "cancelled"].includes(b.status)) patch.status = b.status;
        if (b.docUrl) patch.docs = [...o.docs, { title: String(b.docTitle || "Hujjat").slice(0, 60), url: String(b.docUrl).slice(0, 500) }];
        if (b.opClaimNo) patch.opClaimNo = String(b.opClaimNo).slice(0, 40);
        return send(res, 200, updateOrder(o.id, patch));
      }
    }

    // Statik fayllar (sayt)
    let p = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    if (p === "/" || p === "\\") p = "/index.html";
    const file = path.join(DIR, "public", p);
    if (!file.startsWith(path.join(DIR, "public"))) return send(res, 403, "403", "text/plain");
    fs.readFile(file, (err, data) => err ? send(res, 404, "Topilmadi", "text/plain; charset=utf-8") : send(res, 200, data, MIME[path.extname(file)] || "application/octet-stream"));
  } catch (e) {
    send(res, 500, { error: String(e.message || e) });
  }
}).listen(PORT, () => (startBot(), dailySnapshot(), console.log(`Vella Tour server: http://localhost:${PORT}  (operatorlar: ${ACTIVE.map(o => o.name).join(", ")})`)));

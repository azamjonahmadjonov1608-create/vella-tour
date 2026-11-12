// Menejerlar uchun Telegram bot.
//  1) Menejer oddiy matn yozadi ("Vyetnam 5 kun 5 yulduz"). Yetishmagan narsalarni bot tugmalar bilan so'raydi
//     (sana, kishilar, yulduz, ovqat).
//  2) Barcha operatorlardan jonli qidiradi va javob beradi:
//     - davlat bo'yicha umumiy ko'rinish: shaharlar, yulduz va ovqat bo'yicha narxlar, aviakompaniyalar, operatorlar;
//     - HAR BIR OPERATOR ALOHIDA: rasmlar, mehmonxona haqida, reyslar, narxga nima kiradi, ovqat/xona bo'yicha narx farqi,
//       qo'shimcha xizmatlar narxi, operator narxi va sotuv narxi;
//     - tugmalar: "batafsil" (barcha rasmlar, xona×ovqat jadvali, boshqa sanalar), "mijozga taklif", "ko'proq".
//   .env: TELEGRAM_BOT_TOKEN, TELEGRAM_MANAGERS=123456,789012 (ruxsat berilgan Telegram ID lar)
import { parseQuery } from "./parse.mjs";
import { searchTours, managerText, clientText, defaultPicks, MEAL_UZ, ddUz, bestOf } from "./tur.mjs";
import { COUNTRY_UZ } from "./operators.mjs";
import { hotelInfo, hotelInfoAny } from "./hotelinfo.mjs";
import { webPhotos } from "./tripphotos.mjs";
import { faqAnswer, faqByKey, isQuestion, FAQ_MENU } from "./faq.mjs";
import { tourAnswer } from "./turqa.mjs";
import { tourDetails, detailsLines, clientDetails } from "./details.mjs";
import { overview, buildBlocks, enrich, operatorText, hotelDetailText, photosOf, gImages, clientOffer } from "./report.mjs";
import { money } from "./tur.mjs";
import { initPhotos } from "./photos.mjs";
import fs from "node:fs";
import crypto from "node:crypto";

// Ruxsat berilgan menejerlar: .env dagi TELEGRAM_MANAGERS + data/managers.json (bot orqali qo'shiladi)
const DATA = new URL("../data/", import.meta.url).pathname;
const MFILE = DATA + "managers.json";
const loadM = () => { try { return JSON.parse(fs.readFileSync(MFILE, "utf8")); } catch { return { owner: "", list: [] }; } };
const saveM = (m) => { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(MFILE, JSON.stringify(m, null, 1)); };

const HELP = `Tur so'rovini oddiy matn bilan yozing, masalan:

• Vyetnam 5 kun 5 yulduz
• Turkiya, 15–20 dekabr, 7 kecha, 2 katta + 1 bola 6 yosh, 4 yulduz, hammasi kiritilgan
• Dubay 10.01–17.01 2 katta "Rixos"
• Misr dekabr 7 kecha nonushta 1500$ gacha

Nima yetishmasa — bot tugmalar bilan so'raydi. Keyin:
1) davlat bo'yicha umumiy ko'rinish (shaharlar, yulduz/ovqat bo'yicha narxlar);
2) har bir operator alohida: rasmlar, reyslar, narxga nima kiradi, ovqat/xona narx farqi, qo'shimcha xizmatlar;
3) tugmalar: 🔍 batafsil · 📝 mijozga taklif · ➕ ko'proq.`;

export function describe(q) {
  return [q.country && `${COUNTRY_UZ[q.country] || q.country}`, q.city && `shahar: ${q.city.split("|")[0]}`, `uchish: ${ddUz(q.from)}${q.to !== q.from ? " – " + ddUz(q.to) : ""}`,
    `${q.n1}${q.n2 !== q.n1 ? "–" + q.n2 : ""} kecha`, `${q.adults} katta${q.kids ? " + " + q.kids + " bola" + (q.ages?.length ? " (" + q.ages.join(", ") + " yosh)" : "") : ""}`,
    q.stars && `${q.stars}★+`, q.meal && MEAL_UZ[q.meal], q.budget && `≤ $${q.budget}`, q.hotel && `«${q.hotel}»`].filter(Boolean).join(" · ");
}

// Qidiruv: aniq sana bo'yicha topilmasa ±2 kun va ±1 kechaga kengaytiradi
const CACHE = new Map(); // bir xil so'rov 10 daqiqa ichida qayta so'ralsa — darhol javob
export async function runQ(q) {
  const ck = JSON.stringify([q.country, q.from, q.to, q.n1, q.n2, q.adults, q.kids, q.ages, q.stars, q.meal, q.hotel, q.city, q.budget]);
  const c = CACHE.get(ck);
  if (c && Date.now() - c.at < 10 * 60 * 1000) return { ...c.res, cached: true };
  let res = await searchTours(q);
  if (!res.top.length && res.whenComplete && !(res.hint && res.hint.n)) res = await res.whenComplete; // umuman hech narsa kelmagan bo'lsagina kechikkanlarni kutamiz
  if (!res.top.length && !(res.hint && res.hint.n)) { // umuman tur yo'q bo'lsagina sanani kengaytiramiz (filtrga mos kelmasa — yo'q, bu vaqtni 2 baravar oshiradi)
    const w = { ...q, from: new Date(Date.parse(q.from) - 2 * 864e5).toISOString().slice(0, 10), to: new Date(Date.parse(q.to) + 2 * 864e5).toISOString().slice(0, 10), n1: Math.max(1, q.n1 - 1), n2: q.n2 + 1 };
    let r2 = await searchTours(w);
    if (!r2.top.length && r2.whenComplete) r2 = await r2.whenComplete;
    if (r2.top.length) { res = r2; res.widened = true; }
  }
  if (!res.whenComplete) CACHE.set(ck, { at: Date.now(), res });
  else res.whenComplete.then(full => CACHE.set(ck, { at: Date.now(), res: full })).catch(() => {});
  return res;
}
export async function runQuery(text) {
  const q = parseQuery(text);
  if (!q.country) return { q, error: "Mamlakatni tushunmadim. Masalan: «Turkiya 15–20 dekabr 7 kecha 2 katta»" };
  return { q, res: await runQ(q) };
}

export async function offerFor(res, picks) {
  const [infos, dets] = await Promise.all([
    Promise.all(picks.map(i => res.top[i] ? hotelInfoAny(res.top[i].hid, res.top[i].hotel, res.top[i].region) : hotelInfo(""))),
    Promise.all(picks.map(i => res.top[i] ? tourDetails(bestOf(res.top[i])).catch(() => null) : null))]);
  const details = dets.map((d, k) => clientDetails(d, res.top[picks[k]] && bestOf(res.top[picks[k]])));
  return { picks, infos, dets, details, text: clientText(res, picks, { facts: infos.map(x => x.uz), details, contact: process.env.OFFER_CONTACT || "" }) };
}

// Menejer ro'yxatidagi birinchi n ta mehmonxona uchun to'liq tarkib (sayt / API uchun)
export async function managerDetails(res, n = 5) {
  const det = {};
  await Promise.all(res.top.slice(0, n).map(async (g, i) => { try { det[i] = detailsLines(await tourDetails(bestOf(g)), { manager: true }); } catch {} }));
  return det;
}

// ---------------- Savol-javob (wizard) ----------------
const COUNTRIES = [["оаэ", "🇦🇪 BAA"], ["турция", "🇹🇷 Turkiya"], ["египет", "🇪🇬 Misr"], ["вьетнам", "🇻🇳 Vyetnam"], ["таиланд", "🇹🇭 Tailand"], ["малайзия", "🇲🇾 Malayziya"],
  ["грузия", "🇬🇪 Gruziya"], ["азербайджан", "🇦🇿 Ozarbayjon"], ["мальдивы", "🇲🇻 Maldiv"], ["индонезия", "🇮🇩 Bali"], ["китай", "🇨🇳 Xitoy"], ["саудовская аравия", "🕋 Umra"],
  ["шри-ланка", "🇱🇰 Shri-Lanka"], ["катар", "🇶🇦 Qatar"], ["оман", "🇴🇲 Ummon"]];
const MON = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const iso = (d) => d.toISOString().slice(0, 10);
const rows = (arr, n) => arr.reduce((a, x, i) => (i % n ? a[a.length - 1].push(x) : a.push([x]), a), []);
const btn = (text, data) => ({ text, callback_data: data });
const GO = [btn("⏩ Shu bilan qidir", "w:go")];

// Hozirgi holatdan to'liq so'rov: matndan tahlil + tugma bilan tanlanganlar
function buildQ(st) {
  const q = parseQuery(st.text);
  const x = st.x;
  if (x.country) q.country = x.country;
  if (x.from) { q.from = x.from; q.to = x.to; q.given.date = true; }
  if (x.n) { q.n1 = q.n2 = x.n; q.given.nights = true; }
  if (x.adults) { q.adults = x.adults; q.kids = x.kids || 0; q.given.adults = true; }
  if (x.ages) { q.ages = x.ages; q.kids = x.ages.length; }
  if (x.stars !== undefined) { q.stars = x.stars || undefined; q.given.stars = true; }
  if (x.meal !== undefined) { q.meal = x.meal || undefined; q.given.meal = true; }
  if (x.country) q.given.country = true;
  q.warn = q.warn.filter(w => !(q.given.date && /sana/.test(w)) && !(q.given.nights && /kecha/.test(w)) && !(q.country && /mamlakat/.test(w)));
  return q;
}

// Keyingi savol (yoki null — hammasi tayyor)
function nextQuestion(st) {
  const q = buildQ(st);
  if (st.go && q.country) return null;
  if (!q.given.country) return { key: "country", text: "🌍 Qaysi davlatga?", kb: rows(COUNTRIES.map(([k, n]) => btn(n, "w:country:" + k)), 3) };
  if (!q.given.date) {
    const now = new Date(), opts = [btn("Yaqin 2 hafta", "w:date:soon")];
    for (let i = 0; i < 5; i++) { const m = (now.getMonth() + i) % 12; opts.push(btn(MON[m], "w:date:m" + m)); }
    return { key: "date", text: "📅 Qachon uchasiz? Oyni tanlang yoki sanani yozing (masalan: 20 dekabr yoki 20–25.12)", kb: [...rows(opts, 3), GO] };
  }
  if (!q.given.nights) return { key: "nights", text: "🌙 Necha kecha?", kb: [...rows([3, 4, 5, 6, 7, 8, 9, 10, 12, 14].map(n => btn(`${n} kecha`, "w:n:" + n)), 5), GO] };
  if (!q.given.adults) return { key: "adults", text: "👥 Necha kishi?", kb: [[btn("1 katta", "w:pax:1:0"), btn("2 katta", "w:pax:2:0"), btn("3 katta", "w:pax:3:0")], [btn("2 katta + 1 bola", "w:pax:2:1"), btn("2 katta + 2 bola", "w:pax:2:2")], [btn("4 katta", "w:pax:4:0"), btn("1 katta + 1 bola", "w:pax:1:1")], GO] };
  if (q.kids && !(q.ages && q.ages.length >= q.kids)) return { key: "ages", text: `👶 Bola${q.kids > 1 ? "lar" : ""} yoshi? Yozing (masalan: ${q.kids > 1 ? "5, 9" : "6"})`, kb: [GO] };
  if (!q.given.stars) return { key: "stars", text: "⭐ Mehmonxona necha yulduz?", kb: [[btn("3★", "w:stars:3"), btn("4★", "w:stars:4"), btn("5★", "w:stars:5")], [btn("Farqi yo'q — hammasini ko'rsat", "w:stars:0")], GO] };
  if (!q.given.meal) return { key: "meal", text: "🍽 Ovqatlanish?", kb: [[btn("Ovqatsiz", "w:meal:RO"), btn("Nonushta", "w:meal:BB")], [btn("Nonushta + kechki", "w:meal:HB"), btn("Hammasi kiritilgan", "w:meal:AI")], [btn("Farqi yo'q — hammasini ko'rsat", "w:meal:0")], GO] };
  return null;
}

function applyChoice(st, data) {
  const [, k, a, b] = data.split(":");
  if (k === "go") st.go = true;
  if (k === "country") st.x.country = a;
  if (k === "date") {
    const now = new Date();
    if (a === "soon") { st.x.from = iso(new Date(now.getTime() + 3 * 864e5)); st.x.to = iso(new Date(now.getTime() + 17 * 864e5)); }
    else { const m = +a.slice(1), y = now.getFullYear() + (m < now.getMonth() ? 1 : 0); const first = m === now.getMonth() ? new Date(now.getTime() + 2 * 864e5) : new Date(Date.UTC(y, m, 1)); st.x.from = iso(first); st.x.to = iso(new Date(Date.UTC(y, m + 1, 0))); }
  }
  if (k === "n") st.x.n = +a;
  if (k === "pax") { st.x.adults = +a; st.x.kids = +b; }
  if (k === "stars") st.x.stars = +a;
  if (k === "meal") st.x.meal = a === "0" ? "" : a;
}
const CHOSEN = { country: (st) => COUNTRY_UZ[st.x.country] || st.x.country, date: (st) => st.x.from ? `${ddUz(st.x.from)} – ${ddUz(st.x.to)}` : "", nights: (st) => st.x.n + " kecha", adults: (st) => `${st.x.adults} katta${st.x.kids ? " + " + st.x.kids + " bola" : ""}`, stars: (st) => st.x.stars ? st.x.stars + "★" : "farqi yo'q", meal: (st) => st.x.meal ? MEAL_UZ[st.x.meal] : "farqi yo'q" };

// Saqlangan natijani yangi filtr bilan qayta saralash (operatorlarga qayta so'rov yubormasdan)
function refilter(res, q) {
  let rows = (res.pre || []).slice();
  if (q.stars) rows = rows.filter(r => (r.stars || 0) >= +q.stars);
  if (q.meal) rows = rows.filter(r => r.meal === q.meal || (q.meal === "AI" && r.meal === "UAI"));
  if (q.budget) rows = rows.filter(r => r.sale <= +q.budget);
  rows.sort((a, b) => a.price - b.price);
  return { ...res, rows, so_rov: { ...res.so_rov, stars: q.stars || "", meal: q.meal || "", budget: q.budget || "" }, whenComplete: null, lateOps: null, cached: false };
}

// ---------------- Bot mantiqi (Telegram'dan mustaqil, io orqali) ----------------
// io: { send(chat, text, kb?) -> message_id, album(chat, [{url, caption}]), edit(chat, id, text, kb?) }
export function createBrain(io, opts = {}) {
  const S = new Map();        // chat -> wizard holati
  const R = new Map();        // chat -> oxirgi natija { res, q, blocks }
  const busy = new Set();
  const MK = new Map(); // chat -> qo'lda ustama kutilyapti { a, c }
  const PER_OP = +(process.env.BOT_PER_OPERATOR || opts.perOp || 3);

  async function ask(chat, st) {
    const nq = nextQuestion(st);
    if (!nq) { S.delete(chat); return search(chat, buildQ(st), st.at); }
    st.wait = nq.key;
    st.msg = await io.send(chat, nq.text, nq.kb);
  }

  const sec = (ms) => ms < 60000 ? `${Math.round(ms / 1000)} soniya` : `${Math.floor(ms / 60000)} daqiqa ${Math.round(ms % 60000 / 1000)} soniya`;

  async function search(chat, q, askedAt) {
    if (busy.has(chat)) return io.send(chat, "Oldingi so'rov hali qidirilyapti, biroz kuting…");
    busy.add(chat);
    const t0 = Date.now();
    let tick;
    try {
      const head = `🔎 Barcha operatorlardan qidiryapman…\n${describe(q)}${q.warn.length ? "\n⚠️ " + q.warn.join("; ") : ""}`;
      const pid = await io.send(chat, head + "\n⏱ 0 soniya");
      // jonli hisoblagich: har 10 soniyada o'tgan vaqt va javob bergan operatorlar soni
      let done = 0, total = 0, found = 0;
      q.onProgress = (d, t, name, n) => { done = d; total = t; found += n; };
      q.deadlineMs = (+process.env.BOT_DEADLINE_SEC || 15) * 1000;
      q.markup = (+process.env.BOT_MARKUP_PERCENT || 0) / 100; // botda asl narx (ustamasiz); ustama mijozga yuborishda tanlanadi
      tick = setInterval(() => { io.edit(chat, pid, `${head}\n⏱ ${sec(Date.now() - t0)} · javob berdi: ${done}/${total || "…"} operator · ${found} variant`).catch(() => {}); }, 10000);
      const res = await runQ(q);
      res.sid = t0 + Math.random();
      clearInterval(tick); tick = null;
      const tSearch = Date.now() - t0;
      io.edit(chat, pid, `${head}\n✅ Qidiruv tugadi: ${sec(tSearch)}`).catch(() => {});
      await present(chat, res, q, t0, tSearch, askedAt);
    } catch (e) {
      await io.send(chat, `Qidiruvda xato: ${e.message || e}\n⏱ ${sec(Date.now() - t0)}`);
    } finally { if (tick) clearInterval(tick); busy.delete(chat); }
  }

  // Natijani ko'rsatish (qidiruvdan keyin yoki filtr tugmasi bosilganda — qayta qidirmasdan)
  async function present(chat, res, q, t0, tSearch, askedAt) {
    const blocks = buildBlocks(res, PER_OP);
    R.set(chat, { res, q, blocks });
    await io.send(chat, (res.widened ? "ℹ️ Aniq sanaga topilmadi — ±2 kun va ±1 kecha bilan qidirildi.\n\n" : "") + overview(res, q) + (tSearch ? `\n\n⏱ Operatorlardan qidiruv: ${sec(tSearch)}` : ""));
    const pax = `${q.adults} katta${q.kids ? " + " + q.kids + " bola" : ""} uchun jami`;
    if (!blocks.length) {
    const h = res.hint || {};
    if (res.whenComplete) waitLate(chat, res, q, t0, pax);
    if (!h.n) return io.send(chat, `Bu sanalarda umuman tur topilmadi — boshqa sana yoki kechalar sonini yozing.\n⏱ ${sec(Date.now() - t0)}`);
    const kb = [];
    if (q.meal) kb.push([btn("🍽 Ovqat farqi yo'q — ko'rsat", "f:meal")]);
    if (q.stars && q.stars > 2) kb.push([btn(`⭐ ${q.stars - 1}★ ham bo'lsin`, "f:stars")]);
    if (q.budget) kb.push([btn("💰 Byudjet chegarasisiz", "f:budget")]);
    if (q.hotel) kb.push([btn("🏨 Boshqa mehmonxonalar ham", "f:hotel")]);
    return io.send(chat, `Tanlovingizga (${[q.stars && q.stars + "★+", q.meal && MEAL_UZ[q.meal], q.budget && "≤ $" + q.budget, q.hotel && "«" + q.hotel + "»"].filter(Boolean).join(", ")}) mos tur yo'q.\nShu sanalarda bor: ovqat — ${h.meals.map(m => MEAL_UZ[m] || m).join(", ")}; yulduz — ${h.stars.filter(Boolean).map(x => x + "★").join(", ")}.\nTugmani bosing — qayta qidirmasdan darhol ko'rsataman.${res.lateOps ? "\n⏳ " + res.lateOps.join(", ") + " hali javob bermadi — mos tur topsa, alohida yuboraman." : ""}\n⏱ ${sec(Date.now() - t0)}`, kb);
    }
    const t1 = Date.now();
    await enrich(blocks);
    const tDet = Date.now() - t1;
    for (const [i, b] of blocks.entries()) await sendBlock(chat, b, i, blocks.length, pax);
    const total2 = Date.now() - t0;
    if (res.whenComplete) waitLate(chat, res, q, t0, pax);
    await io.send(chat, `✅ Hammasi shu.\n⏱ Javob ${sec(total2)}da tayyor bo'ldi: ${tSearch ? "qidiruv " + sec(tSearch) + ", " : ""}rasmlar va reys tafsilotlari ${sec(tDet)}, yuborish ${sec(Math.max(0, total2 - (tSearch || 0) - tDet))}.` +
    (res.cached ? "\n⚡ Bu so'rov 10 daqiqa ichida qidirilgan edi — saqlangan natija ko'rsatildi." : "") +
    (res.lateOps ? `\n⏳ Kechikayotgan operator(lar): ${res.lateOps.join(", ")} — javobi kelishi bilan alohida yuboraman.` : "") +
    (askedAt && askedAt < t0 - 2000 ? `\n🕐 Birinchi xabaringizdan beri: ${sec(Date.now() - askedAt)} (savollarga javob berish bilan).` : "") +
    `\n\nTugmalar: 🔍 batafsil · 📝 mijozga taklif · ➕ shu operatordan ko'proq. Yangi qidiruv — yangi so'rov yozing.`);
  }

  // Kechikkan operatorlar javob berganda — faqat ularning bloklarini qo'shimcha yuboramiz
  async function waitLate(chat, res, q, t0, pax) {
    let full;
    try { full = await Promise.race([res.whenComplete, new Promise((_, no) => setTimeout(() => no(new Error("timeout")), 120000))]); }
    catch { return io.send(chat, `⌛ ${res.lateOps.join(", ")} 2 daqiqada ham javob bermadi — ular hisobga olinmadi.`); }
    const mine = R.get(chat);
    if (!mine || mine.res.sid !== res.sid) return; // menejer allaqachon yangi qidiruv boshlagan
    mine.res.pre = full.pre; // keyingi filtr tugmalari kechikkanlarni ham hisobga olsin
    const lateBlocks = buildBlocks(refilter(full, mine.q), PER_OP).filter(b => res.lateOps.includes(b.opName));
    const st = full.operatorlar.filter(x => res.lateOps.includes(x.op));
    if (!lateBlocks.length) return io.send(chat, `⏳ Kechikkan operator(lar) javob berdi (${sec(Date.now() - t0)}): ${st.map(x => `${x.op} — ${x.n ? "tanlovingizga mos tur yo'q" : x.status}`).join("; ")}.`);
    await enrich(lateBlocks);
    await io.send(chat, `⏳ Kechikib javob berdi (${sec(Date.now() - t0)}): ${lateBlocks.map(b => b.opName).join(", ")}`);
    for (const b of lateBlocks) { mine.blocks.push(b); await sendBlock(chat, b, mine.blocks.length - 1, mine.blocks.length, pax); }
  }

  async function sendBlock(chat, b, i, total, pax) {
    const bi = R.get(chat).blocks.indexOf(b);
    const photos = b.hotels.flatMap((h, k) => photosOf(h, b.hotels.length > 1 ? 2 : 6).map((url, j) => ({ url, caption: j === 0 ? `${k + 1}. ${h.best.hotel} — ${b.opName}` : undefined })));
    if (photos.length) await io.album(chat, photos.slice(0, 10)).catch(() => {});
    const kb = b.hotels.map((h, k) => [btn(`🔍 ${k + 1} batafsil`, `d:${bi}:${k}`), btn(`📝 ${k + 1} mijozga`, `t:${bi}:${k}`), btn("🖼 rasmlar", `r:${bi}:${k}`)]);
    if (b.more.length) kb.push([btn(`➕ ${b.opName}: yana ${Math.min(3, b.more.length)} ta`, `m:${bi}`)]);
    await io.send(chat, operatorText(b, i, total, pax), kb);
  }

  const LIVE = new Map(); // savoldan jonli qidiruvga o'tish uchun matn
  const faqKb = () => { const b = FAQ_MENU.map(x => btn(x.title, "q:" + x.key)); const rows = []; for (let i = 0; i < b.length; i += 2) rows.push(b.slice(i, i + 2)); return rows; };

  async function onText(chat, text) {
    if (/^\/(start|help|yordam)/.test(text)) return io.send(chat, HELP, [[btn("❓ Savollar va javoblar", "q:menu")]]);
    if (/^\/(savol|faq)/.test(text)) return io.send(chat, "❓ Qaysi mavzu bo'yicha?", faqKb());
    // Savollarga javob — faqat turlar bo'yicha, ma'lumot operatorlar saytlaridan
    if (!/^\//.test(text) && !MK.has(chat)) {
      const q0 = parseQuery(text), qc = q0.country;
      const f = faqAnswer(text, qc);
      const ask_ = isQuestion(text);
      const waiting = S.get(chat) && S.get(chat).wait;
      const plainOk = f && ["bron", "viza", "hujjat", "tolov", "bekor", "bot"].includes(f.key) && text.length < 60 && !waiting;
      // 1) umumiy mavzular: viza, bron, hujjat, to'lov, bekor qilish, ovqat turlari…
      if (f && f.key !== "narx" && (qc ? (["viza", "hujjat"].includes(f.key) && (ask_ || plainOk)) : (ask_ || plainOk)))
        return io.send(chat, f.text, [[btn("❓ Boshqa savollar", "q:menu")]]);
      // 2) erkin savol: mehmonxona, narxlar, operatorlar, oxirgi qidiruvdagi reys/bagaj
      if (ask_) {
        const a = await tourAnswer(text, q0, R.get(chat)).catch(e => { console.log("tourAnswer xato:", e.message); return null; });
        if (a && a.offTopic)
          return io.send(chat, "🙂 Men faqat turlar bo'yicha savollarga javob beraman: narxlar, mehmonxonalar, reyslar, viza, hujjatlar, bron.\nMasalan: «Turkiyaga dekabrda tur qancha?», «Rixos Premium Dubai plyaji qanday?», «qaysi operatorlar Xitoyga tur beradi?»", [[btn("❓ Savollar", "q:menu")]]);
        if (a) {
          if (a.photos && a.photos.length) await io.album(chat, a.photos.map((url, j) => ({ url, caption: j === 0 ? a.caption : undefined }))).catch(() => {});
          const kb = [];
          if (a.live && qc) { LIVE.set(chat, text); kb.push([btn("🔎 Jonli qidiruv (hozirgi narxlar)", "s:go")]); }
          kb.push([btn("❓ Boshqa savollar", "q:menu")]);
          return io.send(chat, a.text, kb);
        }
        if (f) return io.send(chat, f.text, [[btn("❓ Boshqa savollar", "q:menu")]]);
        if (!qc && !waiting)
          return io.send(chat, "Bu savolga operatorlar ma'lumotida javob topilmadi. Mavzuni tanlang yoki tur so'rovini yozing (masalan «Turkiya 15 dekabr 7 kecha 2 katta»):", faqKb());
      }
    }
    if (MK.has(chat)) {
      const m = text.replace(",", ".").match(/^\s*(\d+(?:\.\d+)?)\s*(\$|usd|dollar|%)?\s*$/i);
      if (m) {
        const { a, c } = MK.get(chat); MK.delete(chat);
        const L = R.get(chat), b = L && L.blocks[a], h = b && b.hotels[c];
        if (!h) return io.send(chat, "Natija eskirgan — qaytadan qidiring.");
        return sendOffer(chat, b, h, m[2] && m[2] !== "%" ? { usd: +m[1] } : { pct: +m[1] });
      }
      MK.delete(chat);
    }
    let st = S.get(chat);
    // savol kutayotganda boshqa davlat yozilsa — bu yangi so'rov, eskisini tashlaymiz
    if (st && st.wait && st.wait !== "country" && st.wait !== "ages") { const nq = parseQuery(text); if (nq.country && nq.country !== buildQ(st).country) st = null; }
    if (st && st.wait && !/^\//.test(text)) {
      // savolga matn bilan javob — matnga qo'shib qayta tahlil qilamiz
      if (st.wait === "ages") st.x.ages = (text.match(/\d{1,2}/g) || []).map(Number).filter(a => a < 18);
      else st.text += " " + text;
      return ask(chat, st);
    }
    st = { text, x: {}, at: Date.now() };
    S.set(chat, st);
    return ask(chat, st);
  }

  async function onButton(chat, data, msgId) {
    if (data === "s:go") {
      const t = LIVE.get(chat); if (!t) return io.send(chat, "So'rovni qaytadan yozing.");
      const st = { text: t, x: {}, at: Date.now() }; S.set(chat, st); return ask(chat, st);
    }
    if (data.startsWith("q:")) {
      const k = data.slice(2);
      if (k === "menu") return io.send(chat, "❓ Qaysi mavzu bo'yicha?", faqKb());
      const t = faqByKey(k); return t ? io.send(chat, t, [[btn("❓ Boshqa savollar", "q:menu")]]) : null;
    }
    if (data.startsWith("w:")) {
      const st = S.get(chat); if (!st) return io.send(chat, "Bu savol eskirgan — so'rovni qaytadan yozing.");
      const key = st.wait;
      applyChoice(st, data);
      if (msgId && key && CHOSEN[key] && data !== "w:go") await io.edit(chat, msgId, "✅ " + CHOSEN[key](st)).catch(() => {});
      return ask(chat, st);
    }
    const L = R.get(chat); if (!L) return io.send(chat, "Natija eskirgan — so'rovni qaytadan yozing.");
    if (data.startsWith("f:")) {
      const f = data.slice(2), q2 = { ...L.q };
      if (f === "meal") delete q2.meal; if (f === "stars") q2.stars = q2.stars - 1; if (f === "budget") delete q2.budget; if (f === "hotel") delete q2.hotel;
      return present(chat, refilter(L.res, q2), q2, Date.now(), 0);
    }
    const [k, a, c] = data.split(":"), b = L.blocks[+a];
    if (!b) return;
    if (k === "m") {
      const add = b.more.splice(0, 3);
      if (!add.length) return io.send(chat, "Bu operatorda boshqa mehmonxona yo'q.");
      const start = b.hotels.length; b.hotels.push(...add);
      await enrich([{ ...b, hotels: add }]);
      const sub = { ...b, hotels: add };
      const photos = add.flatMap((h, j) => photosOf(h, 2).map((url, x) => ({ url, caption: x === 0 ? `${start + j + 1}. ${h.best.hotel} — ${b.opName}` : undefined })));
      if (photos.length) await io.album(chat, photos.slice(0, 10)).catch(() => {});
      const txt = operatorText(sub, +a, L.blocks.length, `${L.q.adults} katta${L.q.kids ? " + " + L.q.kids + " bola" : ""} uchun jami`).replace(/^(\d)️⃣/gm, (m, n) => `${start + +n}.`);
      const kb = add.map((h, j) => [btn(`🔍 ${start + j + 1} batafsil`, `d:${a}:${start + j}`), btn(`📝 ${start + j + 1} mijozga`, `t:${a}:${start + j}`), btn("🖼 rasmlar", `r:${a}:${start + j}`)]);
      if (b.more.length) kb.push([btn(`➕ ${b.opName}: yana ${Math.min(3, b.more.length)} ta`, `m:${a}`)]);
      return io.send(chat, txt, kb);
    }
    const h = b.hotels[+c]; if (!h) return;
    if (!h.det && !h.info) await enrich([{ hotels: [h] }]);
    if (k === "d") {
      const ph = photosOf(h, 8);
      if (ph.length) await io.album(chat, ph.map((url, j) => ({ url, caption: j === 0 ? h.best.hotel : undefined }))).catch(() => {});
      return io.send(chat, hotelDetailText(b, h), [[btn("📝 Mijozga taklif", `t:${a}:${c}`), btn("🖼 Ko'proq rasm", `r:${a}:${c}`)]]);
    }
    if (k === "r") {
      // Rasmlarning o'zi (havolasiz): katalog + qo'shimcha manbalardan 10 tagacha
      const more = await webPhotos(h.best.hotel, h.best.region, 10).catch(() => []);
      const ph = [...new Set([...photosOf(h, 10), ...more])].slice(0, 10);
      if (!ph.length) return io.send(chat, `📷 ${h.best.hotel} — rasm topilmadi.`);
      return io.album(chat, ph.map((url, j) => ({ url, caption: j === 0 ? `${h.best.hotel} — ${b.opName}` : undefined }))).catch(() => io.send(chat, "📷 Rasmlarni yuklab bo'lmadi, birozdan keyin qayta bosing."));
    }
    if (k === "t") {
      // Avval ustamani so'raymiz
      const kb = [[btn("0% — asl narx", `p:${a}:${c}:0`)], [10, 20, 30, 40, 50].map(x => btn(x + "%", `p:${a}:${c}:${x}`)), [60, 70, 80, 90, 100].map(x => btn(x + "%", `p:${a}:${c}:${x}`)), [btn("✍️ O'zim yozaman (masalan 15 yoki 150$)", `p:${a}:${c}:x`)]];
      return io.send(chat, `💹 ${h.best.hotel} — asl narx ${money(h.best.price)} (${b.opName}).\nMijoz narxiga necha foiz ustama qo'shamiz?`, kb);
    }
    if (k === "p") {
      const v = data.split(":")[3];
      if (v === "x") { MK.set(chat, { a: +a, c: +c }); return io.send(chat, "✍️ Ustamani yozing: foizda (masalan 15) yoki dollarda (masalan 150$)."); }
      return sendOffer(chat, b, h, { pct: +v });
    }
  }

  // Mijozga taklif: avval faqat menejer uchun eslatma (operator, asl narx, foyda), keyin mijozga — rasmlar + matn
  async function sendOffer(chat, b, h, { pct = 0, usd = 0 }) {
    const L = R.get(chat), r = h.best, so = L.res.so_rov;
    const p = usd ? (usd / r.price) * 100 : pct; // dollarda yozilsa — foizga aylantiramiz
    const client = Math.round(r.price * (1 + p / 100)), profit = client - r.price;
    const pax = so.adults + (so.kids || 0);
    await io.send(chat, [`🔒 FAQAT SIZ UCHUN (mijozga yubormang):`, `🏢 Operator: ${b.opName}${r.code ? " · kod: " + r.code : ""}`, `🏨 ${r.hotel} · ${ddUz(r.d)}, ${r.n} kecha · ${r.meal} · ${r.room}`,
      `💵 Asl narx: ${money(r.price)} (jami, ${pax} kishi)`, `📈 Ustama: ${Math.round(p * 10) / 10}% → mijoz narxi ${money(client)}${!so.kids ? ` (1 kishiga ${money(Math.round(client / so.adults))})` : ""}`, `💰 Foyda: ${money(profit)}`, `🪑 Joy: ${r.seats}`].join("\n"));
    const o = clientOffer(h, so, process.env.OFFER_CONTACT || "", p);
    let ph = photosOf(h, 8);
    if (!ph.length) ph = await webPhotos(r.hotel, r.region, 8).catch(() => []);
    await io.send(chat, `👇 MIJOZ UCHUN — ${ph.length ? "rasmlar va matnni" : "matnni"} forward qiling:`);
    if (ph.length) await io.album(chat, ph.map((url, j) => ({ url, caption: j === 0 ? o.caption : undefined }))).catch(() => io.send(chat, o.caption));
    else await io.send(chat, o.caption);
    return io.send(chat, o.text);
  }

  return { onText, onButton, sessions: S, results: R };
}

// Webhook rejimida server shu orqali Telegram xabarlarini botga uzatadi
export let botWebhook = null;

export function startBot(opts = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try { initPhotos(DATA); } catch {}
  const envM = (process.env.TELEGRAM_MANAGERS || "").split(/[,\s]+/).filter(Boolean);
  let M = loadM();
  const isAllowed = (id) => envM.includes(id) || M.owner === id || M.list.includes(id);
  const isOwner = (id) => M.owner ? M.owner === id : envM[0] === id;
  const api = async (m, body) => {
    const r = await fetch(`https://api.telegram.org/bot${token}/${m}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(65000) });
    const j = await r.json();
    if (!j.ok && m !== "getUpdates") console.log("Telegram xatosi:", m, j.description);
    return j;
  };
  const io = {
    async send(chat, text, kb) {
      let id;
      for (let i = 0; i < text.length; i += 3900) {
        const last = i + 3900 >= text.length;
        const j = await api("sendMessage", { chat_id: chat, text: text.slice(i, i + 3900), disable_web_page_preview: true, ...(last && kb ? { reply_markup: { inline_keyboard: kb } } : {}) });
        id = j.result?.message_id;
      }
      return id;
    },
    // Rasmlar: Telegram operator saytidagi rasmni o'zi yuklab ololmaydi (WEBPAGE_CURL_FAILED),
    // shuning uchun server rasmni o'zi yuklab, faylning o'zini Telegramga yuboradi.
    async album(chat, photos) {
      const imgs = (await Promise.all(photos.slice(0, 10).map(async (p) => {
        try {
          const r = await fetch(p.url, { headers: { "User-Agent": "Mozilla/5.0", ...(/fstravel/.test(p.url) ? { Referer: "https://fstravel.com/" } : {}) }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) return null;
          const buf = Buffer.from(await r.arrayBuffer());
          // faqat JPEG/PNG (boshqasi butun albomni buzadi)
          const okType = (buf[0] === 0xff && buf[1] === 0xd8) || (buf[0] === 0x89 && buf[1] === 0x50);
          return buf.length > 1000 && okType ? { ...p, buf } : null;
        } catch { return null; }
      }))).filter(Boolean);
      if (!imgs.length) throw new Error("rasm yuklanmadi");
      // birinchi rasm tushib qolsa ham izoh (caption) yo'qolmasin
      const cap = photos.find(p => p.caption)?.caption;
      if (cap && !imgs.some(p => p.caption)) imgs[0] = { ...imgs[0], caption: cap };
      const fd = new FormData();
      fd.append("chat_id", String(chat));
      let m;
      if (imgs.length === 1) {
        m = "sendPhoto";
        fd.append("photo", new Blob([imgs[0].buf], { type: imgs[0].buf[0] === 0x89 ? "image/png" : "image/jpeg" }), imgs[0].buf[0] === 0x89 ? "p0.png" : "p0.jpg");
        if (imgs[0].caption) fd.append("caption", imgs[0].caption.slice(0, 1000));
      } else {
        m = "sendMediaGroup";
        imgs.forEach((p, i) => fd.append("p" + i, new Blob([p.buf], { type: p.buf[0] === 0x89 ? "image/png" : "image/jpeg" }), `p${i}.${p.buf[0] === 0x89 ? "png" : "jpg"}`));
        fd.append("media", JSON.stringify(imgs.map((p, i) => ({ type: "photo", media: "attach://p" + i, ...(p.caption ? { caption: p.caption.slice(0, 1000) } : {}) }))));
      }
      const r = await fetch(`https://api.telegram.org/bot${token}/${m}`, { method: "POST", body: fd, signal: AbortSignal.timeout(90000) });
      const j = await r.json().catch(() => ({ ok: false, description: "javob o'qilmadi" }));
      if (!j.ok) { console.log("Telegram xatosi:", m, j.description); throw new Error(j.description); }
      return j;
    },
    edit: (chat, id, text, kb) => api("editMessageText", { chat_id: chat, message_id: id, text, ...(kb ? { reply_markup: { inline_keyboard: kb } } : {}) })
  };
  const brain = createBrain(io);

  async function onMessage(msg) {
    const chat = msg.chat.id, from = String(msg.from?.id || ""), text = (msg.text || "").trim();
    if (!text) return;
    console.log(new Date().toISOString(), from, text.slice(0, 120));
    // Hali hech kim yo'q bo'lsa — birinchi /start yozgan odam bot egasi bo'ladi
    if (!envM.length && !M.owner && /^\/start/.test(text)) { M.owner = from; saveM(M); await io.send(chat, "✅ Siz bot egasi sifatida qo'shildingiz.\nMenejer qo'shish: /qosh <ID> (menejer botga yozsa, bot uning ID sini aytadi).\n\n" + HELP); return; }
    if (!isAllowed(from)) { console.log(`   ↳ ruxsat yo'q (ID ${from}). Qo'shish: botga egasi /qosh ${from} yozsin yoki .env TELEGRAM_MANAGERS ga qo'shing`); }
    if (!isAllowed(from)) return io.send(chat, `Ruxsat yo'q. Sizning ID: ${from}\nShu raqamni bot egasiga yuboring — u /qosh ${from} deb qo'shadi.`);
    if (/^\/(qosh|olib|ruxsat)/.test(text)) {
      if (!isOwner(from)) return io.send(chat, "Bu buyruq faqat bot egasi uchun.");
      const id = (text.match(/\d{5,}/) || [])[0];
      if (/^\/qosh/.test(text) && id) { if (!M.list.includes(id)) M.list.push(id); saveM(M); return io.send(chat, `✅ ${id} menejer sifatida qo'shildi.`); }
      if (/^\/olib/.test(text) && id) { M.list = M.list.filter(x => x !== id); saveM(M); return io.send(chat, `${id} olib tashlandi.`); }
      return io.send(chat, "Menejerlar: " + ([...envM, ...M.list].join(", ") || "yo'q") + "\n/qosh <ID> — qo'shish, /olib <ID> — olib tashlash");
    }
    return brain.onText(chat, text);
  }
  async function onCallback(cb) {
    const from = String(cb.from?.id || ""), chat = cb.message?.chat?.id;
    api("answerCallbackQuery", { callback_query_id: cb.id }).catch(() => {});
    console.log(new Date().toISOString(), from, "[tugma]", cb.data);
    if (!chat || !isAllowed(from)) return;
    return brain.onButton(chat, cb.data || "", cb.message.message_id);
  }

  // ---- Webhook rejimi (Render kabi uxlab qoladigan bepul serverlar uchun): Telegram xabarni o'zi serverga yuboradi va uni uyg'otadi
  const secret = crypto.createHash("sha256").update(token).digest("hex").slice(0, 32);
  const handle = (u) => {
    if (u.message) onMessage(u.message).catch(e => console.log("xato:", e.message));
    if (u.callback_query) onCallback(u.callback_query).catch(e => console.log("xato:", e.message));
  };
  const base = (process.env.WEBHOOK_URL || process.env.RENDER_EXTERNAL_URL || "").replace(/\/+$/, "");
  if (base && opts.webhook !== false) {
    botWebhook = { path: "/tg/" + secret, secret, handle };
    (async () => {
      const me = await api("getMe", {}).catch(e => ({ ok: false, description: e.message }));
      if (!me.ok) return console.log(`❌ TOKEN XATO: ${me.description}`);
      const r = await api("setWebhook", { url: base + "/tg/" + secret, secret_token: secret, allowed_updates: ["message", "callback_query"], drop_pending_updates: false });
      api("setMyCommands", { commands: [{ command: "start", description: "Yordam va misollar" }, { command: "savol", description: "Savollar: bron, viza, hujjat, to'lov…" }, { command: "ruxsat", description: "Menejerlar ro'yxati (egasi uchun)" }] }).catch(() => {});
      console.log(r.ok ? `✅ Bot ulandi (webhook): @${me.result.username} → ${base}` : `❌ Webhook o'rnatilmadi: ${r.description}`);
    })();
    return;
  }

  let offset = 0, lastErr = "";
  (async function poll() {
    // 1) Token to'g'rimi? 2) Botga avval webhook (boshqa server) ulangan bo'lsa — o'chiramiz, aks holda xabarlar kelmaydi
    const me = await api("getMe", {}).catch(e => ({ ok: false, description: e.message }));
    if (!me.ok) { console.log(`\n❌ TOKEN XATO: ${me.description}\n   .env dagi TELEGRAM_BOT_TOKEN ni @BotFather dagi token bilan solishtiring (bo'sh joysiz, to'liq).\n`); }
    else console.log(`✅ Bot ulandi: @${me.result.username}  — Telegram'da shu botga yozing.`);
    const wh = await api("getWebhookInfo", {}).catch(() => ({}));
    if (wh.result && wh.result.url && wh.result.url.endsWith("/tg/" + secret)) { await api("deleteWebhook", { drop_pending_updates: false }).catch(() => {}); console.log("ℹ️ Bot avval serverda (webhook) ishlagan edi — endi shu yerda ishlaydi."); }
    else if (wh.result && wh.result.url) {
      // Bu token boshqa xizmatda (webhook) ishlatilyapti — o'zboshimchalik bilan o'chirmaymiz, u xizmat buzilmasin
      if (process.env.BOT_DROP_WEBHOOK === "1") { await api("deleteWebhook", { drop_pending_updates: false }).catch(() => {}); console.log(`ℹ️ Webhook (${wh.result.url}) o'chirildi — endi xabarlar shu yerga keladi.`); }
      else console.log(`\n❌ BU TOKEN BOSHQA XIZMATDA ISHLATILYAPTI (webhook: ${wh.result.url}).\n   Shuning uchun xabarlar bu yerga kelmaydi. Yechim:\n   • Vella uchun ALOHIDA bot yarating: @BotFather → /newbot → yangi tokenni .env ga yozing (tavsiya);\n   • yoki o'sha xizmat kerak bo'lmasa: .env ga BOT_DROP_WEBHOOK=1 qo'shib, qayta ishga tushiring.\n`);
    }
    api("setMyCommands", { commands: [{ command: "start", description: "Yordam va misollar" }, { command: "savol", description: "Savollar: bron, viza, hujjat, to'lov…" }, { command: "ruxsat", description: "Menejerlar ro'yxati (egasi uchun)" }] }).catch(() => {});
    const envInfo = envM.length ? `ruxsat: ${envM.join(", ")}` : M.owner ? `egasi: ${M.owner}` : "egasi hali yo'q — botga birinchi /start yozgan odam egasi bo'ladi";
    console.log(`👥 Menejerlar — ${envInfo}${M.list.length ? ", qo'shilganlar: " + M.list.join(", ") : ""}`);
    for (;;) {
      try {
        const r = await api("getUpdates", { offset, timeout: 50, allowed_updates: ["message", "callback_query"] });
        for (const u of r.result || []) {
          offset = u.update_id + 1;
          if (u.message) onMessage(u.message).catch(e => console.log("xato:", e.message));
          if (u.callback_query) onCallback(u.callback_query).catch(e => console.log("xato:", e.message));
        }
        if (!r.ok) {
          const d = r.description || "";
          if (d !== lastErr) console.log("⚠️ Telegram: " + d + (/Conflict/i.test(d) ? "\n   → Shu bot BOSHQA JOYDA ham ishlab turibdi (boshqa kompyuter, server yoki eski dastur). Bittasini o'chiring." : /Unauthorized|Not Found/i.test(d) ? "\n   → Token noto'g'ri. .env ni tekshiring." : ""));
          lastErr = d;
          await new Promise(s => setTimeout(s, 5000));
        } else lastErr = "";
      } catch (e) {
        if (lastErr !== "net") console.log("⚠️ Internetga ulanib bo'lmadi (api.telegram.org): " + (e.cause?.code || e.message) + " — qayta urinyapman…");
        lastErr = "net";
        await new Promise(s => setTimeout(s, 3000));
      }
    }
  })();
  console.log("Telegram menejer bot ishga tushdi");
}

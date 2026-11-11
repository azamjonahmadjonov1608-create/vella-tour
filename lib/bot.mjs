// Menejerlar uchun Telegram bot: oddiy matn bilan tur so'raladi, bot barcha operatorlardan
// qidirib, solishtirish jadvali va mijozga yuborishga tayyor taklifni qaytaradi.
//   .env: TELEGRAM_BOT_TOKEN, TELEGRAM_MANAGERS=123456,789012 (ruxsat berilgan Telegram ID lar)
import { parseQuery } from "./parse.mjs";
import { searchTours, managerText, clientText, defaultPicks, MEAL_UZ, ddUz } from "./tur.mjs";
import { COUNTRY_UZ } from "./operators.mjs";
import fs from "node:fs";

// Ruxsat berilgan menejerlar: .env dagi TELEGRAM_MANAGERS + data/managers.json (bot orqali qo'shiladi)
const MFILE = new URL("../data/managers.json", import.meta.url).pathname;
const loadM = () => { try { return JSON.parse(fs.readFileSync(MFILE, "utf8")); } catch { return { owner: "", list: [] }; } };
const saveM = (m) => { fs.mkdirSync(MFILE.replace(/[^/]+$/, ""), { recursive: true }); fs.writeFileSync(MFILE, JSON.stringify(m, null, 1)); };
import { hotelInfo } from "./hotelinfo.mjs";
import { tourDetails, detailsLines, clientDetails } from "./details.mjs";
import { bestOf } from "./tur.mjs";

const HELP = `Tur so'rovini oddiy matn bilan yozing, masalan:

• Turkiya, 15–20 dekabr, 7 kecha, 2 katta + 1 bola 6 yosh, 4 yulduz, hammasi kiritilgan
• Vyetnam 8 kunlik 5 dekabrdan 2 kishi
• Dubay 10.01–17.01 2 katta "Rixos"
• Misr dekabr 7 kecha nonushta 1500$ gacha

Javobda: operatorlar narxlari solishtirilgan ro'yxat (faqat sizga) va mijozga yuboriladigan tayyor taklif.
Boshqa mehmonxonalarni taklifga qo'yish: /taklif 2 5 7 (ro'yxatdagi raqamlar).`;

export function describe(q) {
  return [q.country && `${COUNTRY_UZ[q.country] || q.country}`, q.city && `shahar: ${q.city.split("|")[0]}`, `uchish: ${ddUz(q.from)}${q.to !== q.from ? " – " + ddUz(q.to) : ""}`,
    `${q.n1}${q.n2 !== q.n1 ? "–" + q.n2 : ""} kecha`, `${q.adults} katta${q.kids ? " + " + q.kids + " bola" + (q.ages?.length ? " (" + q.ages.join(", ") + " yosh)" : "") : ""}`,
    q.stars && `${q.stars}★+`, q.meal && MEAL_UZ[q.meal], q.budget && `≤ $${q.budget}`, q.hotel && `«${q.hotel}»`].filter(Boolean).join(" · ");
}

// Qidiruv: aniq sana bo'yicha topilmasa ±3 kunga kengaytiradi
export async function runQuery(text) {
  const q = parseQuery(text);
  if (!q.country) return { q, error: "Mamlakatni tushunmadim. Masalan: «Turkiya 15–20 dekabr 7 kecha 2 katta»" };
  let res = await searchTours(q);
  if (!res.top.length) {
    const w = { ...q, from: new Date(Date.parse(q.from) - 2 * 864e5).toISOString().slice(0, 10), to: new Date(Date.parse(q.to) + 2 * 864e5).toISOString().slice(0, 10), n1: Math.max(1, q.n1 - 1), n2: q.n2 + 1 };
    const r2 = await searchTours(w);
    if (r2.top.length) { res = r2; res.widened = true; }
  }
  return { q, res };
}

export async function offerFor(res, picks) {
  const [infos, dets] = await Promise.all([
    Promise.all(picks.map(i => hotelInfo(res.top[i]?.hid))),
    Promise.all(picks.map(i => res.top[i] ? tourDetails(bestOf(res.top[i])).catch(() => null) : null))]);
  const details = dets.map((d, k) => clientDetails(d, res.top[picks[k]] && bestOf(res.top[picks[k]])));
  return { picks, infos, dets, details, text: clientText(res, picks, { facts: infos.map(x => x.uz), details, contact: process.env.OFFER_CONTACT || "" }) };
}

// Menejer ro'yxatidagi birinchi n ta mehmonxona uchun to'liq tarkib (reyslar, joylar, transfer, sug'urta)
export async function managerDetails(res, n = 5) {
  const det = {};
  await Promise.all(res.top.slice(0, n).map(async (g, i) => { try { det[i] = detailsLines(await tourDetails(bestOf(g)), { manager: true }); } catch {} }));
  return det;
}

export function startBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const envM = (process.env.TELEGRAM_MANAGERS || "").split(/[,\s]+/).filter(Boolean);
  let M = loadM();
  const isAllowed = (id) => envM.includes(id) || M.owner === id || M.list.includes(id);
  const isOwner = (id) => M.owner ? M.owner === id : envM[0] === id;
  const api = async (m, body) => {
    const r = await fetch(`https://api.telegram.org/bot${token}/${m}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(65000) });
    return r.json();
  };
  const say = async (chat, text, extra = {}) => { for (let i = 0; i < text.length; i += 3900) await api("sendMessage", { chat_id: chat, text: text.slice(i, i + 3900), disable_web_page_preview: true, ...extra }); };
  const last = new Map();
  const busy = new Set();

  async function sendOffer(chat, res, picks) {
    const o = await offerFor(res, picks);
    const media = o.infos.map((inf, k) => inf.photos[0] && { type: "photo", media: inf.photos[0], caption: `${k + 1}. ${res.top[picks[k]].hotel}` }).filter(Boolean);
    if (media.length > 1) await api("sendMediaGroup", { chat_id: chat, media });
    else if (media.length === 1) await api("sendPhoto", { chat_id: chat, photo: media[0].media, caption: media[0].caption });
    await say(chat, "👇 Mijozga yuborish uchun (forward qiling):");
    await say(chat, o.text);
  }

  async function onMessage(msg) {
    const chat = msg.chat.id, from = String(msg.from?.id || ""), text = (msg.text || "").trim();
    if (!text) return;
    console.log(new Date().toISOString(), from, text.slice(0, 120));
    // Hali hech kim yo'q bo'lsa — birinchi /start yozgan odam bot egasi bo'ladi
    if (!envM.length && !M.owner && /^\/start/.test(text)) { M.owner = from; saveM(M); await say(chat, "✅ Siz bot egasi sifatida qo'shildingiz.\nMenejer qo'shish: /qosh <ID> (menejer botga yozsa, bot uning ID sini aytadi).\n\n" + HELP); return; }
    if (!isAllowed(from)) return say(chat, `Ruxsat yo'q. Sizning ID: ${from}\nShu raqamni bot egasiga yuboring — u /qosh ${from} deb qo'shadi.`);
    if (/^\/(qosh|olib|ruxsat)/.test(text)) {
      if (!isOwner(from)) return say(chat, "Bu buyruq faqat bot egasi uchun.");
      const id = (text.match(/\d{5,}/) || [])[0];
      if (/^\/qosh/.test(text) && id) { if (!M.list.includes(id)) M.list.push(id); saveM(M); return say(chat, `✅ ${id} menejer sifatida qo'shildi.`); }
      if (/^\/olib/.test(text) && id) { M.list = M.list.filter(x => x !== id); saveM(M); return say(chat, `${id} olib tashlandi.`); }
      return say(chat, "Menejerlar: " + ([...envM, ...M.list].join(", ") || "yo'q") + "\n/qosh <ID> — qo'shish, /olib <ID> — olib tashlash");
    }
    if (/^\/(start|help|yordam)/.test(text)) return say(chat, HELP);
    if (/^\/taklif/.test(text)) {
      const L = last.get(chat); if (!L) return say(chat, "Avval tur so'rovini yozing.");
      const picks = (text.match(/\d+/g) || []).map(n => +n - 1).filter(i => L.top[i]).slice(0, 5);
      return picks.length ? sendOffer(chat, L, picks) : say(chat, "Raqamlarni yozing, masalan: /taklif 1 4 6");
    }
    if (busy.has(chat)) return say(chat, "Oldingi so'rov hali qidirilyapti, biroz kuting…");
    busy.add(chat);
    try {
      const q0 = parseQuery(text);
      if (!q0.country) return say(chat, "Mamlakatni tushunmadim.\n\n" + HELP);
      await say(chat, `🔎 Qidiryapman (30–60 soniya)…\n${describe(q0)}${q0.warn.length ? "\n⚠️ " + q0.warn.join("; ") : ""}`);
      const { res } = await runQuery(text);
      last.set(chat, res);
      const det = res.top.length ? await managerDetails(res, 5) : {};
      await say(chat, (res.widened ? "ℹ️ Aniq sanaga topilmadi — ±2 kun va ±1 kecha bilan qidirildi.\n\n" : "") + managerText(res, 8, det));
      if (res.top.length) await sendOffer(chat, res, defaultPicks(res));
    } catch (e) {
      await say(chat, "Qidiruvda xato: " + (e.message || e));
    } finally { busy.delete(chat); }
  }

  api("setMyCommands", { commands: [{ command: "start", description: "Yordam va misollar" }, { command: "taklif", description: "Ro'yxatdagi raqamlardan taklif: /taklif 2 5 7" }, { command: "ruxsat", description: "Menejerlar ro'yxati (egasi uchun)" }] }).catch(() => {});
  let offset = 0;
  (async function poll() {
    for (;;) {
      try {
        const r = await api("getUpdates", { offset, timeout: 50, allowed_updates: ["message"] });
        for (const u of r.result || []) { offset = u.update_id + 1; if (u.message) onMessage(u.message).catch(() => {}); }
        if (!r.ok) await new Promise(s => setTimeout(s, 5000));
      } catch { await new Promise(s => setTimeout(s, 3000)); }
    }
  })();
  console.log("Telegram menejer bot ishga tushdi");
}

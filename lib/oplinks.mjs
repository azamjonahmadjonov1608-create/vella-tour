// Operator saytiga havolalar: tur qidiruv sahifasi (shu sana/kecha/mehmonxona bilan) va bron sahifasi (aynan shu tur — CATCLAIM).
// Bron sahifasi operator kabinetiga kirishni so'raydi — kirgandan keyin aynan shu tur tanlangan holda ochiladi.
import { OPERATORS } from "./operators.mjs";
import { getMeta, normCountry } from "./samo.mjs";

const opOf = (k) => OPERATORS.find(o => o.key === k || o.name === k);
const ymd = (d) => { d = String(d || ""); return /^\d{2}\.\d{2}\.\d{4}$/.test(d) ? d.split(".").reverse().join("") : d.replace(/-/g, "").slice(0, 8); };

// r: qidiruv qatori (op, claim, st, tf, date|d, nights|n, hk)
export function bronUrl(r) {
  const o = opOf(r.op || r.opKey); if (!o || !r.claim) return null;
  return `${o.base}/bron?CATCLAIM=${encodeURIComponent(r.claim)}`;
}

// range: true — butun so'rov oralig'i (operator bo'limidagi barcha turlar), aks holda aynan shu tur (sana, kecha, mehmonxona)
export function rowSearchUrl(r, so = {}, { range = false } = {}) {
  const o = opOf(r.op || r.opKey); if (!o) return null;
  const d = ymd(r.date || r.d), n = parseInt(r.nights || r.n) || so.n1 || 7;
  const p = new URLSearchParams({ TOWNFROMINC: r.tf || "", STATEINC: r.st || "",
    CHECKIN_BEG: range && so.from ? ymd(so.from) : d, CHECKIN_END: range && so.to ? ymd(so.to) : d,
    NIGHTS_FROM: range && so.n1 ? so.n1 : n, NIGHTS_TILL: range && so.n2 ? so.n2 : n, ADULT: so.adults || 2, CHILD: so.kids || 0, CURRENCY: r.curId || "2", DOLOAD: 1 });
  (so.ages || []).slice(0, so.kids || 0).forEach((a, i) => p.set("AGE" + (i + 1), a));
  if (r.hk && !range) p.set("HOTELS", r.hk);
  return `${o.base}/search_tour?${p}`;
}

// Davlat bo'yicha qidiruv sahifasi (operator ID larini o'zidan oladi)
export async function countrySearchUrl(opKey, { country, from, to, n1, n2, adults = 2, kids = 0 }) {
  const o = opOf(opKey); if (!o) return null;
  try {
    const m = await getMeta(o);
    const st = m.states[normCountry(country)];
    if (!st) return o.base + "/search_tour";
    const p = new URLSearchParams({ TOWNFROMINC: m.tas, STATEINC: st, ADULT: adults, CHILD: kids, CURRENCY: m.currency || "2", DOLOAD: 1 });
    if (from) { p.set("CHECKIN_BEG", ymd(from)); p.set("CHECKIN_END", ymd(to || from)); }
    if (n1) { p.set("NIGHTS_FROM", n1); p.set("NIGHTS_TILL", n2 || n1); }
    return `${o.base}/search_tour?${p}`;
  } catch { return o.base + "/search_tour"; }
}

export const opBase = (k) => (opOf(k) || {}).base || null;

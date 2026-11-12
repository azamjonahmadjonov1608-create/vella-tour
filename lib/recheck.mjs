// To'lovdan oldin jonli tekshiruv: mijoz tanlagan aynan o'sha paketni operatordan qayta so'raydi.
// Natija: { status: "ok" | "price_changed" | "sold_out" | "error", fresh?, alternatives? }
import { searchOperator } from "./samo.mjs";
import { normName } from "./photos.mjs";

const iso = (d) => d.split(".").reverse().join("-"); // 21.11.2026 -> 2026-11-21
const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

// r — samo.mjs dagi natija qatori, q — asl qidiruv parametrlari, op — operator obyekti
export async function recheck(op, r, q) {
  const day = iso(r.date), n = parseInt(r.nights);
  let v;
  try {
    v = await searchOperator(op, { ...q, dateFrom: day, dateTo: day, nightsMin: n, nightsMax: n, timeoutMs: 25000 });
  } catch (e) {
    return { status: "error", error: String(e.message || e) };
  }
  const rows = v.results.filter(x => x.currency === r.currency && x.seats !== "yo'q");
  const same = (x) => normName(x.hotel) === normName(r.hotel) && norm(x.room) === norm(r.room) && x.meal === r.meal && x.date === r.date && parseInt(x.nights) === n;
  const match = rows.filter(same).sort((a, b) => a.price - b.price)[0];
  if (match) return { status: match.price === r.price ? "ok" : "price_changed", fresh: match };
  // Joy qolmagan — o'sha kun/kechadagi eng arzon 3 ta boshqa mehmonxona
  const seen = new Set(), alternatives = [];
  for (const x of rows.sort((a, b) => a.price - b.price)) {
    const k = normName(x.hotel);
    if (seen.has(k)) continue;
    seen.add(k); alternatives.push(x);
    if (alternatives.length === 3) break;
  }
  return { status: "sold_out", alternatives };
}

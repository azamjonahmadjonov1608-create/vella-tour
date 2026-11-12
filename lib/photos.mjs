// Mehmonxona rasmlari: Fun&Sun katalogidan (fstravel.com/hotel/<id>) olinadi va keshlanadi.
// Boshqa operatorlardagi bir xil mehmonxonalar nomi bo'yicha shu rasmga bog'lanadi.
import fs from "node:fs";
import path from "node:path";

let FILE, db = { byId: {}, nameToId: {} };
const pending = new Map();
export function initPhotos(dir) {
  FILE = path.join(dir, "photos.json");
  try { db = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch {}
}
let saveTimer;
const save = () => { if (!FILE) return; clearTimeout(saveTimer); saveTimer = setTimeout(() => fs.writeFile(FILE, JSON.stringify(db), () => {}), 2000); };

export const normName = (s) => String(s || "").toLowerCase().replace(/\(.*?\)/g, " ").replace(/\d\s*\*|\*+|hotel|отель|resort|&|spa/g, " ").replace(/[^a-zа-я0-9]+/g, " ").trim();

// Qidiruv natijalaridan nom -> Fun&Sun hotel ID xaritasini to'ldiradi
export function learn(results) {
  let changed = false;
  for (const r of results) if (r.hid) { const n = normName(r.hotel); if (n && db.nameToId[n] !== r.hid) { db.nameToId[n] = r.hid; changed = true; } }
  if (changed) save();
}
export const idFor = (r) => r.hid || db.nameToId[normName(r.hotel)] || "";

async function fetchPhotos(id) {
  const r = await fetch("https://fstravel.com/hotel/" + id, { headers: { "User-Agent": "Mozilla/5.0" }, redirect: "follow", signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const html = await r.text();
  const urls = [...new Set(html.match(/https:\/\/apigate-tui\.fstravel\.com\/api\/geocontent\/static\/[^"'\s)]+?\.(?:jpe?g|webp|png)/g) || [])];
  const main = urls.find(u => /MainPhoto/.test(u)) || urls[0] || "";
  // kichikroq (s600) versiyani afzal ko'ramiz
  const small = main && !/\/s600\//.test(main) ? main.replace("/static/hotel/", "/static/s600/hotel/") : main;
  return { main: small, gallery: urls.filter(u => /\/s600\//.test(u)).slice(0, 8), at: Date.now() };
}

export async function photoFor(id) {
  if (!/^\d+$/.test(id || "")) return null;
  const c = db.byId[id];
  if (c && Date.now() - c.at < 30 * 86400000) return c;
  if (!pending.has(id)) pending.set(id, fetchPhotos(id).then(p => { db.byId[id] = p; save(); return p; }).finally(() => pending.delete(id)));
  return pending.get(id);
}

// Buyurtmalar: oddiy fayl bazasi (data/orders.json). Kichik agentlik uchun yetarli.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

let FILE, db = { seq: 1000, list: [] };
export function initOrders(dir) {
  fs.mkdirSync(dir, { recursive: true });
  FILE = path.join(dir, "orders.json");
  try { db = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch {}
}
const save = () => { if (FILE) fs.writeFileSync(FILE, JSON.stringify(db, null, 1)); };

export function createOrder(data) {
  const o = { id: String(++db.seq), key: crypto.randomBytes(6).toString("hex"), status: "new", createdAt: new Date().toISOString(), docs: [], ...data };
  db.list.unshift(o); save();
  return o;
}
export const getOrder = (id) => db.list.find(o => o.id === String(id));
export function updateOrder(id, patch) {
  const o = getOrder(id); if (!o) return null;
  Object.assign(o, patch, { updatedAt: new Date().toISOString() }); save();
  return o;
}
export const allOrders = () => db.list;
// Mijozga ko'rinadigan qism (operator nomi, operator narxi, pasportlar ko'rinmaydi)
export const publicOrder = (o) => ({ id: o.id, status: o.status, createdAt: o.createdAt, priceUsd: o.priceUsd, amountUzs: o.amountUzs,
  hotel: o.pkg?.hotel, region: o.pkg?.region, date: o.pkg?.date, nights: o.pkg?.nights, meal: o.pkg?.meal, room: o.pkg?.room,
  tourists: (o.tourists || []).map(t => `${t.last} ${t.first}`), docs: o.docs || [] });

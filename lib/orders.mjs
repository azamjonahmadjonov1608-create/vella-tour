// Buyurtmalar: oddiy JSON fayl bazasi (data/orders.json)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

let FILE, orders = {};
export function initOrders(dir) {
  fs.mkdirSync(dir, { recursive: true });
  FILE = path.join(dir, "orders.json");
  try { orders = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { orders = {}; }
}
function save() {
  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(orders, null, 1));
  fs.renameSync(tmp, FILE);
}
export const getOrder = (id) => orders[String(id)] || null;
export const allOrders = () => Object.values(orders).sort((a, b) => b.createdAt - a.createdAt);

export function createOrder(data) {
  let id;
  do { id = String(100000 + crypto.randomInt(900000)); } while (orders[id]);
  const o = { id, createdAt: Date.now(), status: "new", history: [{ at: Date.now(), status: "new" }], docs: [], payment: null, ...data };
  orders[id] = o; save();
  return o;
}
export function updateOrder(id, patch) {
  const o = orders[String(id)]; if (!o) return null;
  if (patch.status && patch.status !== o.status) o.history.push({ at: Date.now(), status: patch.status });
  Object.assign(o, patch); save();
  return o;
}

// Mijozga ko'rsatiladigan qism (pasport ma'lumotlarisiz)
export const publicOrder = (o) => o && ({
  id: o.id, status: o.status, createdAt: o.createdAt, amountUzs: o.amountUzs, priceUsd: o.priceUsd,
  pkg: { hotel: o.pkg.hotel, region: o.pkg.region, date: o.pkg.date, nights: o.pkg.nights, meal: o.pkg.meal, room: o.pkg.room },
  tourists: o.tourists.length, docs: o.docs
});

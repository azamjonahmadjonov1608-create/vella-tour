// Payme (Merchant API) va Click (SHOP API) integratsiyasi
import crypto from "node:crypto";
import { getOrder, updateOrder, allOrders } from "./orders.mjs";

const env = (k) => process.env[k] || "";
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
const TX_TIMEOUT = 12 * 3600 * 1000;

// ---------- Kurs (CBU) ----------
let rate = { at: 0, v: 0 };
export async function usdRate() {
  if (+env("USD_RATE")) return +env("USD_RATE");
  if (rate.v && Date.now() - rate.at < 3 * 3600 * 1000) return rate.v;
  try {
    const r = await fetch("https://cbu.uz/uz/arkhiv-kursov-valyut/json/USD/");
    const j = await r.json(); const v = parseFloat(j[0].Rate);
    if (v > 1000) rate = { at: Date.now(), v };
  } catch {}
  if (!rate.v) throw new Error("USD kursini olib bo'lmadi — .env da USD_RATE yozing");
  return rate.v;
}

// ---------- To'lov havolalari ----------
export function paymentLinks(order, returnUrl) {
  const links = {};
  if (env("PAYME_MERCHANT_ID")) {
    const params = `m=${env("PAYME_MERCHANT_ID")};ac.order_id=${order.id};a=${order.amountUzs * 100};c=${returnUrl}`;
    const host = env("PAYME_TEST") === "1" ? "https://test.paycom.uz" : "https://checkout.paycom.uz";
    links.payme = host + "/" + Buffer.from(params).toString("base64");
  }
  if (env("CLICK_SERVICE_ID") && env("CLICK_MERCHANT_ID")) {
    const q = new URLSearchParams({ service_id: env("CLICK_SERVICE_ID"), merchant_id: env("CLICK_MERCHANT_ID"), amount: String(order.amountUzs), transaction_param: order.id, return_url: returnUrl });
    links.click = "https://my.click.uz/services/pay?" + q;
  }
  return links;
}

// ---------- PAYME ----------
const PE = {
  auth: [-32504, "Avtorizatsiya xatosi"], method: [-32601, "Metod topilmadi"], parse: [-32700, "JSON xatosi"],
  amount: [-31001, "Noto'g'ri summa"], noTx: [-31003, "Tranzaksiya topilmadi"], cant: [-31008, "Amalni bajarib bo'lmaydi"],
  noOrder: [-31050, "Buyurtma topilmadi"], busy: [-31051, "Buyurtma boshqa tranzaksiyada"], paidCancel: [-31007, "To'langan buyurtmani bekor qilib bo'lmaydi"]
};
const perr = (id, [code, uz], data) => ({ jsonrpc: "2.0", id, error: { code, message: { uz, ru: uz, en: uz }, data } });

function txOf(paymeId) {
  for (const o of allOrders()) if (o.payment && o.payment.provider === "payme" && o.payment.id === paymeId) return o;
  return null;
}
const txView = (o) => ({ create_time: o.payment.create_time, perform_time: o.payment.perform_time || 0, cancel_time: o.payment.cancel_time || 0, transaction: o.id, state: o.payment.state, reason: o.payment.reason ?? null });

export function paymeHandler(authHeader, body, onPaid) {
  const id = body && body.id;
  const key = env("PAYME_TEST") === "1" ? env("PAYME_TEST_KEY") : env("PAYME_KEY");
  const expected = "Basic " + Buffer.from("Paycom:" + key).toString("base64");
  if (!key || authHeader !== expected) return perr(id, PE.auth);
  const { method, params = {} } = body;
  const checkOrder = () => {
    const o = getOrder(params.account && params.account.order_id);
    if (!o) return [null, perr(id, PE.noOrder, "order_id")];
    if (+params.amount !== o.amountUzs * 100) return [null, perr(id, PE.amount)];
    if (o.status !== "new") return [null, perr(id, PE.cant)];
    return [o, null];
  };
  switch (method) {
    case "CheckPerformTransaction": {
      const [, e] = checkOrder(); if (e) return e;
      return { jsonrpc: "2.0", id, result: { allow: true } };
    }
    case "CreateTransaction": {
      const ex = txOf(params.id);
      if (ex) {
        if (ex.payment.state !== 1) return perr(id, PE.cant);
        if (Date.now() - ex.payment.create_time > TX_TIMEOUT) {
          updateOrder(ex.id, { payment: { ...ex.payment, state: -1, reason: 4, cancel_time: Date.now() } });
          return perr(id, PE.cant);
        }
        return { jsonrpc: "2.0", id, result: { create_time: ex.payment.create_time, transaction: ex.id, state: 1 } };
      }
      const [o, e] = checkOrder(); if (e) return e;
      if (o.payment && o.payment.state === 1) return perr(id, PE.busy, "order_id");
      updateOrder(o.id, { payment: { provider: "payme", id: params.id, time: params.time, create_time: Date.now(), state: 1 } });
      return { jsonrpc: "2.0", id, result: { create_time: getOrder(o.id).payment.create_time, transaction: o.id, state: 1 } };
    }
    case "PerformTransaction": {
      const o = txOf(params.id); if (!o) return perr(id, PE.noTx);
      if (o.payment.state === 2) return { jsonrpc: "2.0", id, result: { transaction: o.id, perform_time: o.payment.perform_time, state: 2 } };
      if (o.payment.state !== 1) return perr(id, PE.cant);
      if (Date.now() - o.payment.create_time > TX_TIMEOUT) {
        updateOrder(o.id, { payment: { ...o.payment, state: -1, reason: 4, cancel_time: Date.now() } });
        return perr(id, PE.cant);
      }
      const t = Date.now();
      updateOrder(o.id, { status: "paid", payment: { ...o.payment, state: 2, perform_time: t } });
      onPaid(getOrder(o.id));
      return { jsonrpc: "2.0", id, result: { transaction: o.id, perform_time: t, state: 2 } };
    }
    case "CancelTransaction": {
      const o = txOf(params.id); if (!o) return perr(id, PE.noTx);
      const p = o.payment;
      if (p.state === 1) updateOrder(o.id, { payment: { ...p, state: -1, reason: params.reason, cancel_time: Date.now() } });
      else if (p.state === 2) {
        if (["booked", "docs"].includes(o.status)) return perr(id, PE.paidCancel);
        updateOrder(o.id, { status: "cancelled", payment: { ...p, state: -2, reason: params.reason, cancel_time: Date.now() } });
      }
      const q = getOrder(o.id).payment;
      return { jsonrpc: "2.0", id, result: { transaction: o.id, cancel_time: q.cancel_time, state: q.state } };
    }
    case "CheckTransaction": {
      const o = txOf(params.id); if (!o) return perr(id, PE.noTx);
      return { jsonrpc: "2.0", id, result: txView(o) };
    }
    case "GetStatement": {
      const list = allOrders().filter(o => o.payment && o.payment.provider === "payme" && o.payment.create_time >= params.from && o.payment.create_time <= params.to)
        .map(o => ({ id: o.payment.id, time: o.payment.time, amount: o.amountUzs * 100, account: { order_id: o.id }, ...txView(o) }));
      return { jsonrpc: "2.0", id, result: { transactions: list } };
    }
    default: return perr(id, PE.method);
  }
}

// ---------- CLICK ----------
export function clickHandler(stage, f, onPaid) {
  const SECRET = env("CLICK_SECRET_KEY");
  const base = { click_trans_id: f.click_trans_id, merchant_trans_id: f.merchant_trans_id };
  const err = (error, error_note) => ({ ...base, error, error_note });
  const signSrc = stage === "prepare"
    ? f.click_trans_id + f.service_id + SECRET + f.merchant_trans_id + f.amount + f.action + f.sign_time
    : f.click_trans_id + f.service_id + SECRET + f.merchant_trans_id + f.merchant_prepare_id + f.amount + f.action + f.sign_time;
  if (!SECRET || md5(signSrc) !== f.sign_string) return err(-1, "SIGN CHECK FAILED");
  const o = getOrder(f.merchant_trans_id);
  if (!o) return err(-5, "Order not found");
  if (Math.abs(parseFloat(f.amount) - o.amountUzs) > 0.01) return err(-2, "Incorrect amount");
  if (stage === "prepare") {
    if (o.status !== "new") return err(o.status === "cancelled" ? -9 : -4, "Already paid or cancelled");
    updateOrder(o.id, { payment: { provider: "click", id: f.click_trans_id, create_time: Date.now(), state: 1 } });
    return { ...base, merchant_prepare_id: o.id, error: 0, error_note: "Success" };
  }
  // complete
  if (String(f.merchant_prepare_id) !== o.id) return err(-6, "Transaction not found");
  if (o.status !== "new") return o.status === "cancelled" ? err(-9, "Cancelled") : err(-4, "Already paid");
  if (+f.error < 0) { updateOrder(o.id, { status: "cancelled", payment: { ...o.payment, state: -1, cancel_time: Date.now() } }); return err(-9, "Cancelled"); }
  updateOrder(o.id, { status: "paid", payment: { ...o.payment, state: 2, perform_time: Date.now() } });
  onPaid(getOrder(o.id));
  return { ...base, merchant_confirm_id: o.id, error: 0, error_note: "Success" };
}

// To'lov: dollar kursi (O'zbekiston Markaziy banki) va to'lov havolalari.
// Payme / Click kalitlari .env ga yozilmaguncha onlayn to'lov o'chiq — sayt buyurtmani ariza sifatida Telegramga yuboradi.
let rate = { v: 0, at: 0 };
export async function usdRate() {
  if (rate.v && Date.now() - rate.at < 3 * 3600e3) return rate.v;
  try {
    const r = await fetch("https://cbu.uz/uz/arkhiv-kursov-valyut/json/USD/", { signal: AbortSignal.timeout(15000) });
    const j = await r.json(); const v = parseFloat(String(j[0].Rate).replace(",", "."));
    if (v > 1000) rate = { v, at: Date.now() };
  } catch {}
  return rate.v || +(process.env.USD_RATE || 12800);
}

export const paymentsEnabled = () => !!(process.env.PAYME_MERCHANT_ID || process.env.CLICK_SERVICE_ID);

export function paymentLinks(o, back) {
  const links = {};
  if (process.env.PAYME_MERCHANT_ID) {
    const p = `m=${process.env.PAYME_MERCHANT_ID};ac.order_id=${o.id};a=${o.amountUzs * 100};c=${back}`;
    links.payme = "https://checkout.paycom.uz/" + Buffer.from(p).toString("base64");
  }
  if (process.env.CLICK_SERVICE_ID && process.env.CLICK_MERCHANT_ID)
    links.click = `https://my.click.uz/services/pay?service_id=${process.env.CLICK_SERVICE_ID}&merchant_id=${process.env.CLICK_MERCHANT_ID}&amount=${o.amountUzs}&transaction_param=${o.id}&return_url=${encodeURIComponent(back)}`;
  return links;
}

// Payme / Click serverdan-serverga xabarlari — kalitlar va shartnoma ma'lumotlari bilan keyingi bosqichda ulanadi.
export function paymeHandler() { return { jsonrpc: "2.0", id: null, error: { code: -32504, message: { uz: "Payme hali ulanmagan", ru: "Payme не подключен", en: "Payme not configured" } } }; }
export function clickHandler() { return { error: -8, error_note: "Click hali ulanmagan" }; }

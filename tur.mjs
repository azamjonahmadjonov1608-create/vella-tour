// Menejer qidiruvi (buyruq qatoridan). Oddiy matn bilan:
//   node tur.mjs "Turkiya 15-20 dekabr 7 kecha 2 katta 4 yulduz hammasi kiritilgan" [--out papka] [--top 15]
// Natija: ekranda menejer jadvali + mijoz matni, <out>/natija.json (offer.py uchun)
import fs from "node:fs";
import { runQuery, offerFor, describe, managerDetails } from "./lib/bot.mjs";
import { managerText, defaultPicks } from "./lib/tur.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : d; };
const text = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--"))).join(" ");
const OUT = opt("out", "./tur-natija");
const { q, res, error } = await runQuery(text);
if (error) { console.error(error); process.exit(2); }
console.log("So'rov: " + describe(q) + (q.warn.length ? "  ⚠️ " + q.warn.join("; ") : ""));
const det = res.top.length ? await managerDetails(res, 5) : {};
console.log((res.widened ? "(aniq sanaga topilmadi — kengaytirildi)\n" : "") + managerText(res, +opt("top", 15), det));
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(OUT + "/natija.json", JSON.stringify(res, null, 1));
if (res.top.length) {
  const o = await offerFor(res, defaultPicks(res));
  console.log("\n--- Mijoz uchun (" + o.picks.map(i => i + 1).join(", ") + "-raqamlar) ---\n" + o.text);
}

// Faqat Telegram botni ishga tushirish (serversiz sinov uchun): node run-bot.mjs
import fs from "node:fs";
try { for (const l of fs.readFileSync(new URL("./.env", import.meta.url), "utf8").split("\n")) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; } } catch {}
const { startBot } = await import("./lib/bot.mjs");
startBot();

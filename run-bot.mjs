// Faqat Telegram botni ishga tushirish (sayt va serversiz): node run-bot.mjs
import fs from "node:fs";
try { for (const l of fs.readFileSync(new URL("./.env", import.meta.url), "utf8").split("\n")) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); } } catch {}
const major = +process.versions.node.split(".")[0];
if (major < 20) { console.log(`XATO: Node.js ${process.versions.node} eski. 20 yoki yangisi kerak: https://nodejs.org (LTS) ni o'rnating.`); process.exit(1); }
if (/^\s*$|\s/.test(process.env.TELEGRAM_BOT_TOKEN || " ") === false && !/^\d+:[\w-]{30,}$/.test(process.env.TELEGRAM_BOT_TOKEN)) console.log("⚠️ Token ko'rinishi g'alati — @BotFather bergan to'liq tokenni yozing (masalan 1234567890:AAH...).");
if (!process.env.TELEGRAM_BOT_TOKEN) { console.log("XATO: .env faylida TELEGRAM_BOT_TOKEN yo'q. .env.example ni .env deb nomlab, tokenni yozing."); process.exit(1); }
const { startBot } = await import("./lib/bot.mjs");
startBot();

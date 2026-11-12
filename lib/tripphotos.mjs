// Fun&Sun katalogida yo'q mehmonxonalar uchun rasmlar: operatorlar (Easy Booking, Prestige va b.)
// o'z saytida rasm qo'ymagan bo'lsa, mehmonxona nomi bo'yicha Trip.com ochiq sahifasidan olinadi.
const cache = new Map();
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", "Accept-Language": "en-US,en;q=0.9" };
const STOP = new Set(["hotel", "hotels", "resort", "the", "and", "spa", "inn", "by", "de", "la", "&", "-", "branch", "store", "station", "metro"]);
const words = (s) => s.toLowerCase().replace(/[^a-z0-9а-яё ]+/gi, " ").split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));

export function cleanName(name) {
  return String(name || "").replace(/\d\s*\*+|\*+|\(\s*\d\s*\*\s*\)/g, " ").replace(/\b(STANDARD PACKAGE|CHECK IN[^)]*)\b/gi, " ").replace(/\s+/g, " ").trim();
}

async function search(q) {
  const r = await fetch("https://www.trip.com/restapi/soa2/21881/json/gaHotelSearchEngine?keyword=" + encodeURIComponent(q), { headers: UA, signal: AbortSignal.timeout(8000) });
  const j = await r.json();
  return (j?.Response?.searchResults || []).filter(x => x.type === "Hotel");
}

// Natija nomga mos keladimi: so'rov so'zlarining kamida 70% i topilgan tokenlarda bo'lishi kerak
function score(q, hit) {
  const toks = (hit.tokens || []).map(t => String(t).toLowerCase());
  if (toks.includes(q.toLowerCase())) return 1;
  const tw = new Set(toks.flatMap(t => words(t)));
  const qw = words(q);
  if (!qw.length) return 0;
  return qw.filter(w => tw.has(w)).length / qw.length;
}

const TR = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya" };
const lat = (s) => String(s || "").toLowerCase().split("").map(c => TR[c] ?? c).join("").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
// shahar mosligi: "Санья" ~ "Sanya", "Гуанчжоу" ~ "Guangzhou" (bir nechta harf farqiga chidamli)
function cityOk(region, hit, name = "") {
  const c = String(hit.cityEName || "").toLowerCase();
  if (c && name.toLowerCase().includes(c)) return true;
  const a = lat(region).replace(/\s/g, ""), b = String(hit.cityEName || "").toLowerCase().replace(/[^a-z]/g, "");
  if (!a || !b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const k = Math.min(4, a.length, b.length);
  return a.slice(0, k) === b.slice(0, k);
}

// Zaxira manba: DuckDuckGo rasm qidiruvi — faqat sarlavhasi mehmonxona nomiga mos rasmlar olinadi
const ddgCache = new Map();
export async function webPhotos(name, region = "", n = 8) {
  const base = cleanName(name), noPar = base.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  if (!noPar) return [];
  // ekskursiya turlari (mehmonxona emas) — noto'g'ri rasm yubormaslik uchun o'tkazib yuboramiz
  if (/экскурс|тур\b|\d+\s*д\s*\/\s*\d+\s*н|\S\s*-\s*\S.*-|дней/i.test(base)) return [];
  const key = base + "|" + region;
  if (ddgCache.has(key)) return ddgCache.get(key);
  const p = (async () => {
    try {
      const q = `${base} ${/hotel|отель|resort/i.test(base) ? "" : "hotel"} ${lat(region)}`.replace(/\s+/g, " ").trim();
      const h = await (await fetch("https://duckduckgo.com/?q=" + encodeURIComponent(q) + "&iax=images&ia=images", { headers: UA, signal: AbortSignal.timeout(8000) })).text();
      const vqd = (h.match(/vqd=["']?([\d-]+)/) || [])[1];
      if (!vqd) return [];
      const j = await (await fetch(`https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(q)}&vqd=${vqd}&f=,,,&p=1`, { headers: { ...UA, Referer: "https://duckduckgo.com/" }, signal: AbortSignal.timeout(8000) })).json();
      const qw = words(noPar);
      const ok = (j.results || []).filter(x => {
        const tw = new Set(words(x.title || ""));
        const hit = qw.filter(w => tw.has(w)).length;
        return hit >= Math.min(2, qw.length) && hit / qw.length >= 0.6 && /^https:/.test(x.image) && !/\/_next\/image/.test(x.image) && !/\.(gif|svg)(\?|$)/i.test(x.image);
      });
      // tripcdn webp -> jpg (Telegram uchun)
      return [...new Set(ok.map(x => /tripcdn\.com/.test(x.image) ? x.image.replace(/(_[A-Z]_\d+_\d+[^.]*)?\.(webp|jpe?g|png)$/i, "_R_960_660_R5_D.jpg") : x.image))].slice(0, n);
    } catch { return []; }
  })();
  ddgCache.set(key, p);
  return p;
}

export async function tripPhotos(name, n = 6, region = "") {
  const base = cleanName(name);
  if (!base) return { photos: [] };
  const key = base + "|" + region;
  if (cache.has(key)) return cache.get(key);
  const p = (async () => {
    try {
      const noPar = base.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
      let hit = null;
      const city = lat(region);
      for (const q of [...new Set([city && !lat(noPar).includes(city) ? noPar + " " + city : "", base, noPar].filter(Boolean))]) {
        const list = await search(q);
        const best = list.map(h => ({ h, s: score(noPar, h) + score(base, h), c: cityOk(region, h, base) })).filter(x => x.c).sort((a, b) => b.s - a.s)[0];
        if (best && best.s >= 1.2) { hit = best.h; break; }
      }
      if (!hit) { const w = await webPhotos(name, region, n); return { photos: w }; }
      const url = "https://www.trip.com/hotels/detail/?hotelId=" + hit.id;
      const html = await (await fetch(url, { headers: UA, signal: AbortSignal.timeout(12000) })).text();
      const top = html.slice(html.indexOf('hotelTopImage'), html.indexOf('hotelTopImage') + 20000);
      const raw = [...top.matchAll(/\\?"imgUrl\\?":\\?"(https:[^"\\]+?\.(?:jpe?g|webp|png))/g)].map(m => m[1].replace(/\\u002F/g, "/"));
      const photos = [...new Set(raw.map(u => u.replace(/_R_\d+_\d+(_R5)?(_D)?\.(jpe?g|webp|png)$/i, "_R_960_660_R5_D.jpg")))].slice(0, n);
      const title = (html.match(/<title>([^<(]+)/) || [])[1]?.trim() || "";
      return { photos: photos.length ? photos : await webPhotos(name, region, n), url, title };
    } catch { return { photos: await webPhotos(name, region, n).catch(() => []) }; }
  })();
  cache.set(key, p);
  return p;
}

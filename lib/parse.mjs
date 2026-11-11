// Menejer yozgan oddiy matnni qidiruv parametrlariga aylantiradi (o'zbekcha va ruscha).
//  "Turkiya, 15–20 dekabr, 7 kecha, 2 katta + 1 bola (6 yosh), 4 yulduz, hammasi kiritilgan"
//  "Vyetnam 8 kunlik 5 dekabrdan 2 kishi"   "Дубай 10-17 января 2 взр Rixos"
import { COUNTRY_WORDS } from "./tur.mjs";

const MONTHS = [["yanv", "янв", "jan"], ["fev", "фев", "feb"], ["mart", "мар", "mar"], ["apr", "апр"], ["may", "мая", "май"], ["iyun", "июн", "jun"],
  ["iyul", "июл", "jul"], ["avg", "авг", "aug"], ["sen", "сен", "sep"], ["okt", "окт", "oct"], ["noy", "ноя", "nov"], ["dek", "дек", "dec"]];
const monthOf = (w) => { w = w.toLowerCase(); for (let i = 0; i < 12; i++) if (MONTHS[i].some(p => w.startsWith(p))) return i + 1; return 0; };
const CITIES = [["fukuok|phu quoc|фукуок", /fukuok|phu ?quoc|фукуок/i, "вьетнам"], ["nha trang|нячанг", /nyachang|nha ?trang|нячанг/i, "вьетнам"], ["danang|da nang|дананг", /danang|da nang|дананг/i, "вьетнам"],
  ["антал|antal", /antal/i, "турция"], ["алан|alany", /alany|алан/i, "турция"], ["кемер|kemer", /kemer|кемер/i, "турция"], ["белек|belek", /belek|белек/i, "турция"], ["сиде|side", /\bside\b|сиде/i, "турция"],
  ["стамбул|istanbul", /istanbul|стамбул/i, "турция"], ["шарм|sharm", /sharm|шарм/i, "египет"], ["хургад|hurghad", /xurgada|hurgh?ada|хургад/i, "египет"], ["батуми|batumi", /batumi|батуми/i, "грузия"],
  ["тбилиси|tbilisi", /tbilisi|тбилиси/i, "грузия"], ["габала|gabala|qabala", /gabala|qabala|габала/i, "азербайджан"], ["пхукет|phuket", /pxuket|phuket|пхукет/i, "таиланд"], ["паттай|pattaya", /pattay|паттай/i, "таиланд"],
  ["шардж|sharjah", /sharj|шардж/i, "оаэ"], ["абу|abu dhabi", /abu.?dab|абу.?даби/i, "оаэ"], ["рас-эль|ras al", /ras.?al|рас.?эль/i, "оаэ"], ["лангкави|langkawi", /langkav|лангкави/i, "малайзия"],
  ["мекк|makkah|mecca", /makk|mecca|мекк/i, "саудовская аравия"], ["медин|madinah", /madin|медин/i, "саудовская аравия"], ["санья|sanya", /sanya|санья/i, "китай"]];

export function parseQuery(text, now = new Date()) {
  const t = " " + String(text || "").replace(/[–—]/g, "-").replace(/\s+/g, " ") + " ";
  const low = t.toLowerCase();
  const q = { warn: [] };
  // mamlakat
  for (const w of low.split(/[^a-zа-яё'ʻ-]+/i)) { const k = COUNTRY_WORDS[w.replace(/(ga|da|dan|ya|ning)$/, "")] || COUNTRY_WORDS[w]; if (k) { q.country = k; break; } }
  // shahar
  for (const [alts, re, c] of CITIES) if (re.test(t)) { q.city = alts; if (!q.country) q.country = c; break; }
  // mehmonxona: qo'shtirnoq ichida yoki "mehmonxona/hotel/отель X"
  const hq = t.match(/[«"“']([^»"”']{3,40})[»"”']/) || t.match(/(?:mehmonxona(?:si)?|hotel|отель)\s*[:\-]?\s*([A-Za-zА-Яа-я0-9&' .-]{3,40}?)(?=[,;\n]| \d| va | и |$)/i);
  if (hq) q.hotel = hq[1].trim();
  // kechalar / kunlar
  let m = low.match(/(\d{1,2})\s*-\s*(\d{1,2})\s*(?:kecha|tun|ноч|night)/);
  if (m) { q.n1 = +m[1]; q.n2 = +m[2]; }
  else if ((m = low.match(/(\d{1,2})\s*(?:kecha|tun|ноч|night)/))) q.n1 = q.n2 = +m[1];
  else if ((m = low.match(/(\d{1,2})\s*(?:kun|kunlik|дн|день|дней|day)/))) q.n1 = q.n2 = Math.max(1, +m[1] - 1);
  // kishilar
  if ((m = low.match(/(\d)\s*(?:ta\s*)?(?:katta|kattalar|kishi|odam|взр|чел|adult|pax)/))) q.adults = +m[1];
  if ((m = low.match(/(\d)\s*(?:ta\s*)?(?:bola|ребен|реб|дет|child|kid)/))) q.kids = +m[1];
  const ages = [...low.matchAll(/(\d{1,2})\s*(?:yosh|лет|год|y\.?o)/g)].map(x => +x[1]).filter(a => a < 18);
  if (ages.length) { q.ages = ages; q.kids = Math.max(q.kids || 0, ages.length); }
  // yulduz, ovqat, byudjet
  if ((m = low.match(/(\d)\s*(?:\*|★|yulduz|звезд|star)/))) q.stars = +m[1];
  if (/ultra/.test(low)) q.meal = "AI";
  else if (/hammasi kiritilgan|all ?inc|все включ|\bai\b|\bал\b/.test(low)) q.meal = "AI";
  else if (/3 mahal|полный пансион|\bfb\b/.test(low)) q.meal = "FB";
  else if (/kechki|полупансион|\bhb\b|ужин/.test(low)) q.meal = "HB";
  else if (/nonushta|завтрак|\bbb\b/.test(low)) q.meal = "BB";
  if ((m = low.match(/(?:\$\s*(\d{3,5})|(\d{3,5})\s*(?:\$|dollar|долл|usd))/))) q.budget = +(m[1] || m[2]);
  // sanalar
  const Y = now.getFullYear(), cm = now.getMonth() + 1;
  const iso = (d, mo, y) => { y = y || (mo < cm || (mo === cm && d < now.getDate()) ? Y + 1 : Y); return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`; };
  const MW = "([a-zа-яё]{3,})";
  let from = "", to = "", trip = false;
  if ((m = t.match(/(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?\s*-\s*(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?/))) { from = iso(+m[1], +m[2], m[3] && +("20" + m[3].slice(-2))); to = iso(+m[4], +m[5], m[6] && +("20" + m[6].slice(-2))); trip = true; }
  else if ((m = t.match(new RegExp(`(\\d{1,2})\\s*${MW}?\\s*-\\s*(\\d{1,2})\\s*${MW}`, "i"))) && monthOf(m[4])) { const m2 = monthOf(m[4]), m1 = m[2] && monthOf(m[2]) || m2; from = iso(+m[1], m1); to = iso(+m[3], m2); trip = true; }
  else if ((m = t.match(/(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?/))) { from = to = iso(+m[1], +m[2]); }
  else if ((m = [...t.matchAll(new RegExp(`(\\d{1,2})\\s*-?\\s*${MW}`, "gi"))].find(x => monthOf(x[2]) && +x[1] <= 31))) { from = to = iso(+m[1], monthOf(m[2])); }
  else { for (const w of low.split(/[^a-zа-яё]+/)) { const mo = w.length > 2 && monthOf(w); if (mo) { const y = mo < cm ? Y + 1 : Y; const first = mo === cm && y === Y ? now.getDate() + 2 : 1; from = iso(first, mo, y); to = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); break; } } }
  // "15-22 dekabr" va kechalar aytilmagan bo'lsa — bu safar sanalari: 15 da uchib 22 da qaytish
  if (trip && !q.n1) { const n = Math.round((Date.parse(to) - Date.parse(from)) / 864e5); if (n > 1 && n < 30) { q.n1 = q.n2 = n; to = from; } }
  if (!from) { const d = new Date(now.getTime() + 3 * 864e5), e = new Date(now.getTime() + 17 * 864e5); from = d.toISOString().slice(0, 10); to = e.toISOString().slice(0, 10); q.warn.push("sana aytilmadi — yaqin 2 hafta olindi"); }
  if (from === to) { const a = new Date(Date.parse(from) - 864e5), b = new Date(Date.parse(from) + 864e5); q.exact = from; from = a.toISOString().slice(0, 10); to = b.toISOString().slice(0, 10); }
  q.from = from; q.to = to;
  if (!q.n1) { q.n1 = 6; q.n2 = 8; q.warn.push("kechalar soni aytilmadi — 6–8 kecha olindi"); }
  if (!q.adults) q.adults = 2;
  if (!q.country) q.warn.push("mamlakat topilmadi");
  return q;
}

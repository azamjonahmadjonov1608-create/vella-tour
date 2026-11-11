// Menejer qidiruvi: barcha hamkor operatorlardan jonli narx, filtrlash, mehmonxonalar bo'yicha guruhlash.
import { OPERATORS, COUNTRY_UZ } from "./operators.mjs";
import { searchOperator } from "./samo.mjs";
import { normName } from "./photos.mjs";

// O'zbekcha / ruscha / inglizcha mamlakat nomlari -> operator kaliti
export const COUNTRY_WORDS = {
  vyetnam: "вьетнам", vietnam: "вьетнам", вьетнам: "вьетнам", turkiya: "турция", turkey: "турция", турция: "турция", istanbul: "турция", antaliya: "турция", antalya: "турция",
  misr: "египет", egypt: "египет", египет: "египет", sharm: "египет", xurgada: "египет", hurgada: "египет",
  baa: "оаэ", dubay: "оаэ", dubai: "оаэ", uae: "оаэ", оаэ: "оаэ", дубай: "оаэ", gruziya: "грузия", georgia: "грузия", грузия: "грузия", tbilisi: "грузия", batumi: "грузия",
  ozarbayjon: "азербайджан", azerbaijan: "азербайджан", азербайджан: "азербайджан", baku: "азербайджан", boku: "азербайджан",
  tailand: "таиланд", thailand: "таиланд", таиланд: "таиланд", pxuket: "таиланд", phuket: "таиланд", malayziya: "малайзия", malaysia: "малайзия", малайзия: "малайзия",
  maldiv: "мальдивы", maldives: "мальдивы", мальдивы: "мальдивы", bali: "индонезия", indoneziya: "индонезия", индонезия: "индонезия",
  xitoy: "китай", china: "китай", китай: "китай", sanya: "китай", qatar: "катар", катар: "катар", ummon: "оман", oman: "оман", оман: "оман",
  "shri-lanka": "шри-ланка", srilanka: "шри-ланка", "шри-ланка": "шри-ланка", saudiya: "саудовская аравия", umra: "саудовская аравия", makka: "саудовская аравия",
  yaponiya: "япония", armaniston: "армения", iordaniya: "иордания", hindiston: "индия", singapur: "сингапур", zanzibar: "занзибар", mavrikiy: "маврикий", seyshel: "сейшелы"
};
export const countryKey = (s) => { const k = String(s || "").toLowerCase().trim(); return COUNTRY_WORDS[k.replace(/\s+/g, "")] || COUNTRY_WORDS[k.split(/\s/)[0]] || k; };

const nightsOf = (s) => { const m = String(s).match(/(\d+)\s*(?:\+\s*(\d+))?/); return m ? { n: +m[1], extra: +(m[2] || 0) } : { n: 0, extra: 0 }; };
const AIR = [[/uzbekistan|uzairways|uz airways/i, "Uzbekistan Airways"], [/centrum/i, "Centrum Air"], [/fly ?dubai/i, "flydubai"], [/air ?arabia/i, "Air Arabia"],
  [/qanot|shark|шарк/i, "Qanot Sharq"], [/azal/i, "AZAL"], [/turkish/i, "Turkish Airlines"], [/pegasus/i, "Pegasus"], [/air ?astana/i, "Air Astana"],
  [/saudia/i, "Saudia"], [/vietjet/i, "VietJet"], [/vietnam airl/i, "Vietnam Airlines"], [/silk/i, "Silk Avia"], [/humo/i, "Humo Air"]];
const airline = (t) => { for (const [re, n] of AIR) if (re.test(t)) return n; return ""; };
const ymd = (d) => d.split(".").reverse().join("-");
const toks = (s) => new Set(normName(s).split(" ").filter(w => w.length > 1));
export const sim = (a, b) => { const A1 = toks(a), B1 = toks(b); if (!A1.size || !B1.size) return 0; let c = 0; for (const w of A1) if (B1.has(w)) c++; return c / Math.min(A1.size, B1.size); };

// q: { country, from, to, n1, n2, adults, kids, ages[], hotel, city, stars, meal, budget, markup(0.2), top }
export async function searchTours(q) {
  const country = countryKey(q.country);
  const from = q.from, to = q.to || q.from, n1 = +q.n1, n2 = +(q.n2 || q.n1);
  const adults = +(q.adults || 2), kids = +(q.kids || 0), ages = q.ages || [];
  const MARK = q.markup ?? +(process.env.MARKUP_PERCENT ?? 20) / 100;
  const hotelQ = q.hotel ? normName(q.hotel) : "", cityQ = (q.city || "").toLowerCase();
  const MAXP = q.pages || (hotelQ || q.stars || q.meal || cityQ ? 5 : 3);
  const ops = OPERATORS.filter(o => !o.disabled);
  const base = { country, dateFrom: from, dateTo: to, nightsMin: Math.max(1, n1 - 1), nightsMax: n2 + 1, adults, kids, kidAges: ages, timeoutMs: q.timeoutMs || 60000 };
  const t0 = Date.now(), stat = [];
  const all = (await Promise.all(ops.map(async o => {
    const got = []; let st = "";
    for (let p = 1; p <= MAXP; p++) {
      try {
        const r = await searchOperator(o, { ...base, page: p });
        if (p === 1) st = r.status;
        got.push(...r.results);
        if (r.results.length < 100 || o.key === "funsun") break;
      } catch (e) { if (p === 1) st = "javob bermadi"; break; }
    }
    stat.push({ op: o.name, status: st, n: got.length });
    return got;
  }))).flat();

  let rows = all.map(r => { const nn = nightsOf(r.nights); return { ...r, d: ymd(r.date), n: nn.n, extra: nn.extra, air: airline(r.tour), sale: Math.round(r.price * (1 + MARK)) }; })
    .filter(r => r.n && r.d >= from && r.d <= to)
    .filter(r => (r.n + r.extra >= n1 && r.n + r.extra <= n2) || (r.n >= n1 && r.n <= n2));
  rows.forEach(r => { if (/^AO/i.test(r.meal)) r.meal = "RO"; });
  const pre = rows.filter(r => r.seats !== "yo'q");
  const hint = { n: pre.length, meals: [...new Set(pre.map(r => r.meal))], stars: [...new Set(pre.map(r => r.stars || 0))].sort(), min: pre.length ? Math.min(...pre.map(r => r.sale)) : 0 };
  if (hotelQ) rows = rows.filter(r => sim(r.hotel, q.hotel) >= 0.6 || normName(r.hotel).includes(hotelQ));
  if (cityQ) { const alts = cityQ.split("|"); rows = rows.filter(r => { const t = (r.region + " " + r.tour + " " + r.hotel).toLowerCase(); return alts.some(a => t.includes(a)); }); }
  if (q.stars) rows = rows.filter(r => (r.stars || 0) >= +q.stars);
  if (q.meal) rows = rows.filter(r => r.meal === String(q.meal).toUpperCase() || (q.meal === "AI" && r.meal === "UAI"));
  if (q.budget) rows = rows.filter(r => r.sale <= +q.budget);
  rows = rows.filter(r => r.seats !== "yo'q").sort((a, b) => a.price - b.price);

  const groups = [];
  for (const r of rows) {
    let g = groups.find(g => g.stars === r.stars && sim(g.hotel, r.hotel) >= 0.8);
    if (!g) { g = { hotel: r.hotel.replace(/\s*\d\s*\*\s*$/, "").trim(), stars: r.stars, region: r.region, hid: "", list: [] }; groups.push(g); }
    if (r.hid && !g.hid) g.hid = r.hid;
    g.list.push(r);
  }
  return {
    at: new Date().toISOString(), ms: Date.now() - t0,
    so_rov: { country, countryUz: COUNTRY_UZ[country] || country, from, to, n1, n2, adults, kids, ages, hotel: q.hotel || "", city: q.city || "", stars: q.stars || "", meal: q.meal || "", budget: q.budget || "", markup: MARK },
    operatorlar: stat, jami: rows.length, mehmonxonalar: groups.length, hint,
    top: groups.slice(0, +(q.top || 15)).map(g => {
      const byOp = [...new Map([...g.list].reverse().map(r => [r.opName, r])).values()].sort((a, b) => a.price - b.price).map(r => ({ op: r.opName, net: r.price }));
      return { hotel: g.hotel, stars: g.stars, region: g.region, hid: g.hid, byOp,
        variants: g.list.slice(0, 12).map(r => ({ op: r.opName, d: r.d, t: r.time, n: r.n, extra: r.extra, tour: r.tour, air: r.air, meal: r.meal, mealText: r.mealText, room: r.room, net: r.price, sale: r.sale, cur: r.currency, seats: r.seats, code: r.code, opKey: r.op, claim: r.claim, sf: r.sf, st: r.st, tf: r.tf })) };
    })
  };
}

// --- Matn ko'rinishlari (Telegram va sayt uchun) ---
export const MEAL_UZ = { RO: "Ovqatsiz", BB: "Nonushta", HB: "Nonushta + kechki ovqat", FB: "3 mahal ovqat", AI: "Hammasi kiritilgan", UAI: "Ultra hammasi kiritilgan" };
const MON = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
export const ddUz = (iso) => `${+iso.slice(8, 10)} ${MON[+iso.slice(5, 7) - 1]}`;
export const money = (n) => "$" + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
export const CITY_UZ = { "Фукуок": "Fukuok", "Нячанг": "Nyachang", "Камрань": "Kamran", "Дананг": "Danang", "Шарм-Эль-Шейх": "Sharm-ash-Shayx", "Хургада": "Xurgada",
  "Стамбул": "Istanbul", "Анталья": "Antaliya", "Аланья": "Alanya", "Кемер": "Kemer", "Белек": "Belek", "Сиде": "Side", "Дубай": "Dubay", "Шарджа": "Sharja",
  "Абу-Даби": "Abu-Dabi", "Рас-эль-Хайма": "Ras al-Xayma", "Тбилиси": "Tbilisi", "Батуми": "Batumi", "Баку": "Boku", "Габала": "Gabala", "Пхукет": "Pxuket",
  "Паттайя": "Pattayya", "Бали": "Bali", "Куала-Лумпур": "Kuala-Lumpur", "Лангкави": "Langkavi", "Мале": "Male", "Мекка": "Makka", "Медина": "Madina",
  "Санья": "Sanya", "Доха": "Doha", "Маскат": "Maskat", "Коломбо": "Kolombo", "Хадаба": "Hadaba", "Наама Бей": "Naama Bey", "Дахаб": "Dahab", "Макади": "Makadi", "Сома Бей": "Soma Bey", "Эль Гуна": "El Guna", "Сафага": "Safaga", "Нама Бей": "Naama Bey", "Шаркс Бей": "Sharks Bay", "Набк Бей": "Nabq Bay", "Мармарис": "Marmaris", "Бодрум": "Bodrum", "Фетхие": "Fethiye", "Кушадасы": "Kushadasi", "Нусa Дуа": "Nusa Dua", "Убуд": "Ubud", "Кута": "Kuta", "Семиньяк": "Seminyak", "Джимбаран": "Jimbaran", "Краби": "Krabi", "Самуи": "Samui", "Ханой": "Xanoy" };
const CITY_LC = Object.fromEntries(Object.entries(CITY_UZ).map(([k, v]) => [k.toLowerCase(), v]));
const TR = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "x", ц: "ts", ч: "ch", ш: "sh", щ: "sh", ъ: "", ы: "i", ь: "", э: "e", ю: "yu", я: "ya" };
const translit = (s) => s.replace(/[А-Яа-яЁё]/g, (c) => { const l = c.toLowerCase(), t = TR[l] ?? c; return c === l ? t : t.charAt(0).toUpperCase() + t.slice(1); });
export const cityUz = (s) => {
  const k = (s || "").trim(); if (CITY_LC[k.toLowerCase()]) return CITY_LC[k.toLowerCase()];
  return translit(k.replace(/Атолл/g, "atolli").replace(/Остров\s+(\S+)/g, "$1 oroli").replace(/^Город\s+/, ""));
};
const nightsTxt = (v) => `${v.n}${v.extra ? "+" + v.extra : ""} kecha`;
export function bestOf(g) { return [...g.variants].sort((a, b) => (a.seats !== "bor") - (b.seats !== "bor") || a.sale - b.sale)[0]; }

// Menejer uchun: operatorlar, operator narxi, ustama bilan narx
export function managerText(res, limit = 8, det = {}) {
  const r = res.so_rov;
  const head = `🔎 ${r.countryUz}: ${ddUz(r.from)} – ${ddUz(r.to)}, ${r.n1}${r.n2 !== r.n1 ? "–" + r.n2 : ""} kecha, ${r.adults} katta${r.kids ? " + " + r.kids + " bola" : ""}` +
    `${r.stars ? ", " + r.stars + "★+" : ""}${r.meal ? ", " + (MEAL_UZ[r.meal] || r.meal) : ""}${r.hotel ? ", «" + r.hotel + "»" : ""}`;
  const ops = "Operatorlar: " + res.operatorlar.map(s => `${s.op} ${s.n || "—"}`).join(" · ");
  if (!res.top.length) {
    const h = res.hint || {};
    const tip = h.n ? `\n\nBu sanalarda filtrsiz ${h.n} ta variant bor (${money(h.min)} dan). Mavjud ovqat turlari: ${h.meals.map(m => MEAL_UZ[m] || m).join(", ")}; yulduzlar: ${h.stars.filter(Boolean).join(", ")}. Filtrni o'zgartirib qayta yozing.` : "\n\nBu sanalarda umuman tur yo'q — boshqa sana yoki kechalar sonini yozing.";
    return `${head}\n${ops}\n\nMos tur topilmadi.${tip}`;
  }
  const lines = res.top.slice(0, limit).map((g, i) => {
    const b = bestOf(g);
    const cmp = g.byOp.length > 1 ? `\n   ↔ ${g.byOp.map(x => `${x.op} ${money(x.net)}`).join(" · ")}` : "";
    return `${i + 1}. ${g.hotel} ${"★".repeat(g.stars || 0)} — ${cityUz(g.region)}\n   ${ddUz(b.d)} ${b.t} · ${nightsTxt(b)} · ${b.meal} · ${b.room}${b.air ? " · " + b.air : ""}\n   🏢 Operator: ${b.op} · narxi ${money(b.net)} → sotuv ${money(b.sale)} · mehmonxonada joy: ${b.seats}${cmp}${det[i] && det[i].length ? "\n   " + det[i].join("\n   ") : ""}`;
  });
  return `${head}\n${ops}\nTopildi: ${res.jami} variant, ${res.mehmonxonalar} mehmonxona\n\n${lines.join("\n\n")}`;
}

// Mijoz uchun: operator nomi va ustama ko'rinmaydi
export function clientText(res, picks, opts = {}) {
  const r = res.so_rov, ad = r.adults, kids = r.kids;
  const items = picks.map(i => res.top[i]).filter(Boolean);
  const regions = [...new Set(items.map(g => cityUz(g.region)))];
  const out = [`✈️ ${r.countryUz}${regions.length ? " (" + regions.join(", ") + ")" : ""}`,
    `🗓 ${(() => { const ds = [...new Set(items.map(g => bestOf(g).d))].sort(); return ds.length === 1 ? ddUz(ds[0]) + " uchish" : ddUz(r.from) + " – " + ddUz(r.to) + " oralig'ida uchish"; })()} · ${r.n1}${r.n2 !== r.n1 ? "–" + r.n2 : ""} kecha · ${ad} kattalar${kids ? " + " + kids + " bola" : ""}`, ""];
  items.forEach((g, k) => {
    const b = bestOf(g), per = kids ? 0 : Math.round(b.sale / ad);
    const D = opts.details && opts.details[k];
    out.push(`${k + 1}️⃣ ${g.hotel} ${"★".repeat(g.stars || 0)}`, `📍 ${cityUz(g.region)}, ${r.countryUz}`);
    if (!opts.hideOp && process.env.HIDE_OPERATOR !== "1") out.push(`🏢 Operator: ${b.op}`);
    if (opts.facts && opts.facts[k]) out.push("ℹ️ " + opts.facts[k]);
    if (D && D.length) out.push(...D);
    else out.push(`🛫 ${ddUz(b.d)}${b.t ? " " + b.t : ""} · ${nightsTxt(b)}`);
    out.push(`🛏 ${String(b.room).replace(/\s*\/\s*(\d+\s*AD.*|DBL|SGL|TRPL?|TWN|DOUBLE|SINGLE)\s*$/i, "").trim()} · 🍽 ${MEAL_UZ[b.meal] || b.mealText}`,
      `💰 ${per ? money(per) + " / 1 kishi (jami " + money(b.sale) + ")" : money(b.sale) + " jami"}`);
    out.push("");
  });
  const air = [...new Set(items.map(g => bestOf(g).air).filter(Boolean))];
  if (!(opts.details && opts.details.some(x => x && x.length))) out.push(`Narxga kiradi: Toshkentdan borish-qaytish aviabilet${air.length ? " (" + air.join(", ") + ")" : ""}, mehmonxonada yashash va ko'rsatilgan ovqatlanish.`);
  if (opts.contact) out.push("", opts.contact);
  return out.join("\n");
}

// Mijozga taklif uchun standart tanlov: joyi bor eng arzonlari, turli mehmonxonalar
export function defaultPicks(res, n = 3) {
  const idx = res.top.map((g, i) => [i, bestOf(g)]).sort((a, b) => (a[1].seats !== "bor") - (b[1].seats !== "bor") || a[1].sale - b[1].sale);
  return idx.slice(0, n).map(x => x[0]).sort((a, b) => a - b);
}

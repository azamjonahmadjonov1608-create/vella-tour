// Mehmonxona haqida qisqa ma'lumot (Fun&Sun katalogidan): rasmlar + o'zbekcha qisqa faktlar.
const cache = new Map();

function nuxtFacts(html) {
  const m = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return {};
  let arr; try { arr = JSON.parse(m[1]); } catch { return {}; }
  const R = (i, d = 0) => {
    if (d > 14) return null;
    const v = Number.isInteger(i) && i >= 0 && i < arr.length ? arr[i] : i;
    if (Array.isArray(v)) { if (typeof v[0] === "string" && /^(Reactive|ShallowReactive|Ref|ShallowRef)$/.test(v[0])) return R(v[1], d + 1); return v.map(x => R(x, d + 1)); }
    if (v && typeof v === "object") { const o = {}; for (const k in v) o[k] = R(v[k], d + 1); return o; }
    return v;
  };
  const tx = (h) => h.replace(/<\/li>/g, "; ").replace(/<[^>]+>/g, " ").replace(/&nbsp;| /g, " ").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").replace(/^[\s;]+|[\s;]+$/g, "");
  const facts = {};
  arr.forEach((v, i) => {
    if (v && typeof v === "object" && !Array.isArray(v) && "descriptionBlocks" in v && "name" in v) {
      for (const b of R(i).descriptionBlocks || []) {
        if (!b || typeof b !== "object") continue;
        const t = (b.selectedFilters || []).filter(f => f && typeof f.text === "string").map(f => tx(f.text)).join(" ");
        const n = String(b.name || "").trim();
        if (t && n && !facts[n]) facts[n] = t.slice(0, 500);
      }
    }
  });
  return facts;
}

// Ruscha faktlardan o'zbekcha qisqa jumla yasaydi (faqat aniq ma'lumotlar)
export function factsUz(f) {
  const out = [];
  const sea = (f["Расстояние до моря"] || "").match(/(\d)-я линия/);
  const beach = (f["Описание пляжа"] || f["Краткое описание"] || "").match(/(\d[\d\s,.]*)\s*(км|метр[а-я]*|м)(?![а-яё])/i);
  const sand = /песчан/i.test(f["Описание пляжа"] || ""), priv = /собственн|частн/i.test(f["Описание пляжа"] || "");
  if (sea && sea[1] === "1") out.push("Birinchi qator, dengiz bo'yida" + (sand ? ", qumli plyaj" : ""));
  else if (beach) out.push(`${priv ? "Xususiy" : sand ? "Qumli" : ""} plyajgacha ${beach[1].trim()} ${beach[2] === "км" ? "km" : "m"}`.trim().replace(/^plyaj/, "Plyaj") + (sea ? ` (${sea[1]}-qator)` : ""));
  else if (sea) out.push(`Dengizdan ${sea[1]}-qator`);
  const pools = f["Бассейны и водные развлечения"] || "";
  const pz = [];
  if (/открыт/i.test(pools)) pz.push("ochiq"); if (/(^|[\s;,(])крыт/i.test(pools)) pz.push("yopiq");
  if (pools) out.push(`${pz.length ? pz.join(" va ") + " " : ""}basseyn`.trim());
  if (/аквапарк|горк/i.test(pools)) out.push("suv tepaliklari");
  const air = (f["Где находится"] || "").match(/(\d+[.,]?\d*)\s*км\s*от\s*(?:международного\s*)?аэропорт/i) || (f["Где находится"] || "").match(/аэропорт[^.]*?(\d+[.,]?\d*)\s*км/i);
  if (air) out.push(`aeroportgacha ${air[1]} km`);
  const srv = (f["Удобства и услуги"] || "") + " " + (f["В номере"] || "");
  if (/Wi-Fi[^;]*беспл/i.test(srv)) out.push("bepul Wi-Fi");
  if (/фитнес/i.test(srv)) out.push("fitnes-zal");
  if (/спа|spa/i.test(srv)) out.push("SPA");
  if (/дет|kids/i.test(f["Для детей"] || "") && /клуб|площадк|меню/i.test(f["Для детей"] || "")) out.push("bolalar uchun sharoit");
  const fmt = f["Формат отеля"] || "";
  if (/Семейн/i.test(fmt)) out.push("oilalar uchun qulay");
  else if (/пар/i.test(fmt)) out.push("juftliklar uchun");
  if (!out.length) return "";
  const s = out.join(", ");
  return s.charAt(0).toUpperCase() + s.slice(1) + ".";
}

export async function hotelInfo(hid) {
  if (!/^\d+$/.test(hid || "")) return { photos: [], facts: {}, uz: "" };
  if (cache.has(hid)) return cache.get(hid);
  const p = (async () => {
    try {
      let html = "";
      for (let a = 0; a < 2 && !html.includes("__NUXT_DATA__"); a++) {
        if (a) await new Promise(r => setTimeout(r, 2500));
        const r = await fetch("https://fstravel.com/hotel/" + hid, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20000) });
        html = await r.text();
      }
      const photos = [...new Set(html.match(/https:\/\/apigate-tui\.fstravel\.com\/api\/geocontent\/static\/s600\/hotel\/[^"'\s)\\]+?\.(?:jpe?g|webp|png)/g) || [])].slice(0, 6);
      const facts = nuxtFacts(html);
      return { photos, facts, uz: factsUz(facts), url: "https://fstravel.com/hotel/" + hid };
    } catch { return { photos: [], facts: {}, uz: "" }; }
  })();
  cache.set(hid, p);
  return p;
}

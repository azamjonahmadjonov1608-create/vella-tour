# Mijozga yuboriladigan tayyor tur taklifi (PDF + Telegram matni).
#
# 1) Tayyorlash — tanlangan mehmonxonalar uchun rasm va ma'lumotlarni yig'adi:
#    python3 -I offer.py tayyorla OUT_DIR natija.json:1 natija.json:3 boshqa/natija.json:2
#    -> OUT_DIR/taklif.json  (har bir variantda "ru" faktlar; "uz" maydoniga o'zbekcha qisqa tavsif yoziladi)
# 2) Chiqarish:
#    python3 -I offer.py pdf OUT_DIR [--tel "+998 .."] [--tg "@vellatour_operator"]
#    -> OUT_DIR/taklif.html, OUT_DIR/taklif.pdf, OUT_DIR/telegram.txt
import json, sys, re, io, os, base64, html as H, urllib.request, datetime
from PIL import Image

UA = {"User-Agent": "Mozilla/5.0"}
MEAL = {"RO": "Ovqatsiz", "BB": "Nonushta", "HB": "Nonushta + kechki ovqat", "FB": "3 mahal ovqat", "AI": "Hammasi kiritilgan", "UAI": "Ultra hammasi kiritilgan"}
MON = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"]
CITY = {"Фукуок": "Fukuok", "Нячанг": "Nyachang", "Камрань": "Kamran", "Дананг": "Danang", "Хошимин": "Xoshimin", "Шарм-Эль-Шейх": "Sharm-ash-Shayx",
        "Хургада": "Xurgada", "Стамбул": "Istanbul", "Анталья": "Antaliya", "Аланья": "Alanya", "Кемер": "Kemer", "Белек": "Belek", "Сиде": "Side",
        "Дубай": "Dubay", "Шарджа": "Sharja", "Абу-Даби": "Abu-Dabi", "Рас-эль-Хайма": "Ras al-Xayma", "Тбилиси": "Tbilisi", "Батуми": "Batumi",
        "Баку": "Boku", "Габала": "Gabala", "Пхукет": "Pxuket", "Паттайя": "Pattayya", "Бали": "Bali", "Куала-Лумпур": "Kuala-Lumpur", "Лангкави": "Langkavi",
        "Мале": "Male", "Мекка": "Makka", "Медина": "Madina", "Санья": "Sanya", "Доха": "Doha", "Маскат": "Maskat", "Коломбо": "Kolombo"}
city = lambda s: CITY.get((s or "").strip(), (s or "").strip())
dd = lambda iso: f"{int(iso[8:10])} {MON[int(iso[5:7]) - 1]}"
money = lambda n: "$" + f"{n:,}".replace(",", " ")


def img(u, w=900, q=70):
    raw = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=25).read()
    im = Image.open(io.BytesIO(raw)).convert("RGB")
    im = im.resize((w, max(1, int(im.height * w / im.width))), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, "JPEG", quality=q, optimize=True, progressive=True)
    return "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()


def nuxt_facts(s):
    m = re.search(r'<script[^>]*id="__NUXT_DATA__"[^>]*>(.*?)</script>', s, re.S)
    if not m: return {}
    arr = json.loads(m.group(1))
    def R(i, d=0):
        if d > 14: return None
        v = arr[i] if isinstance(i, int) and 0 <= i < len(arr) else i
        if isinstance(v, dict): return {k: R(x, d + 1) for k, x in v.items()}
        if isinstance(v, list):
            if v and isinstance(v[0], str) and v[0] in ("Reactive", "ShallowReactive", "Ref", "ShallowRef"): return R(v[1], d + 1)
            return [R(x, d + 1) for x in v]
        return v
    tx = lambda h: re.sub(r"\s+", " ", H.unescape(re.sub(r"<[^>]+>", " ", h.replace("</li>", "; ")))).strip(" ;")
    facts = {}
    for i, v in enumerate(arr):
        if isinstance(v, dict) and "descriptionBlocks" in v and "name" in v:
            for b in (R(i).get("descriptionBlocks") or []):
                if not isinstance(b, dict): continue
                t = " ".join(tx(f["text"]) for f in (b.get("selectedFilters") or []) if isinstance(f, dict) and isinstance(f.get("text"), str))
                n = str(b.get("name") or "").strip()
                if t and n and n not in facts: facts[n] = t[:400]
    return facts


def details(hid):
    if not hid: return [], {}
    try:
        s = urllib.request.urlopen(urllib.request.Request("https://fstravel.com/hotel/" + hid, headers=UA), timeout=30).read().decode("utf-8", "ignore")
    except Exception:
        return [], {}
    urls = list(dict.fromkeys(re.findall(r'https://apigate-tui\.fstravel\.com/api/geocontent/static/s600/hotel/[^"\'\s)\\]+?\.(?:jpe?g|webp|png)', s)))
    gal = []
    for u in urls[:3]:
        try: gal.append(img(u))
        except Exception: pass
    f = nuxt_facts(s)
    keep = ["Краткое описание", "Где находится", "Расстояние до моря", "Описание пляжа", "Бассейны и водные развлечения", "Удобства и услуги", "Для детей", "Формат отеля"]
    return gal, {k: f[k] for k in keep if k in f}


def prepare(out, picks):
    os.makedirs(out, exist_ok=True)
    items, req = [], None
    for p in picks:
        f, i = p.rsplit(":", 1)
        d = json.load(open(f)); req = req or d["so_rov"]
        g = d["top"][int(i) - 1]
        vs = sorted(g["variants"], key=lambda v: (v["seats"] != "bor", v["sale"]))
        best = vs[0]
        am = {}
        for v in g["variants"]:
            if v["d"] != best["d"] and v["seats"] != "yo'q" and (v["d"] not in am or am[v["d"]][2] > v["sale"]): am[v["d"]] = (v["d"], v["n"] + v["extra"], v["sale"])
        alts = sorted(am.values(), key=lambda x: (x[2], x[0]))[:4]
        gal, ru = details(g.get("hid"))
        items.append({"hotel": g["hotel"], "stars": g["stars"], "region": g["region"], "best": best, "alts": alts, "gallery": gal, "ru": ru, "uz": ""})
        print(f"+ {g['hotel']}: {len(gal)} rasm, {len(ru)} fakt", file=sys.stderr)
    json.dump({"req": req, "at": datetime.datetime.now().strftime("%d.%m.%Y %H:%M"), "items": items}, open(os.path.join(out, "taklif.json"), "w"), ensure_ascii=False, indent=1)


CSS = """
@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Manrope,system-ui,sans-serif;color:#10262e;background:#fff;font-size:12.5px}
.page{padding:28px 34px}
.top{display:flex;justify-content:space-between;align-items:center;background:#0b3440;color:#fff;padding:20px 34px}
.logo{display:flex;gap:10px;align-items:center;font:800 20px Unbounded,Manrope,sans-serif}.logo i{width:30px;height:30px;border-radius:8px;background:#ff6b3d;display:grid;place-items:center;font:900 16px Unbounded,sans-serif;font-style:normal}
.top .c{text-align:right;font-size:12px;line-height:1.5;opacity:.9}
h1{font:800 24px/1.2 Unbounded,Manrope,sans-serif;margin:4px 0 6px}.sub{color:#5a6f77;font-weight:600;margin-bottom:18px}
.opt{border:1px solid #dbe5e8;border-radius:16px;overflow:hidden;margin-bottom:16px;break-inside:avoid}
.gal{display:grid;grid-template-columns:2fr 1fr;gap:4px;height:200px;overflow:hidden}.gal img{width:100%;object-fit:cover;display:block}.gal>img{height:200px}.gal .s{display:grid;grid-template-rows:98px 98px;gap:4px}.gal .s img{height:98px}
.gal.one{grid-template-columns:1fr}.ph0{background:linear-gradient(135deg,#145565,#0b3440);height:110px;display:grid;place-items:center;color:#9fc2cb;font-size:20px}
.bd{padding:14px 18px 16px}.hd{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
.num{display:inline-block;background:#ff6b3d;color:#fff;border-radius:6px;padding:2px 8px;font-weight:800;font-size:11px;margin-bottom:6px}
.nm{font:800 17px/1.25 Unbounded,Manrope,sans-serif}.st{color:#f5a524;letter-spacing:1px}.loc{color:#5a6f77;font-weight:600;margin-top:3px}
.pr{text-align:right;white-space:nowrap}.pr b{font:800 22px Unbounded,Manrope,sans-serif;color:#0b3440;display:block}.pr span{color:#5a6f77;font-size:11.5px;font-weight:600}
.uz{margin:10px 0 0;line-height:1.55}
.tb{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}.tb div{background:#f1f6f7;border-radius:10px;padding:8px 10px}.tb small{display:block;color:#5a6f77;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.03em}.tb b{font-size:12.5px}
.alt{margin-top:10px;color:#5a6f77;font-size:11.5px}.alt b{color:#10262e}
.inc{background:#fff4ef;border-radius:12px;padding:12px 16px;margin:4px 0 14px;font-weight:600}
.ft{color:#5a6f77;font-size:11px;margin-top:6px}
"""


def render(out, tel, tg):
    D = json.load(open(os.path.join(out, "taklif.json")))
    r = D["req"]; ad = r["adults"]; kids = r["kids"]
    pax = f"{ad} kattalar" + (f" + {kids} bola" if kids else "")
    regions = sorted({city(i["region"]) for i in D["items"]})
    title = f"{r['countryUz']}" + (f" ({', '.join(regions)})" if regions else "")
    nights = f"{r['n1']}" + (f"–{r['n2']}" if r["n2"] != r["n1"] else "")
    cards, tgl = [], [f"✈️ {title}", f"🗓 {dd(r['from'])} – {dd(r['to'])} oralig'ida uchish · {nights} kecha · {pax}", ""]
    for k, it in enumerate(D["items"], 1):
        b = it["best"]; n = b["n"] + b["extra"]
        per = round(b["sale"] / ad) if not kids else None
        g = it["gallery"]
        gal = (f'<div class="gal"><img src="{g[0]}"><div class="s">' + "".join(f'<img src="{x}">' for x in g[1:3]) + "</div></div>") if len(g) >= 3 else \
              (f'<div class="gal one"><img src="{g[0]}"></div>' if g else f'<div class="ph0">{"★" * (it["stars"] or 0)}</div>')
        stars = "★" * (it["stars"] or 0)
        alts = " · ".join(f"<b>{dd(a[0])}</b> ({a[1]} kecha) {money(round(a[2] / ad) if not kids else a[2])}" for a in it["alts"])
        cards.append(f"""<section class="opt">{gal}<div class="bd"><div class="hd"><div><span class="num">{k}-variant</span>
<div class="nm">{H.escape(it['hotel'])} <span class="st">{stars}</span></div><div class="loc">📍 {H.escape(city(it['region']))}, {H.escape(r['countryUz'])}</div></div>
<div class="pr"><b>{money(per) if per else money(b['sale'])}</b><span>{'1 kishiga · jami ' + money(b['sale']) if per else 'jami, ' + pax}</span></div></div>
{f'<p class="uz">{H.escape(it["uz"])}</p>' if it.get("uz") else ''}
<div class="tb"><div><small>Uchish</small><b>{dd(b['d'])}{', ' + b['t'] if b['t'] else ''}</b></div><div><small>Davomiyligi</small><b>{n} kecha</b></div>
<div><small>Ovqatlanish</small><b>{MEAL.get(b['meal'], b['mealText'])}</b></div><div><small>Xona</small><b>{H.escape(re.sub(r'\s*/\s*\d\s*AD.*$', '', b['room'], flags=re.I))}</b></div></div>
{f'<div class="alt">Boshqa sanalar: {alts}</div>' if alts else ''}</div></section>""")
        tgl += [f"{k}️⃣ {it['hotel']} {stars}", f"📍 {city(it['region'])}", f"🛫 {dd(b['d'])}{' ' + b['t'] if b['t'] else ''} · {n} kecha · {MEAL.get(b['meal'], b['mealText'])}",
                f"💰 {money(per) + ' / 1 kishi (jami ' + money(b['sale']) + ')' if per else money(b['sale']) + ' jami'}"] + ([f"ℹ️ {it['uz']}"] if it.get("uz") else []) + [""]
    air = sorted({i["best"]["air"] for i in D["items"] if i["best"].get("air")})
    inc = "Narxga kiradi: Toshkentdan borish-qaytish aviabilet" + (f" ({', '.join(air)})" if air else "") + ", mehmonxonada yashash va ko'rsatilgan ovqatlanish."
    tgl += [inc, "", f"📞 {tel}  ·  Telegram: {tg}", "Vella Tour"]
    page = f"""<!doctype html><html lang="uz"><head><meta charset="utf-8"><title>Vella Tour — taklif</title>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Unbounded:wght@700;800&display=swap" rel="stylesheet"><style>{CSS}</style></head><body>
<div class="top"><div class="logo"><i>V</i>Vella Tour</div><div class="c">{H.escape(tel)}<br>Telegram: {H.escape(tg)}</div></div>
<div class="page"><h1>{H.escape(title)}</h1><div class="sub">Toshkentdan · {dd(r['from'])} – {dd(r['to'])} oralig'ida uchish · {nights} kecha · {pax}</div>
<div class="inc">{inc}</div>{''.join(cards)}<div class="ft">Narxlar {D['at']} holatiga ko'ra. Bron qilish uchun menejerga yozing.</div></div></body></html>"""
    open(os.path.join(out, "taklif.html"), "w").write(page)
    open(os.path.join(out, "telegram.txt"), "w").write("\n".join(tgl))
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        br = p.chromium.launch(); pg = br.new_page()
        pg.goto("file://" + os.path.abspath(os.path.join(out, "taklif.html"))); pg.wait_for_timeout(1200)
        pg.pdf(path=os.path.join(out, "taklif.pdf"), format="A4", print_background=True)
        br.close()
    print("tayyor:", os.path.join(out, "taklif.pdf"), file=sys.stderr)


if __name__ == "__main__":
    cmd, out = sys.argv[1], sys.argv[2]
    if cmd == "tayyorla": prepare(out, sys.argv[3:])
    else:
        a = sys.argv[3:]; opt = lambda k, d: a[a.index(k) + 1] if k in a else d
        render(out, opt("--tel", "+998 00 000 00 00"), opt("--tg", "@vellatour_operator"))

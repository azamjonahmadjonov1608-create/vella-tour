# Mehmonxona sahifalari uchun ma'lumot: tavsif bloklari + 4 ta rasm (Fun&Sun katalogidan).
# Har bir mehmonxona alohida faylga yoziladi: <out_dir>/<id>.json  (sahifa faqat ochilganda yuklaydi)
#   python3 hotelpack.py packages.json out_dir [limit]
import json, sys, re, io, os, base64, html, urllib.request, concurrent.futures as cf
from PIL import Image

pk = json.load(open(sys.argv[1])); out = sys.argv[2]; LIMIT = int(sys.argv[3]) if len(sys.argv) > 3 else 400
os.makedirs(out, exist_ok=True)
ids = []
for x in sorted(pk["pkgs"], key=lambda x: x["pp"]):
    if x["ph"] and x["ph"] not in ids: ids.append(x["ph"])
ids = [i for i in ids[:LIMIT] if not os.path.exists(os.path.join(out, i + ".json"))]
UA = {"User-Agent": "Mozilla/5.0"}

def clean(h):
    """HTML bo'lagini oddiy matn qatorlariga aylantiradi"""
    h = h.replace("​", "")
    items = re.findall(r"<li[^>]*>(.*?)</li>", h, re.S)
    rest = re.sub(r"<ul.*?</ul>", " ", h, flags=re.S)
    paras = [p for p in re.split(r"</p>|<br\s*/?>", rest) if p.strip()]
    tx = lambda s: html.unescape(re.sub(r"<[^>]+>", " ", s)).replace("\xa0", " ").strip()
    lines = [tx(p) for p in paras] + ["• " + tx(i) for i in items]
    return [re.sub(r"\s+", " ", l) for l in lines if len(tx(l)) > 1]

def nuxt_blocks(s):
    m = re.search(r'<script[^>]*id="__NUXT_DATA__"[^>]*>(.*?)</script>', s, re.S)
    if not m: return []
    arr = json.loads(m.group(1))
    def R(i, d=0):
        if d > 14: return None
        v = arr[i] if isinstance(i, int) and 0 <= i < len(arr) else i
        if isinstance(v, dict): return {k: R(x, d + 1) for k, x in v.items()}
        if isinstance(v, list):
            if v and isinstance(v[0], str) and v[0] in ("Reactive", "ShallowReactive", "Ref", "ShallowRef"): return R(v[1], d + 1)
            return [R(x, d + 1) for x in v]
        return v
    blocks = []
    for i, v in enumerate(arr):
        if isinstance(v, dict) and "descriptionBlocks" in v and "name" in v:
            o = R(i)
            items = []
            for b in (o.get("descriptionBlocks") or []):
                if not isinstance(b, dict): continue
                lines = []
                for f in (b.get("selectedFilters") or []):
                    if isinstance(f, dict) and isinstance(f.get("text"), str): lines += clean(f["text"])
                if lines: items.append({"n": str(b.get("name") or "").strip(), "l": lines[:25]})
            if items: blocks.append({"t": str(o.get("name") or "").replace("​", "").strip(), "i": items})
    # takrorlarni olib tashlash
    seen, res = set(), []
    for b in blocks:
        if b["t"] in seen: continue
        seen.add(b["t"]); res.append(b)
    return res[:10]

def img(u):
    raw = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=25).read()
    im = Image.open(io.BytesIO(raw)).convert("RGB"); w = 560
    im = im.resize((w, max(1, int(im.height * w / im.width))), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, "JPEG", quality=62, optimize=True, progressive=True)
    return "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()

def one(i):
    try:
        s = urllib.request.urlopen(urllib.request.Request("https://fstravel.com/hotel/" + i, headers=UA), timeout=30).read().decode("utf-8", "ignore")
        urls = list(dict.fromkeys(re.findall(r'https://apigate-tui\.fstravel\.com/api/geocontent/static/s600/hotel/[^"\'\s)\\]+?\.(?:jpe?g|webp|png)', s)))
        gal = []
        for u in urls[:4]:
            try: gal.append(img(u))
            except Exception: pass
        data = {"id": i, "blocks": nuxt_blocks(s), "gallery": gal}
        if not data["blocks"] and not gal: return i, False
        json.dump(data, open(os.path.join(out, i + ".json"), "w"), ensure_ascii=False)
        return i, True
    except Exception:
        return i, False

ok = 0
with cf.ThreadPoolExecutor(5) as ex:
    for i, r in ex.map(one, ids): ok += r
print(f"{len(ids)} ta so'raldi, {ok} ta yozildi -> {out}", file=sys.stderr)

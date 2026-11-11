# packages.json dagi mehmonxonalar rasmlarini kichraytirib bitta photos.json ga yig'adi (server bo'lmagan sahifa uchun)
import json,sys,re,io,base64,urllib.request,concurrent.futures as cf
from PIL import Image
pk=json.load(open(sys.argv[1])); out=sys.argv[2]; LIMIT=int(sys.argv[3]) if len(sys.argv)>3 else 260
seen=[]; 
for x in sorted(pk["pkgs"],key=lambda x:x["pp"]):
    if x["ph"] and x["ph"] not in seen: seen.append(x["ph"])
import os
prev=json.load(open(out)) if os.path.exists(out) else {}
ids=[i for i in seen[:LIMIT] if i not in prev]
UA={"User-Agent":"Mozilla/5.0"}
def get(i):
    try:
        html=urllib.request.urlopen(urllib.request.Request("https://fstravel.com/hotel/"+i,headers=UA),timeout=25).read().decode("utf-8","ignore")
        urls=list(dict.fromkeys(re.findall(r'https://apigate-tui\.fstravel\.com/api/geocontent/static/[^"\'\s)]+?\.(?:jpe?g|webp|png)',html)))
        u=next((u for u in urls if "/s600/" in u and "MainPhoto" in u),None) or next((u for u in urls if "/s600/" in u),None) or (urls[0] if urls else None)
        if not u: return i,None
        raw=urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=25).read()
        im=Image.open(io.BytesIO(raw)).convert("RGB"); w=360; im=im.resize((w,max(1,int(im.height*w/im.width))),Image.LANCZOS)
        b=io.BytesIO(); im.save(b,"JPEG",quality=60,optimize=True,progressive=True)
        return i,"data:image/jpeg;base64,"+base64.b64encode(b.getvalue()).decode()
    except Exception as e: return i,None
res=dict(prev)
with cf.ThreadPoolExecutor(4) as ex:
    for i,d in ex.map(get,ids):
        if d: res[i]=d
json.dump(res,open(out,"w"))
import os; print(len(ids),"id,",len(res),"rasm,",os.path.getsize(out)//1024,"KB",file=sys.stderr)

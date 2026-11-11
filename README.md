# Vella Tour server

Sayt + API. Mijoz saytda yo'nalish, sana va kishilar sonini tanlaydi.
Server 8 ta turoperatordan (Prestige, Kazunion, Selfie, Crystal Bay, Aqua Travel, Easy Booking, Fun&Sun, Malva)
bir vaqtda jonli narxlarni oladi, eng arzonidan boshlab ko'rsatadi. Bron arizasi Telegram'ga keladi
(operator nomi va komissiyasi faqat sizga ko'rinadi, mijozga emas).

Qidiruv uchun parol kerak emas — operatorlarning ochiq qidiruvi ishlatiladi. Parollar serverda saqlanmaydi.

## Serverga o'rnatish (Ubuntu VPS)

```bash
# 1) Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 2) Papkani serverga ko'chiring (masalan /opt/vella-server), keyin:
cd /opt/vella-server
cp .env.example .env
nano .env          # TELEGRAM_BOT_TOKEN va TELEGRAM_CHAT_ID ni yozing

# 3) Doimiy ishlashi uchun (24/7, server qayta yoqilsa ham)
sudo npm i -g pm2
pm2 start server.mjs --name vella
pm2 save && pm2 startup
```

Sayt: `http://SERVER_IP:3000`. Domen (vellatour.uz) va HTTPS uchun Nginx + Certbot qo'yiladi:

```nginx
server {
  server_name vellatour.uz www.vellatour.uz;
  location / { proxy_pass http://127.0.0.1:3000; proxy_read_timeout 90s; }
}
```
```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo certbot --nginx -d vellatour.uz -d www.vellatour.uz
```

## Onlayn sotuv (to'lov → bron → hujjat)
1. Mijoz paketni tanlaydi, har bir turistning pasport ma'lumotini kiritadi.
2. Server narxni o'zi tekshiradi (mijoz narxni o'zgartira olmaydi), so'mga o'giradi (CBU kursi), Payme/Click havolasini beradi.
3. To'lov tushishi bilan: sizga Telegram'ga to'liq ma'lumot + avtomatik bron boshlanadi (lib/booking.mjs).
   Operator adapteri yoqilmaguncha buyurtma "Bron qilinmoqda" holatida turadi va sizga "qo'lda bron qiling" xabari keladi.
4. Hujjat (aviabilet/vaucher) tayyor bo'lgach admin orqali havola qo'shasiz — mijoz buyurtma sahifasida (order.html) ko'radi.

**Payme kabinetida** endpoint: `https://SAYT/api/payme`
**Click kabinetida** Prepare: `https://SAYT/api/click/prepare`, Complete: `https://SAYT/api/click/complete`

Admin (ADMIN_KEY bilan):
```bash
curl "https://SAYT/api/admin/orders?key=ADMIN_KEY"
curl -X POST https://SAYT/api/admin/order -H "x-admin-key: ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"id":"554624","status":"docs","docUrl":"https://.../vaucher.pdf","docTitle":"Vaucher"}'
```
Holatlar: new → paid → booking → booked → docs (yoki cancelled).

Muhim: `data/orders.json` da turistlarning pasport ma'lumotlari saqlanadi — server faqat HTTPS orqali ishlasin va papkani zaxiralang.

## Vitrinalar (yonayotgan turlar, ommabop yo'nalishlar, narxlar taqvimi)
Ular `public/packages.json` va `public/photos.json` dan chiziladi. Har kuni yangilash:
```bash
pm2 start "node snapshot.mjs && python3 photopack.py public/packages.json public/photos.json 350 && python3 hotelpack.py public/packages.json public/hotels 300" --name vella-snapshot --cron "40 7 * * *" --no-autorestart
```
(photopack va hotelpack uchun: `pip install pillow`. hotelpack mehmonxona sahifalari uchun tavsif va rasmlarni public/hotels/<id>.json ga yozadi)

## Menejerlar uchun tezkor qidiruv (sayt + Telegram bot)
Menejer oddiy matn yozadi: «Turkiya 15–20 dekabr 7 kecha 2 katta + 1 bola 6 yosh 4 yulduz hammasi kiritilgan».
Server barcha operatorlardan jonli narx oladi (30–60 soniya) va qaytaradi:
- menejer uchun: mehmonxonalar, sana, xona, joy holati, har bir operatordagi narx va 20% ustamali sotuv narxi;
- mijoz uchun: 3 ta variant (rasm, joylashuv, plyajgacha masofa, narx) — operator nomi va ustamasiz, forward qilishga tayyor.

Sayt: `https://saytingiz/#menejer` — .env dagi MANAGER_KEY bilan kiriladi.
Telegram: .env ga TELEGRAM_BOT_TOKEN va TELEGRAM_MANAGERS yozing, serverni qayta ishga tushiring, botga so'rov yozing.
Bot buyruqlari: /start — yordam, /taklif 2 5 7 — ro'yxatdagi boshqa mehmonxonalardan taklif tuzish.
Buyruq qatoridan: `node tur.mjs "Vyetnam 8 kunlik 5 dekabrdan 2 kishi"`

## API
- `POST /api/tur` — `{ text, picks? }`, sarlavha `x-key: MANAGER_KEY` → menejer qidiruvi
- `GET /api/countries` — yo'nalishlar ro'yxati
- `GET /api/search?country=оаэ&from=2026-12-01&to=2026-12-10&nmin=5&nmax=7&adults=2&kids=1&ages=6`
- `POST /api/ariza` — `{ text, src }` → Telegram
- `POST /api/order` — buyurtma yaratish, `GET /api/order?id=` — holat
- `POST /api/payme`, `POST /api/click/prepare|complete` — to'lov tizimlari

## Sozlash
- `lib/operators.mjs` — operatorlar ro'yxati (yangi SAMO operatorini qo'shish uchun bitta qator yetarli).
- Centrum Holidays serverdan kelgan so'rovlarni bloklaydi — hozircha o'chirilgan.
- Anex, Mir-Jahon, Asialuxe, Velikolepniy Vek — boshqa tizim, keyingi bosqichda qo'shiladi.

## Bepul joylash: GitHub + Render (kartasiz)
1. GitHub'da **Private** repo oching va shu papkadagi fayllarni yuklang (.env YUKLANMAYDI — token sir).
2. render.com → GitHub bilan kiring → New → Web Service → repo → Instance: **Free**.
   Build Command: bo'sh (yoki `echo ok`), Start Command: `node server.mjs`.
   Environment: TELEGRAM_BOT_TOKEN, TELEGRAM_MANAGERS, MANAGER_KEY, MARKUP_PERCENT=20, DAILY_SNAPSHOT=1
3. Render bepul server 15 daqiqa so'rovsiz qolsa uxlaydi. Uxlamasligi uchun cron-job.org (bepul) da
   har 10 daqiqada `https://<sizning-nom>.onrender.com/api/ping` ga so'rov yuboradigan vazifa oching.

// Menejerlar savollariga tayyor javoblar (bron, viza, hujjatlar, to'lov, ovqat turlari va h.k.).
// Bot savolni taniydi: "bron qanday qilinadi?", "Turkiyaga viza kerakmi?" — qidiruv o'rniga shu javob qaytadi.
import { COUNTRY_UZ } from "./operators.mjs";

// O'zbekiston fuqarolari (oddiy pasport) uchun viza — 2026-yil 13-noyabr holatiga ochiq manbalardan.
// Qoidalar tez o'zgaradi: javobda doim "operatordan tasdiqlang" deyiladi.
const VISA_DATE = "13.11.2026";
export const VISA = {
  "турция": "✅ Vizasiz — 180 kun ichida 90 kungacha.",
  "оаэ": "✅ Vizasiz — 30 kungacha. Chegarada qaytish chiptasi va mehmonxona broni so'ralishi mumkin — paket turda bular bor.",
  "египет": "🟡 Viza kerak: e-viza (30 kun); Sharm-el-Sheyx va Taba uchun aeroportda 15 kunlik viza. Misr yangi qattiq qoidalarni 2027-yil 1-martgacha kechiktirgan — hozircha amaldagi tartib.",
  "вьетнам": "🟡 E-viza kerak (90 kungacha). Fukuok oroliga to'g'ridan-to'g'ri uchilsa — 30 kun vizasiz. 2026-yil iyunidan barcha xorijliklar kirishdan 72 soat oldin onlayn ro'yxatdan o'tadi (QR-kod).",
  "таиланд": "🔴 2026-yil 15-sentyabrdan vizasiz kirish bekor qilingan — viza kerak (oldin 60 kun vizasiz edi). Safardan oldin albatta tekshiring.",
  "малайзия": "✅ Vizasiz — 30 kungacha.",
  "индонезия": "🟡 Aeroportda viza (VOA) yoki e-VOA — 30 kun.",
  "мальдивы": "✅ Aeroportda bepul viza — 30 kun.",
  "шри-ланка": "🟡 ETA (onlayn ruxsat) yoki aeroportda viza — 30 kun.",
  "китай": "✅ Vizasiz (2025-yil 1-iyundan) — har safar 30 kungacha, 180 kun ichida jami 90 kun. Gonkong va Makao — alohida qoida.",
  "грузия": "✅ Vizasiz — 365 kungacha.",
  "азербайджан": "✅ Vizasiz — 90 kungacha.",
  "катар": "🟡 Manbalarda vizasiz 30 kun ham, e-viza ham ko'rsatilgan — operatordan aniq so'rang.",
  "оман": "✅ Vizasiz — 14 kungacha.",
  "индия": "🟡 E-viza kerak (belgilangan aeroportlar orqali kiriladi).",
  "япония": "🔴 Viza kerak (onlayn ariza mumkin).",
  "саудовская аравия": "🟡 E-viza yoki aeroportda viza.",
  "сейшелы": "✅ Aeroportda bepul tashrif ruxsatnomasi — 3 oygacha.",
  "армения": "✅ Vizasiz.",
  "иордания": "✅ Vizasiz (2025-yil 25-sentyabrdan) — 30 kungacha.",
  "сингапур": "🟡 E-viza kerak.",
  "испания": "🔴 Shengen vizasi kerak.", "италия": "🔴 Shengen vizasi kerak.", "германия": "🔴 Shengen vizasi kerak.",
  "венгрия": "🔴 Shengen vizasi kerak.", "польша": "🔴 Shengen vizasi kerak.", "словения": "🔴 Shengen vizasi kerak."
};

const TOPICS = {
  bron: {
    title: "📝 Bron qanday qilinadi",
    re: /bron|брон|band\s*qil|zakaz|заказ|rezerv|резерв/i,
    text: () => `📝 BRON QILISH TARTIBI

1) Botda turni toping → «📝 mijozga» → ustamani tanlang. Bot «🔒 FAQAT SIZ UCHUN» blokida operator nomi, operator kodi (masalan GDS/1572470) va asl narxni beradi.
2) Mijozga taklifni (rasmlar + matn) forward qiling, rozilik oling.
3) Mijozdan turistlar ma'lumotini oling (pastda ro'yxat).
4) Shu operatorning agent kabinetiga kiring, xuddi shu sana/kecha/mehmonxona/xona/ovqatni toping (kod bo'yicha solishtiring) va turistlarni kiritib bron qiling.
5) Operator tasdiqlaydi («joy: bor» bo'lsa tez, «so'rov bo'yicha» bo'lsa bir necha soatdan 1 kungacha) va to'lov hisobini (invoys) beradi.
6) Operatorga invoysdagi muddatda to'lang. Mijozdan oldindan to'lov oling.
7) Uchishdan 1–3 kun oldin operator hujjatlarni beradi: aviabilet, vaucher, sug'urta → mijozga yuborasiz.

👤 Har bir turist uchun kerak:
• Ism-familiya — pasportdagidek LOTINCHA
• Tug'ilgan sana, jinsi
• Pasport raqami, berilgan va amal qilish sanasi
• Telefon raqami (asosiy turist)

⚠️ Bot o'zi operator saytida bron qilmaydi — bu operator kabinetiga login va to'lov majburiyatini talab qiladi, shuning uchun bronni menejer tasdiqlab qiladi.`
  },
  viza: {
    title: "🛂 Viza",
    re: /viza|визa|виза|visa/i,
    text: (country) => {
      if (country && VISA[country]) return `🛂 ${COUNTRY_UZ[country] || country} — O'zbekiston fuqarolari uchun:\n${VISA[country]}\n\nℹ️ ${VISA_DATE} holatiga ochiq manbalardan. Qoidalar tez o'zgaradi — bron oldidan operatordan tasdiqlang.`;
      if (country) return `🛂 ${COUNTRY_UZ[country] || country} bo'yicha viza ma'lumoti bazada yo'q — operatordan so'rang.`;
      return `🛂 VIZA — O'zbekiston fuqarolari uchun (${VISA_DATE} holatiga):\n\n` +
        Object.entries(VISA).filter(([k]) => !/испания|италия|германия|венгрия|польша|словения/.test(k)).map(([k, v]) => `• ${COUNTRY_UZ[k] || k}: ${v}`).join("\n") +
        `\n• Yevropa (Ispaniya, Italiya, Germaniya, Vengriya…): 🔴 Shengen vizasi kerak.\n\nBitta davlat uchun so'rang: «Vyetnamga viza kerakmi?». Bron oldidan operatordan tasdiqlang.`;
    }
  },
  hujjat: {
    title: "📄 Hujjatlar",
    re: /hujjat|документ|pasport|паспорт|metrika|метрик|ishonchnoma|доверенн|rozilik|согласи/i,
    text: (country) => `📄 SAFARGA KERAKLI HUJJATLAR

• Xorijga chiqish pasporti (biometrik). Ko'p davlatlar qaytish sanasidan keyin kamida 6 oy amal qilishini talab qiladi — muddatini tekshiring.
• Bolalar uchun: o'z pasporti + tug'ilganlik haqida guvohnoma (metrika) nusxasi.
• Bola ota-onasidan faqat biri bilan yoki boshqa odam bilan chiqsa — qolgan ota-onaning notarial tasdiqlangan roziligi (chegarada so'ralishi mumkin).
• Operator beradi: aviabilet, mehmonxona vaucheri, tibbiy sug'urta.
• Viza kerak bo'lsa — viza yoki e-viza chop etilgan holda.${country && VISA[country] ? `\n\n🛂 ${COUNTRY_UZ[country]}: ${VISA[country]}` : ""}`
  },
  tolov: {
    title: "💳 To'lov",
    re: /to'?lov|tolov|тўлов|оплат|pul\s*to|qachon\s*to|invoys|инвойс|предоплат|oldindan/i,
    text: () => `💳 TO'LOV

• Operator bronni tasdiqlagach invoys (hisob) beradi — to'lov muddati shu invoysda yoziladi. Yaqin sanadagi turlarda muddat qisqa bo'ladi (ba'zan bir kun).
• Muddatida to'lanmasa operator bronni bekor qilishi mumkin.
• Mijozdan bron paytida oldindan to'lov oling, qolganini operatorga to'lashdan oldin.
• Narxlar dollarda; so'mda to'lansa — to'lov kunidagi kurs bo'yicha.
• Botdagi narx «jami» — barcha turistlar uchun birga (1 kishiga narx alohida yoziladi).`
  },
  bekor: {
    title: "❌ Bekor qilish",
    re: /bekor|отмен|qaytar|возврат|shtraf|штраф|jarima|аннул/i,
    text: () => `❌ BRONNI BEKOR QILISH

• Bekor qilish shartlari har bir operatorda o'zicha — operator kabinetidagi «условия аннуляции»ni tekshiring.
• Odatda bron tasdiqlangandan keyin bekor qilinsa, operator haqiqiy xarajatlarni (jarima) ushlab qoladi. Uchishga qancha yaqin bo'lsa, jarima shuncha katta.
• Charter aviabiletlar ko'pincha qaytarilmaydi.
• Mijozga «safarga chiqa olmaslik» sug'urtasini (невыезд) taklif qiling — kasallik va h.k. holatlarda pulni qoplaydi.`
  },
  ovqat: {
    title: "🍽 Ovqat turlari",
    re: /ovqat|питани|\b(ai|uai|bb|hb|fb|ro)\b|all\s*incl|hammasi\s*kiritil|nonushta|завтрак/i,
    text: () => `🍽 OVQAT TURLARI

• RO — ovqatsiz (faqat xona)
• BB — faqat nonushta
• HB — nonushta + kechki ovqat
• FB — nonushta + tushlik + kechki ovqat
• AI — «hammasi kiritilgan»: 3 mahal ovqat + yengil ovqatlar + mahalliy ichimliklar
• UAI — «ultra hammasi kiritilgan»: AI + qo'shimcha (ba'zi import ichimliklar, à la carte restoranlar)

Tur so'rovida yozing: «nonushta», «HB», «hammasi kiritilgan».`
  },
  joy: {
    title: "🪑 Joy holati",
    re: /joy\s*(holat|bor|yo'?q)|so'?rov\s*bo'?yicha|stop\s*sale|стоп|qachon\s*tasdiq|tasdiqla/i,
    text: () => `🪑 «JOY» HOLATI (botdagi belgilar)

• bor — mehmonxonada joy bor, bron tez tasdiqlanadi.
• so'rov bo'yicha — operator mehmonxonadan so'raydi: tasdiq bir necha soatdan 1 kungacha, rad etilishi ham mumkin. Mijozga zaxira variant tayyorlab qo'ying.
• yo'q — sotuv to'xtatilgan (stop sale).
• Reysdagi joylar «🔍 batafsil»da alohida ko'rsatiladi (bor / kam / so'rov / yo'q).`
  },
  narx: {
    title: "📦 Narxga nima kiradi",
    re: /narx(ga|i)?\s*(nima|ichida)|nima\s*kiradi|kiradimi|включ|bagaj|багаж|transfer|трансфер|sug'?urta|страхов|qo'?shimcha/i,
    text: () => `📦 PAKET NARXIGA ODATDA KIRADI

• Aviabilet (borish-qaytish)
• Mehmonxona (tanlangan xona va ovqat bilan)
• Transfer aeroport ↔ mehmonxona (guruh avtobusi yoki individual — «🔍 batafsil»da yoziladi)
• Tibbiy sug'urta

Har bir tur uchun aniq tarkib, bagaj (masalan 20 kg), reys vaqtlari va qo'shimcha xizmatlar (individual transfer, ekskursiya va h.k.) — «🔍 batafsil» tugmasida.
Odatda kirmaydi: viza (kerak bo'lsa), ba'zi davlatlardagi turist solig'i, qo'shimcha xizmatlar.`
  },
  bola: {
    title: "👶 Bolalar",
    re: /bola|ребен|дет|chaqaloq|младен|infant|yosh(i|da)/i,
    text: () => `👶 BOLALAR

• Bolalar narxi yoshiga bog'liq — yosh oralig'ini operator belgilaydi (odatda 2 yoshgacha — chaqaloq, 2–11/12 yosh — bola).
• Shuning uchun so'rovda bolaning yoshini albatta yozing: «2 katta + 1 bola 6 yosh». Bot narxni aynan shu yosh bilan oladi.
• Hujjatlar: bolaning pasporti, metrika; bitta ota-ona bilan chiqsa — ikkinchisining notarial roziligi.`
  },
  yulduz: {
    title: "⭐ Yulduzlar",
    re: /yulduz|звезд|\d\s*\*|kategoriya/i,
    text: () => `⭐ YULDUZLAR (mehmonxona toifasi)

• 3★ — oddiy, qulay; xizmat kam.
• 4★ — yaxshi xonalar, basseyn, ko'proq xizmat — eng ko'p sotiladigan.
• 5★ — yuqori darajadagi xizmat, katta hudud, restoranlar, SPA.
Toifa davlatga qarab farq qiladi (Turkiya 4★ ≈ Misr 5★ deyiladi). So'rovda yozing: «4 yulduz» — bot 4★ va undan yuqorisini ko'rsatadi.`
  },
  bot: {
    title: "🤖 Bot nima qiladi",
    re: /bot\s*(nima|qanday)|qanday\s*ishlat|yordam|помощ|help/i,
    text: () => `🤖 BOT NIMA QILADI

• Tur so'rovini oddiy matnda yozing: «Turkiya 15–20 dekabr 7 kecha 2 katta 4 yulduz». Bot barcha hamkor operatorlardan jonli narxlarni oladi.
• Har bir operator alohida: rasmlar, reyslar, narxga nima kiradi, ovqat/xona bo'yicha narx farqi.
• Tugmalar: 🔍 batafsil · 📝 mijozga (ustama tanlab tayyor taklif) · 🖼 rasmlar · ➕ ko'proq.
• Savol ham bering: «bron qanday qilinadi?», «Vyetnamga viza kerakmi?», «HB nima?».`
  }
};

const QUESTION = /\?|qanday|qanaqa|qancha|nima|nega|qachon|qayer|qaysi|kerakmi|mumkinmi|bormi|kiradimi|beradimi|bo'ladimi|как|сколько|нужн|можно|что такое|когда|где/i;
// tanish tartibi (aniqroq mavzu oldin): "bronni bekor qilish" -> bekor, "bron uchun hujjat" -> hujjat
const ORDER = ["viza", "bekor", "tolov", "hujjat", "joy", "bron", "narx", "ovqat", "bola", "yulduz", "bot"];
const MENU = ["bron", "viza", "hujjat", "tolov", "bekor", "joy", "narx", "ovqat", "bola", "yulduz", "bot"];

export const isQuestion = (t) => QUESTION.test(t);

// text -> { key, text } yoki null. country — parseQuery natijasidagi davlat (bo'lsa)
export function faqAnswer(text, country) {
  const t = String(text || "");
  for (const k of ORDER) if (TOPICS[k].re.test(t)) return { key: k, text: TOPICS[k].text(country) };
  return null;
}

export const faqByKey = (k, country) => TOPICS[k] ? TOPICS[k].text(country) : null;
export const FAQ_MENU = MENU.map(k => ({ key: k, title: TOPICS[k].title }));

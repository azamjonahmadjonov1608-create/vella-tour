// Turoperatorlar ro'yxati. Hammasi SAMO-tour tizimida ishlaydi va
// qidiruv (narxlarni ko'rish) uchun login talab qilmaydi.
// commission — fayldagi "Foyda" ustuni (faqat serverda, mijozga ko'rsatilmaydi).
// fallback — sahifadan ro'yxat o'qib bo'lmasa ishlatiladigan IDlar.

export const OPERATORS = [
  { key: "prestige",    name: "Prestige Travel",  base: "https://online.uz-prestige.com",      commission: 0.07 },
  { key: "kazunion",    name: "Kazunion",         base: "https://online.kazunion.com",         commission: 0.07 },
  // Centrum Holidays serverdan kelgan so'rovlarni uzib qo'yadi (faqat brauzer orqali, login bilan ishlaydi) — vaqtincha o'chirilgan
  { key: "centrum",     name: "Centrum Holidays", base: "https://online.centrum-holidays.com", commission: 0.10, disabled: true,
    fallback: { tas: "1853", currency: "2", states: { "36": "Азербайджан", "43": "Вьетнам", "29": "Грузия", "10": "Египет", "50": "Мальдивы", "13": "ОАЭ", "76": "Оман", "19": "Таиланд", "9": "Турция", "52": "Шри-Ланка" } } },
  { key: "selfie",      name: "Selfie Travel",    base: "https://b2b.selfietravel.kz",         commission: 0.09 },
  { key: "crystalbay",  name: "Crystal Bay",      base: "https://booking-uz.crystalbay.com",   commission: 0.07 },
  { key: "aqua",        name: "Aqua Travel Plus", base: "https://online.aquatravelplus.com",   commission: 0.07 },
  { key: "easybooking", name: "Easy Booking",     base: "https://tours.easybooking.uz",        commission: 0.11 },
  { key: "funsun",      name: "Fun&Sun",          base: "https://b2b.fstravel.asia",           commission: 0 },
  { key: "malva",       name: "Malva Tour",       base: "https://malvatouroperator.uz",        commission: 0 }
];

// Mamlakatlar: kalit — operator ro'yxatidagi ruscha nom (kichik harf, normallashtirilgan)
export const COUNTRY_ALIASES = {
  "шри ланка": "шри-ланка",
  "сейшельские острова": "сейшелы",
  "оаэ": "оаэ"
};

export const COUNTRY_UZ = {
  "оаэ": "BAA (Dubay)", "египет": "Misr", "турция": "Turkiya", "грузия": "Gruziya", "азербайджан": "Ozarbayjon",
  "вьетнам": "Vyetnam", "таиланд": "Tailand", "малайзия": "Malayziya", "мальдивы": "Maldiv orollari",
  "индонезия": "Indoneziya (Bali)", "китай": "Xitoy", "катар": "Qatar", "оман": "Ummon", "шри-ланка": "Shri-Lanka",
  "маврикий": "Mavrikiy", "япония": "Yaponiya", "сейшелы": "Seyshel orollari", "занзибар": "Zanzibar",
  "саудовская аравия": "Saudiya Arabistoni", "армения": "Armaniston", "иордания": "Iordaniya", "индия": "Hindiston",
  "сингапур": "Singapur", "танзания": "Tanzaniya", "марокко": "Marokash", "испания": "Ispaniya", "италия": "Italiya",
  "германия": "Germaniya", "венгрия": "Vengriya", "польша": "Polsha", "словения": "Sloveniya", "мексика": "Meksika",
  "доминиканская республика": "Dominikana"
};

// To'lovdan keyingi bron. Hozircha avtomatik bron yo'q: menejerga Telegramda aniq ko'rsatma yuboriladi.
export async function autoBook(o, { updateOrder, telegram }) {
  updateOrder(o.id, { status: "booking" });
  await telegram(`🧾 #${o.id} — operatorda QO'LDA bron qiling:\n${o.pkg.opName} · kod ${o.pkg.code || "—"}\n${o.pkg.hotel}, ${o.pkg.date}, ${o.pkg.nights} kecha, ${o.pkg.meal}, ${o.pkg.room}\nBron qilgach admin bo'limida holatni "booked" qiling.`);
}

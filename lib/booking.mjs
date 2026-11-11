// To'lovdan keyin operator tizimida avtomatik bron.
// Har bir operator uchun adapter sinov bronidan keyin yoqiladi (ADAPTERS ga qo'shiladi).
// Adapter yo'q bo'lsa — buyurtma "booking" holatiga o'tadi va sizga qo'lda bron qilish uchun xabar boradi.

const ADAPTERS = {
  // prestige: async (order, creds) => ({ claimNo: "..." }),   // sinov bronidan keyin yoziladi
};

export async function autoBook(order, { updateOrder, telegram }) {
  const adapter = ADAPTERS[order.pkg.op];
  updateOrder(order.id, { status: "booking" });
  if (!adapter) {
    await telegram(`🛠 #${order.id}: ${order.pkg.opName} uchun avtomatik bron hali yoqilmagan — kabinetda qo'lda bron qiling, keyin admin orqali holatni "booked" qiling.`);
    return;
  }
  const creds = {
    login: process.env[`OP_${order.pkg.op.toUpperCase()}_LOGIN`],
    password: process.env[`OP_${order.pkg.op.toUpperCase()}_PASSWORD`]
  };
  if (!creds.login || !creds.password) throw new Error(`.env da OP_${order.pkg.op.toUpperCase()}_LOGIN/PASSWORD yo'q`);
  const r = await adapter(order, creds);
  updateOrder(order.id, { status: "booked", opClaimNo: r.claimNo });
  await telegram(`✅ #${order.id} avtomatik bron qilindi: ${order.pkg.opName}, bron raqami ${r.claimNo}`);
}

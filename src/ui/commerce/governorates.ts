/**
 * Egypt's 27 real administrative governorates — plain geography, not a
 * business rule. Which of these are actually SERVICEABLE is a fact the
 * server alone knows (via `ShippingZone` rows an operator creates) — this
 * list only lets the address form offer a real, correct set of choices
 * instead of a free-text field; `POST /api/v1/checkout/address` remains
 * the sole authority on serviceability and returns `unserviceable_address`
 * for any governorate with no matching zone.
 */
export const EGYPT_GOVERNORATES = [
  "القاهرة",
  "الجيزة",
  "الإسكندرية",
  "الدقهلية",
  "البحر الأحمر",
  "البحيرة",
  "الفيوم",
  "الغربية",
  "الإسماعيلية",
  "المنوفية",
  "المنيا",
  "القليوبية",
  "الوادي الجديد",
  "السويس",
  "أسوان",
  "أسيوط",
  "بني سويف",
  "بورسعيد",
  "دمياط",
  "الشرقية",
  "جنوب سيناء",
  "كفر الشيخ",
  "مطروح",
  "الأقصر",
  "قنا",
  "شمال سيناء",
  "سوهاج",
] as const;

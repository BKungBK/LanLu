import type { LanluState } from "./types";

export const DEMO_TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

const date = (dayOffset: number) => {
  const value = new Date(`${DEMO_TODAY}T12:00:00+07:00`);
  value.setDate(value.getDate() + dayOffset);
  return value.toISOString().slice(0, 10);
};

export const initialState: LanluState = {
  shop: {
    name: "บ้านชงกาแฟ",
    ownerName: "คุณมิน",
    timezone: "Asia/Bangkok",
    currency: "THB",
    onboarded: true,
  },
  menuItems: [
    { id: "menu-americano", name: "อเมริกาโน่เย็น", category: "กาแฟ", price: 75, active: true },
    { id: "menu-latte", name: "ลาเต้เย็น", category: "กาแฟ", price: 85, active: true },
    { id: "menu-cocoa", name: "โกโก้เย็น", category: "อื่น ๆ", price: 80, active: true },
    { id: "menu-matcha", name: "มัทฉะลาเต้", category: "ชา", price: 95, active: true },
    { id: "menu-black-orange", name: "แบล็กออเรนจ์", category: "กาแฟ", price: 90, active: true },
    { id: "menu-thai-tea", name: "ชาไทยเย็น", category: "ชา", price: 70, active: true },
  ],
  ingredients: [
    { id: "ing-coffee", name: "เมล็ดกาแฟ house blend", unit: "กก.", quantityOnHand: 4.4, reorderPoint: 3, unitCost: 520, nearestExpiry: date(17), supplier: "Northern Beans" },
    { id: "ing-milk", name: "นมสด", unit: "ลิตร", quantityOnHand: 8.2, reorderPoint: 10, unitCost: 48, nearestExpiry: date(2), supplier: "Fresh Dairy" },
    { id: "ing-orange", name: "น้ำส้ม", unit: "ลิตร", quantityOnHand: 5.8, reorderPoint: 4, unitCost: 68, nearestExpiry: date(4), supplier: "Sun Press" },
    { id: "ing-matcha", name: "ผงมัทฉะ", unit: "ถุง", quantityOnHand: 1.2, reorderPoint: 1, unitCost: 780, nearestExpiry: date(41), supplier: "Uji Select" },
    { id: "ing-syrup", name: "ไซรัปวานิลลา", unit: "ขวด", quantityOnHand: 2.4, reorderPoint: 1, unitCost: 245, nearestExpiry: date(80), supplier: "Sweet Lab" },
    { id: "ing-cup", name: "แก้ว 22 oz", unit: "ชิ้น", quantityOnHand: 142, reorderPoint: 80, unitCost: 2.8, supplier: "Pack & Sip" },
  ],
  recipes: [
    { menuItemId: "menu-americano", updatedAt: date(-4), lines: [{ ingredientId: "ing-coffee", quantity: 0.018 }, { ingredientId: "ing-cup", quantity: 1 }] },
    { menuItemId: "menu-latte", updatedAt: date(-4), lines: [{ ingredientId: "ing-coffee", quantity: 0.018 }, { ingredientId: "ing-milk", quantity: 0.18 }, { ingredientId: "ing-cup", quantity: 1 }] },
    { menuItemId: "menu-cocoa", updatedAt: date(-3), lines: [{ ingredientId: "ing-milk", quantity: 0.18 }, { ingredientId: "ing-syrup", quantity: 0.012 }, { ingredientId: "ing-cup", quantity: 1 }] },
    { menuItemId: "menu-matcha", updatedAt: date(-2), lines: [{ ingredientId: "ing-matcha", quantity: 0.012 }, { ingredientId: "ing-milk", quantity: 0.16 }, { ingredientId: "ing-cup", quantity: 1 }] },
    { menuItemId: "menu-black-orange", updatedAt: date(-2), lines: [{ ingredientId: "ing-coffee", quantity: 0.018 }, { ingredientId: "ing-orange", quantity: 0.15 }, { ingredientId: "ing-cup", quantity: 1 }] },
  ],
  sales: [
    { id: "sale-1", businessDate: date(-6), occurredAt: `${date(-6)}T16:42:00+07:00`, orderCount: 29, idempotencyKey: "demo-sale-1", lines: [{ menuItemId: "menu-americano", quantity: 22, priceSnapshot: 75, cogsSnapshot: 12 }, { menuItemId: "menu-latte", quantity: 15, priceSnapshot: 85, cogsSnapshot: 22 }] },
    { id: "sale-2", businessDate: date(-5), occurredAt: `${date(-5)}T17:10:00+07:00`, orderCount: 34, idempotencyKey: "demo-sale-2", lines: [{ menuItemId: "menu-americano", quantity: 28, priceSnapshot: 75, cogsSnapshot: 12 }, { menuItemId: "menu-matcha", quantity: 13, priceSnapshot: 95, cogsSnapshot: 20 }] },
    { id: "sale-3", businessDate: date(-4), occurredAt: `${date(-4)}T17:36:00+07:00`, orderCount: 31, idempotencyKey: "demo-sale-3", lines: [{ menuItemId: "menu-latte", quantity: 26, priceSnapshot: 85, cogsSnapshot: 22 }, { menuItemId: "menu-cocoa", quantity: 19, priceSnapshot: 80, cogsSnapshot: 12 }] },
    { id: "sale-4", businessDate: date(-3), occurredAt: `${date(-3)}T18:04:00+07:00`, orderCount: 42, idempotencyKey: "demo-sale-4", lines: [{ menuItemId: "menu-americano", quantity: 34, priceSnapshot: 75, cogsSnapshot: 12 }, { menuItemId: "menu-black-orange", quantity: 24, priceSnapshot: 90, cogsSnapshot: 23 }] },
    { id: "sale-5", businessDate: date(-2), occurredAt: `${date(-2)}T18:12:00+07:00`, orderCount: 45, idempotencyKey: "demo-sale-5", lines: [{ menuItemId: "menu-americano", quantity: 38, priceSnapshot: 75, cogsSnapshot: 12 }, { menuItemId: "menu-latte", quantity: 28, priceSnapshot: 85, cogsSnapshot: 22 }, { menuItemId: "menu-matcha", quantity: 18, priceSnapshot: 95, cogsSnapshot: 20 }] },
    { id: "sale-6", businessDate: date(-1), occurredAt: `${date(-1)}T18:25:00+07:00`, orderCount: 48, idempotencyKey: "demo-sale-6", lines: [{ menuItemId: "menu-americano", quantity: 42, priceSnapshot: 75, cogsSnapshot: 12 }, { menuItemId: "menu-black-orange", quantity: 31, priceSnapshot: 90, cogsSnapshot: 23 }, { menuItemId: "menu-cocoa", quantity: 16, priceSnapshot: 80, cogsSnapshot: 12 }] },
    { id: "sale-today", businessDate: DEMO_TODAY, occurredAt: `${DEMO_TODAY}T18:20:00+07:00`, orderCount: 52, idempotencyKey: "demo-sale-today", lines: [{ menuItemId: "menu-americano", quantity: 46, priceSnapshot: 75, cogsSnapshot: 12 }, { menuItemId: "menu-black-orange", quantity: 34, priceSnapshot: 90, cogsSnapshot: 23 }, { menuItemId: "menu-latte", quantity: 24, priceSnapshot: 85, cogsSnapshot: 22 }] },
  ],
  inventoryMovements: [],
  recommendations: [
    { id: "reco-milk", type: "stock", severity: "warning", title: "นมสดใกล้จุดสั่งซื้อ", body: "เหลือ 8.2 ลิตร ต่ำกว่าจุดสั่งซื้อ 10 ลิตร ควรเติมก่อนรอบพรุ่งนี้", action: "order_ingredient", createdAt: `${DEMO_TODAY}T18:30:00+07:00` },
    { id: "reco-orange", type: "expiry", severity: "critical", title: "ใช้น้ำส้มก่อนหมดอายุ", body: "ล็อตที่ใกล้สุดหมดอายุใน 4 วัน แต่ยังเหลือ 5.8 ลิตร ลองดันเมนูแบล็กออเรนจ์ช่วงบ่าย", action: "prepare_ingredient", createdAt: `${DEMO_TODAY}T18:30:00+07:00` },
    { id: "reco-peak", type: "promotion", severity: "info", title: "เตรียมกาแฟก่อนช่วงพีค", body: "อเมริกาโน่เย็นขายเฉลี่ย 42 แก้วใน 2 วันที่ผ่านมา ช่วง 16:00–18:00 ควรเตรียมเมล็ดเพิ่ม", action: "prepare_ingredient", createdAt: `${DEMO_TODAY}T18:30:00+07:00` },
    { id: "reco-recipe", type: "sales", severity: "warning", title: "ยังไม่มีสูตรชาไทยเย็น", body: "ยอดขายยังบันทึกได้ แต่ระบบยังคำนวณต้นทุนและการใช้วัตถุดิบให้ไม่ได้", action: "setup_recipe", createdAt: `${DEMO_TODAY}T18:30:00+07:00` },
  ],
};

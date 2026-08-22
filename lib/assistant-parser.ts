import type { AssistantTurn } from "./types";
import { calculatePurchaseUnitCost } from "./catalog";

const numberPattern = "(\\d+(?:[.,]\\d+)?)";

function numeric(value: string) {
  return Number(value.replace(",", "."));
}

function normalizeUnit(value: string) {
  const unit = value.trim().toLowerCase().replace(/[._-]/g, "");
  if (["ml", "มล", "มิลลิลิตร"].includes(unit)) return "ml";
  if (["l", "liter", "liters", "ลิตร"].includes(unit)) return "L";
  if (["g", "gram", "grams", "กรัม", "ก"].includes(unit)) return "g";
  if (["kg", "กก", "กิโลกรัม", "กิโล"].includes(unit)) return "kg";
  return value.trim();
}

/**
 * Deterministic parser for the small, unambiguous purchase command used in
 * the catalog flow. It deliberately returns null for anything less explicit
 * so the normal Gemini question/draft path can handle it safely.
 */
export function parseSimpleIngredientCommand(message: string): AssistantTurn | null {
  const text = message.trim().replace(/\s+/g, " ");
  if (!/^เพิ่ม\s*วัตถุดิบ(?:\s|$)/i.test(text)) return null;

  const body = text.replace(/^เพิ่ม\s*วัตถุดิบ\s*/i, "");
  const packageMatch = new RegExp(`${numberPattern}\\s*(ขวด|ถุง|แพ็ค|แพ็ก|กล่อง|ถัง|ลัง|ชิ้น|ชุด)`, "i").exec(body);
  if (!packageMatch || packageMatch.index === undefined) return null;

  const packageCount = numeric(packageMatch[1]);
  const packageUnit = packageMatch[2];
  const name = body.slice(0, packageMatch.index).trim();
  if (!name || packageCount <= 0) return null;

  const priceMatch = new RegExp(`${packageUnit}ละ\\s*${numberPattern}\\s*บาท`, "i").exec(body.slice(packageMatch.index));
  const contentMatch = new RegExp(`(?:และ|,)\\s*${numberPattern}\\s*(ml|มล|มิลลิลิตร|l|ลิตร|g|กรัม|kg|กก\\.?)`, "i").exec(body.slice(packageMatch.index));
  if (!priceMatch || !contentMatch) return null;

  const purchasePrice = packageCount * numeric(priceMatch[1]);
  const contentQuantity = numeric(contentMatch[1]);
  const contentUnit = normalizeUnit(contentMatch[2]);
  const unit = contentUnit;
  const purchase = { packageUnit, packageCount, contentQuantity, contentUnit, purchasePrice };
  const unitCost = calculatePurchaseUnitCost(purchase, unit);
  if (unitCost === null) return null;

  const totalQuantity = packageCount * contentQuantity;
  return {
    status: "draft",
    message: `เตรียมร่างวัตถุดิบ “${name}” จาก ${packageCount} ${packageUnit} × ${numeric(priceMatch[1]).toLocaleString("th-TH")} บาท พร้อมคำนวณต้นทุนให้ตรวจสอบแล้ว`,
    calculations: [
      { label: "ปริมาณรวมเข้าสต๊อก", value: totalQuantity, unit },
      { label: "แพ็กซื้อ", value: packageCount, unit: packageUnit },
      { label: "ราคาซื้อรวม", value: purchasePrice, unit: "บาท" },
      { label: "ต้นทุนต่อหน่วย", value: unitCost, unit: `บาท/${unit}` },
    ],
    drafts: [{
      kind: "ingredient",
      source: "gemini",
      rows: [{
        name,
        unit,
        supplier: "",
        unitCost,
        reorderPoint: 0,
        quantityOnHand: totalQuantity,
        packageUnit,
        packageCount,
        contentQuantity,
        contentUnit,
        purchasePrice,
      }],
      warnings: ["ระบบตีความราคาต่อแพ็กจากข้อความ ขอตรวจสอบสรุปก่อนยืนยัน"],
    }],
    warnings: ["ยังไม่บันทึกจนกดยืนยันชุดข้อมูล"],
  };
}

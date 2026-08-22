import type { AssistantTurn } from "./types";
import { calculatePurchaseUnitCost } from "./catalog";

const numberPattern = "(\\d+(?:[.,]\\d+)?)";
const packageUnitPattern = "(ขวด|ถุง|แพ็ก|แพ็ค|แพค|กล่อง|ถัง|ลัง|ชิ้น|ชุด)";
const contentUnitPattern = "(ml|มล|มิลลิลิตร|l|ลิตร|g|กรัม|kg|กก\\.?|กิโลกรัม)";

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
 * Deterministic parser for explicit ingredient purchase commands.
 * It accepts both "เพิ่มวัตถุดิบ นม ..." and the shorter "เพิ่ม นม ..."
 * form, then returns null when a number or unit is ambiguous.
 */
export function parseSimpleIngredientCommand(message: string): AssistantTurn | null {
  const text = message.trim().replace(/\s+/g, " ").replace(/[，]/g, ",");
  const commandMatch = /^เพิ่ม(?:\s*วัตถุดิบ)?\s+/i.exec(text);
  if (!commandMatch) return null;

  const body = text.slice(commandMatch[0].length).trim();
  const packageMatch = new RegExp(`${numberPattern}\\s*${packageUnitPattern}`, "i").exec(body);
  if (!packageMatch || packageMatch.index === undefined) return null;

  const packageCount = numeric(packageMatch[1]);
  const packageUnit = packageMatch[2];
  const name = body.slice(0, packageMatch.index).replace(/[,:-]\\s*$/, "").trim();
  if (!name || packageCount <= 0) return null;

  const tail = body.slice(packageMatch.index);
  const priceMatch = new RegExp(`${packageUnit}\\s*ละ\\s*${numberPattern}\\s*บาท`, "i").exec(tail);
  const contentMatch = new RegExp(`(?:และ|,|บรรจุ|มี)\\s*${numberPattern}\\s*${contentUnitPattern}`, "i").exec(tail);
  if (!priceMatch || !contentMatch) return null;

  const pricePerPackage = numeric(priceMatch[1]);
  const purchasePrice = packageCount * pricePerPackage;
  const contentQuantity = numeric(contentMatch[1]);
  const contentUnit = normalizeUnit(contentMatch[2]);
  const unitCost = calculatePurchaseUnitCost({ packageUnit, packageCount, contentQuantity, contentUnit, purchasePrice }, contentUnit);
  if (unitCost === null) return null;

  const totalQuantity = packageCount * contentQuantity;
  return {
    status: "draft",
    message: `เตรียมร่างวัตถุดิบ “${name}” ให้ตรวจสอบ: ${packageCount} ${packageUnit} × ${pricePerPackage.toLocaleString("th-TH")} บาท = ${purchasePrice.toLocaleString("th-TH")} บาท · เข้าสต๊อก ${totalQuantity.toLocaleString("th-TH")} ${contentUnit}`,
    calculations: [
      { label: "ปริมาณรวมเข้าสต๊อก", value: totalQuantity, unit: contentUnit },
      { label: "แพ็กซื้อ", value: packageCount, unit: packageUnit },
      { label: "ราคาซื้อรวม", value: purchasePrice, unit: "บาท" },
      { label: "ต้นทุนต่อหน่วย", value: unitCost, unit: `บาท/${contentUnit}` },
    ],
    drafts: [{
      kind: "ingredient",
      source: "gemini",
      rows: [{
        name,
        unit: contentUnit,
        unitCost,
        quantityOnHand: totalQuantity,
        packageUnit,
        packageCount,
        contentQuantity,
        contentUnit,
        purchasePrice,
      }],
      warnings: ["ระบบคำนวณราคาต่อหน่วยจากข้อมูลในคำสั่ง ตรวจสอบสรุปก่อนยืนยัน"],
    }],
    warnings: ["ยังไม่บันทึกจนกดตรวจแล้ว ยืนยันชุดข้อมูล"],
  };
}

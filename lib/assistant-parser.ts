import type { AssistantTurn } from "./types";
import { calculatePurchaseUnitCost } from "./catalog";

const numberPattern = "(\\d+(?:[.,]\\d+)?)";
const packageUnitPattern = "(ขวด|ถุง|แพ็ก|แพ็ค|แพค|กล่อง|ถัง|ลัง|ชิ้น|ชุด|กระป๋อง|ซอง|ห่อ|หลอด)";
const contentUnitPattern = "(ml|มล|มิลลิลิตร|l|ลิตร|g|กรัม|kg|กก\\.?|กิโลกรัม|กิโล)";

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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
}

function questionTurn(id: string, label: string, message = label, options?: string[]): AssistantTurn {
  return {
    status: "question",
    message,
    questions: [{ id, label, inputType: options ? "select" : "number", ...(options ? { options } : {}) }],
  };
}

/**
 * Deterministic parser for common ingredient inventory messages.
 * It accepts explicit commands and conversational Thai such as:
 * "ผมมี นม 10 ขวด ประมาณ 500 ml ต่อขวด ราคา 20 ไรงี้"
 * and returns null only when the message is not an ingredient inventory request.
 */
export function parseSimpleIngredientCommand(message: string): AssistantTurn | null {
  const text = message.trim().replace(/\s+/g, " ").replace(/[，]/g, ",");
  const commandMatch = /^(?:(?:ตอนนี้\s*)?(?:ผม|ฉัน|เรา)\s*)?(?:มี|ซื้อมา|ซื้อ|เพิ่ม(?:\s*วัตถุดิบ)?)(?:\s*)/i.exec(text);
  if (!commandMatch) return null;

  const body = text.slice(commandMatch[0].length).trim();
  if (!body) return null;

  const packageMatch = new RegExp(`${numberPattern}\\s*${packageUnitPattern}`, "i").exec(body);
  const packageCount = packageMatch ? numeric(packageMatch[1]) : 1;
  const packageUnit = packageMatch?.[2] ?? "หน่วย";
  if (packageCount <= 0) return null;

  const tail = packageMatch?.index !== undefined ? body.slice(packageMatch.index) : body;
  const name = packageMatch?.index !== undefined
    ? body.slice(0, packageMatch.index).replace(/^(?:ของ|คือ)\s*/i, "").replace(/[,:-]\s*$/, "").trim()
    : (() => {
      const marker = /(?:^|\s)(?:หน่วย|ราคาซื้อ|ราคา|ราคารวม|ปริมาณ|ขนาด|บรรจุ|มี)\s|(?:^|\s)\d/i.exec(body);
      return marker ? body.slice(0, marker.index).trim() : "";
    })();
  if (!name) return null;

  const contentMatch = new RegExp(`(?:ประมาณ|ราว(?:ๆ)?|คร่าวๆ|โดยประมาณ|ขนาด|ปริมาณ|บรรจุ|มี|และ)?\\s*${numberPattern}\\s*${contentUnitPattern}`, "i").exec(tail);
  if (!contentMatch) {
    return questionTurn("content-quantity", `ปริมาณต่อ${packageUnit}เท่าไร?`, `ระบุปริมาณวัตถุดิบต่อ${packageUnit} เช่น 500 ml`);
  }

  const contentQuantity = numeric(contentMatch[1]);
  const contentUnit = normalizeUnit(contentMatch[2]);
  if (contentQuantity <= 0) return null;

  const packageUnitRegex = escapeRegExp(packageUnit);
  const explicitPerPackageMatch = new RegExp(`${packageUnitRegex}\\s*ละ\\s*${numberPattern}\\s*(?:บาท|บ\\.?|฿)?`, "i").exec(tail);
  const totalPriceMatch = new RegExp(`(?:ราคารวม|รวม(?:ทั้งหมด|เป็น)?|ทั้งหมด|ราคาซื้อ)\\s*[:=]?\\s*${numberPattern}\\s*(?:บาท|บ\\.?|฿)?`, "i").exec(tail);
  const genericPriceMatch = new RegExp(`(?:ราคา|ต้นทุน|ซื้อมา(?:ในราคา)?)\\s*[:=]?\\s*${numberPattern}\\s*(?:บาท|บ\\.?|฿)?`, "i").exec(tail);
  const perPackageSignal = new RegExp(`(?:${packageUnitRegex}\\s*(?:ละ|ต่อ)|(?:ต่อ|/)\\s*${packageUnitRegex}|แต่ละ\\s*${packageUnitRegex})`, "i").test(tail);

  let purchasePrice: number;
  let priceMode: "per-package" | "total";
  if (explicitPerPackageMatch) {
    const pricePerPackage = numeric(explicitPerPackageMatch[1]);
    purchasePrice = packageCount * pricePerPackage;
    priceMode = "per-package";
  } else if (genericPriceMatch && perPackageSignal) {
    const pricePerPackage = numeric(genericPriceMatch[1]);
    purchasePrice = packageCount * pricePerPackage;
    priceMode = "per-package";
  } else if (totalPriceMatch) {
    purchasePrice = numeric(totalPriceMatch[1]);
    priceMode = "total";
  } else if (genericPriceMatch && packageCount === 1) {
    purchasePrice = numeric(genericPriceMatch[1]);
    priceMode = "total";
  } else if (genericPriceMatch) {
    return questionTurn("purchase-price-scope", `ราคา ${genericPriceMatch[1]} บาทเป็นราคาต่อ${packageUnit}หรือราคารวมทั้งหมด?`, `ราคา ${genericPriceMatch[1]} บาทเป็นราคาต่อ${packageUnit}หรือราคารวมทั้งหมด?`, [`ต่อ${packageUnit}`, "รวมทั้งหมด"]);
  } else {
    return questionTurn("purchase-price", `ราคาซื้อเท่าไรต่อ${packageUnit}?`, `ระบุราคาซื้อ เช่น 20 บาทต่อ${packageUnit}`);
  }

  if (purchasePrice < 0) return null;
  const totalQuantity = packageCount * contentQuantity;
  const unitCost = calculatePurchaseUnitCost({ packageUnit, packageCount, contentQuantity, contentUnit, purchasePrice }, contentUnit);
  if (unitCost === null) return null;

  const approximate = /ประมาณ|ราว(?:ๆ)?|คร่าวๆ|โดยประมาณ/i.test(tail);
  const warnings = [
    "ระบบคำนวณราคาต่อหน่วยจากข้อมูลในคำสั่ง ตรวจสอบสรุปก่อนยืนยัน",
    ...(approximate ? ["ปริมาณที่ระบุเป็นค่าประมาณ ตรวจสอบก่อนยืนยัน"] : []),
    ...(!packageMatch ? ["ไม่พบจำนวนแพ็ก จึงตีความเป็น 1 หน่วย"] : []),
  ];
  const priceSummary = priceMode === "per-package"
    ? `ราคา ${((purchasePrice / packageCount) || 0).toLocaleString("th-TH")} บาท/${packageUnit} = ${purchasePrice.toLocaleString("th-TH")} บาท`
    : `ราคารวม ${purchasePrice.toLocaleString("th-TH")} บาท`;

  return {
    status: "draft",
    message: `เตรียมร่างวัตถุดิบ “${name}” ให้ตรวจสอบ: ${packageCount.toLocaleString("th-TH")} ${packageUnit} × ${contentQuantity.toLocaleString("th-TH")} ${contentUnit} · ${priceSummary} · เข้าสต๊อก ${totalQuantity.toLocaleString("th-TH")} ${contentUnit}`,
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
      warnings,
    }],
    warnings: ["ยังไม่บันทึกจนกดตรวจแล้ว ยืนยันชุดข้อมูล", ...warnings],
  };
}

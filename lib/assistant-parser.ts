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
  const looksLikeInventoryMessage = new RegExp(`${numberPattern}\\s*${packageUnitPattern}|${numberPattern}\\s*${contentUnitPattern}|(?:ราคาซื้อ|ราคา|ปริมาณ|ขนาด)`, "i").test(text);
  if (!commandMatch && !looksLikeInventoryMessage) return null;

  const body = commandMatch ? text.slice(commandMatch[0].length).trim() : text;
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
  const afterContent = tail.slice((contentMatch.index ?? 0) + contentMatch[0].length);
  const barePriceMatch = new RegExp(`^\\s*${numberPattern}\\s*(?:บาท|บ\\.?|฿)`, "i").exec(afterContent);
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
  } else if (barePriceMatch && perPackageSignal) {
    const pricePerPackage = numeric(barePriceMatch[1]);
    purchasePrice = packageCount * pricePerPackage;
    priceMode = "per-package";
  } else if (barePriceMatch && packageCount === 1) {
    purchasePrice = numeric(barePriceMatch[1]);
    priceMode = "total";
  } else if (barePriceMatch) {
    return questionTurn("purchase-price-scope", `ราคา ${barePriceMatch[1]} บาทเป็นราคาต่อ${packageUnit}หรือราคารวมทั้งหมด?`, `ราคา ${barePriceMatch[1]} บาทเป็นราคาต่อ${packageUnit}หรือราคารวมทั้งหมด?`, [`ต่อ${packageUnit}`, "รวมทั้งหมด"]);
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

type AssistantConversationMessage = { role: "user" | "assistant"; text: string };

/**
 * Resolves a short answer such as "70" against the immediately preceding
 * assistant question, so a follow-up does not need another Gemini request.
 */
export function parseIngredientFollowUp(message: string, conversation: AssistantConversationMessage[]): AssistantTurn | null {
  const answer = message.trim();
  if (!answer || conversation.at(-1)?.role !== "user") return null;

  const previous = conversation.slice(0, -1);
  const previousUser = [...previous].reverse().find((item) => item.role === "user");
  const previousAssistant = [...previous].reverse().find((item) => item.role === "assistant");
  if (!previousUser || !previousAssistant) return null;

  const packageUnitMatch = /(?:ต่อ|\/)\s*(ขวด|ถุง|แพ็ก|แพ็ค|แพค|กล่อง|ถัง|ลัง|ชิ้น|ชุด|กระป๋อง|ซอง|ห่อ|หลอด)/i.exec(previousAssistant.text);
  const priceQuestion = /(?:ราคา|ต้นทุน|ราคาซื้อ|จ่าย|ซื้อ)/i.test(previousAssistant.text);
  const quantityQuestion = /(?:ปริมาณ|ขนาด|บรรจุ|มีอยู่)/i.test(previousAssistant.text);
  const scopeQuestion = /(?:ต่อ.*(?:หรือ|กับ).*รวม|รวม.*(?:หรือ|กับ).*ต่อ)/i.test(previousAssistant.text);
  const totalPriceRequested = /(?:ราคารวม|รวมทั้งหมด|รวมทั้งสิ้น)/i.test(previousAssistant.text);
  const numericAnswer = /^(\d+(?:[.,]\d+)?)\s*(?:บาท|บ\.?|฿)?$/i.exec(answer);

  if (numericAnswer) {
    if (scopeQuestion) return null;
    if (priceQuestion) {
      const scope = packageUnitMatch ? ` ต่อ${packageUnitMatch[1]}` : "";
      const priceLabel = totalPriceRequested && !packageUnitMatch ? "ราคารวม" : "ราคา";
      return parseSimpleIngredientCommand(`${previousUser.text} ${priceLabel} ${numericAnswer[1]} บาท${scope}`);
    }
    if (quantityQuestion) {
      const unitMatch = /(ml|มล|มิลลิลิตร|l|ลิตร|g|กรัม|kg|กก\.?|กิโลกรัม|กิโล)/i.exec(previousAssistant.text) ?? /(ml|มล|มิลลิลิตร|l|ลิตร|g|กรัม|kg|กก\.?|กิโลกรัม|กิโล)/i.exec(previousUser.text);
      if (!unitMatch) return null;
      return parseSimpleIngredientCommand(`${previousUser.text} ปริมาณ ${numericAnswer[1]} ${normalizeUnit(unitMatch[1])}`);
    }
    return null;
  }

  const previousPrices = [...previousUser.text.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:บาท|บ\.?|฿)/gi)];
  const previousPrice = previousPrices.length ? previousPrices[previousPrices.length - 1][1] : null;
  if (!previousPrice) return null;

  if (/รวมทั้งหมด|ราคารวม|รวมทั้งสิ้น/i.test(answer)) {
    return parseSimpleIngredientCommand(`${previousUser.text} ราคารวม ${previousPrice} บาท`);
  }
  if (packageUnitMatch && /^(?:ต่อ|\/)?\s*(?:ขวด|ถุง|แพ็ก|แพ็ค|แพค|กล่อง|ถัง|ลัง|ชิ้น|ชุด|กระป๋อง|ซอง|ห่อ|หลอด)$/i.test(answer)) {
    return parseSimpleIngredientCommand(`${previousUser.text} ราคา ${previousPrice} บาท${answer.replace(/^ต่อ\s*/i, " ต่อ")}`);
  }
  return null;
}

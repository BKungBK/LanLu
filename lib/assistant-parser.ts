import type { AssistantTurn } from "./types";
import { calculatePurchaseUnitCost, getUnitConversionFactor } from "./catalog";

const numberPattern = "(\\d+(?:[.,]\\d+)?)";
const packageUnitPattern = "(ขวด|ถุง|แพ็ก|แพ็ค|แพค|กล่อง|ถัง|ลัง|ชิ้น|ชุด|กระป๋อง|ซอง|ห่อ|หลอด)";
const contentUnitPattern = "(ml|มล|มิลลิลิตร|l|ลิตร|g|กรัม|kg|กก\\.?|กิโลกรัม|กิโล)";

function numeric(value: string) {
  const thaiDigits = value.replace(/[๐-๙]/g, (digit) => String("๐๑๒๓๔๕๖๗๘๙".indexOf(digit)));
  if (thaiDigits.includes(".") && thaiDigits.includes(",")) return Number(thaiDigits.replace(/,/g, ""));
  if (/,\d{3}(?:,|$)/.test(thaiDigits)) return Number(thaiDigits.replace(/,/g, ""));
  return Number(thaiDigits.replace(",", "."));
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

function textQuestionTurn(id: string, label: string, message = label): AssistantTurn {
  return {
    status: "question",
    message,
    questions: [{ id, label, inputType: "text" }],
  };
}

export type MenuSetupContext = {
  ingredients: Array<{ name: string; unit: string }>;
  menus?: string[];
};

export type AssistantConversationMessage = { role: "user" | "assistant"; text: string };

const menuCommandPattern = /^(?:(?:ตอนนี้|ขอ|ช่วย|อยาก)\s*)*(?:(?:ผม|ฉัน|เรา)\s*)?(?:เพิ่ม|สร้าง|ทำ|ตั้ง(?:ค่า)?)\s*เมนู\s*(?:[:：-]\s*)?/i;
const recipeUnitPattern = "(ml|มล|มิลลิลิตร|l|ลิตร|g|กรัม|kg|กก\\.?|กิโลกรัม|กิโล|ชิ้น|หน่วย|ขวด|แก้ว|ช้อนโต๊ะ|ช้อนชา)";

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ").replace(/[，]/g, ",");
}

function normalizeName(value: string) {
  return value.trim().replace(/^(?:และ|กับ|ใช้|วัตถุดิบ|ส่วนผสม)\s+/i, "").replace(/\s+(?:และ|กับ)\s*$/i, "").trim();
}

function findMenuCommand(text: string) {
  const normalized = normalizeText(text);
  const command = menuCommandPattern.exec(normalized);
  if (!command) return null;
  const body = normalized.slice(command[0].length).trim();
  if (!body) return null;
  const marker = /(?:พร้อม|ราคา|ขาย|หมวด|ประเภท|ใช้|สูตร|วัตถุดิบ|ส่วนผสม|ให้ครบ|[,;:])/i.exec(body);
  const name = normalizeName(marker ? body.slice(0, marker.index) : body);
  if (!name || /^(?:พร้อม|วัตถุดิบ|ส่วนผสม|สูตร|ให้ครบ)$/i.test(name)) return null;
  return { text: normalized, name, details: marker ? body.slice(marker.index) : "" };
}

export function isMenuSetupMessage(message: string) {
  return findMenuCommand(message) !== null;
}

export function hasMenuSetupConversation(conversation: AssistantConversationMessage[]) {
  return conversation.at(-1)?.role === "user" && conversation.some((item) => isMenuSetupMessage(item.text));
}

function parseMenuPrice(text: string) {
  const number = "(\\d+(?:[.,]\\d+)?)";
  const match = new RegExp(`(?:ราคาขาย|ขาย|ราคา)\\s*(?:คือ|เป็น|อยู่ที่|[:=])?\\s*${number}\\s*(?:บาท|บ\\.?|฿)?`, "i").exec(text);
  if (match) return numeric(match[1]);
  const barePrices = Array.from(text.matchAll(new RegExp(`${number}\\s*(?:บาท|บ\\.?|฿)`, "gi")));
  return barePrices.length ? numeric(barePrices.at(-1)![1]) : null;
}

function parseMenuCategory(text: string) {
  const match = /(?:หมวด|ประเภท)\s*(?:คือ|เป็น|[:=])?\s*([^,;\s]+)/i.exec(text);
  return match?.[1]?.trim() || "อื่น ๆ";
}

function parseRecipeRows(details: string) {
  const number = "\\d+(?:[.,]\\d+)?";
  const withoutPrice = details.replace(new RegExp(`(?:ราคาขาย|ขาย|ราคา)\\s*(?:คือ|เป็น|อยู่ที่|[:=])?\\s*${number}\\s*(?:บาท|บ\\.?|฿)?|${number}\\s*(?:บาท|บ\\.?|฿)`, "gi"), " ");
  const recipeText = withoutPrice.replace(/(?:พร้อม\s*)?(?:วัตถุดิบ|ส่วนผสม|สูตร)(?:\s*ให้ครบ)?/gi, " ").replace(/(?:ใช้|ประกอบด้วย)\s*/gi, " ");
  const matches = recipeText.matchAll(new RegExp(`([^,;|]+?)\\s*(${number})\\s*${recipeUnitPattern}`, "gi"));
  const rows: Array<{ name: string; quantity: number; unit: string }> = [];
  for (const match of matches) {
    const name = normalizeName(match[1]);
    const quantity = numeric(match[2]);
    const unit = normalizeUnit(match[3]);
    if (name && quantity > 0) rows.push({ name, quantity, unit });
  }
  return rows;
}

function matchKnownIngredient(name: string, context: MenuSetupContext) {
  const normalized = name.toLocaleLowerCase("th-TH");
  const exact = context.ingredients.filter((ingredient) => ingredient.name.trim().toLocaleLowerCase("th-TH") === normalized);
  if (exact.length === 1) return exact[0];
  const close = context.ingredients.filter((ingredient) => {
    const candidate = ingredient.name.trim().toLocaleLowerCase("th-TH");
    return candidate.includes(normalized) || normalized.includes(candidate);
  });
  return close.length === 1 ? close[0] : undefined;
}

function buildMenuDraft(menu: { name: string; price: number; category: string }, recipeRows: Array<{ name: string; quantity: number; unit: string }>, context: MenuSetupContext): AssistantTurn {
  const unknown = recipeRows.filter((row) => !matchKnownIngredient(row.name, context));
  if (unknown.length > 0) {
    const names = unknown.map((row) => `“${row.name}”`).join(", ");
    return textQuestionTurn(
      "menu-unknown-ingredients",
      `ยังไม่พบ ${names} ในรายการวัตถุดิบ ให้เพิ่มวัตถุดิบก่อน หรือพิมพ์ชื่อวัตถุดิบที่มีอยู่`,
      `ยังไม่พบ ${names} ในรายการวัตถุดิบ จึงยังไม่สร้างสูตรให้ยืนยัน เพื่อไม่ให้สูตรผูกกับรายการผิดตัว`,
    );
  }

  const incompatible = recipeRows.find((row) => {
    const ingredient = matchKnownIngredient(row.name, context)!;
    return getUnitConversionFactor(row.unit, ingredient.unit) === null;
  });
  if (incompatible) {
    const ingredient = matchKnownIngredient(incompatible.name, context)!;
    return textQuestionTurn(
      "menu-unit-mismatch",
      `หน่วยของ ${ingredient.name} ต้องเป็น ${ingredient.unit} หรือหน่วยที่แปลงเป็น ${ingredient.unit} ได้`,
      `หน่วย ${incompatible.unit} ของ ${ingredient.name} แปลงเป็น ${ingredient.unit} ไม่ได้ จึงยังไม่สร้างสูตรเพื่อป้องกันตัวเลขผิด`,
    );
  }

  const resolvedRecipeRows = recipeRows.map((row) => {
    const ingredient = matchKnownIngredient(row.name, context)!;
    const factor = getUnitConversionFactor(row.unit, ingredient.unit) ?? 1;
    return { menuName: menu.name, ingredientName: ingredient.name, quantity: Number((row.quantity * factor).toFixed(6)), unit: ingredient.unit || row.unit };
  });
  const warnings = [
    "เมนูและสูตรจะบันทึกพร้อมกันแบบ transaction เดียว ตรวจชื่อวัตถุดิบ ปริมาณ และราคาก่อนยืนยัน",
    ...(menu.category === "อื่น ๆ" ? ["ยังไม่ได้ระบุหมวด ระบบจึงจัดไว้ที่ “อื่น ๆ”"] : []),
    ...(context.menus?.some((name) => name.trim().toLocaleLowerCase("th-TH") === menu.name.trim().toLocaleLowerCase("th-TH")) ? ["พบชื่อเมนูนี้อยู่แล้ว ระบบจะไม่สร้างชื่อซ้ำ"] : []),
  ];
  return {
    status: "draft",
    message: `เตรียมร่างเมนู “${menu.name}” พร้อมสูตร ${resolvedRecipeRows.length} รายการ ให้ตรวจสอบก่อนบันทึก`,
    drafts: [
      { kind: "menu", source: "gemini", rows: [{ name: menu.name, category: menu.category, price: menu.price, active: true }], warnings: [] },
      { kind: "recipe", source: "gemini", rows: resolvedRecipeRows, warnings: [] },
    ],
    warnings,
  };
}

function buildMenuQuestion(menu: { name: string; price: number | null }, recipeRows: Array<{ name: string; quantity: number; unit: string }>, context: MenuSetupContext, details: string): AssistantTurn {
  if (menu.price === null || menu.price <= 0) {
    return questionTurn("menu-price", `เมนู “${menu.name}” ราคาขายเท่าไร?`, `เมนู “${menu.name}” ราคาขายเท่าไร? ระบุเป็นบาท เช่น 75`, undefined);
  }
  if (recipeRows.length === 0) {
    return textQuestionTurn("menu-ingredients", `เมนู “${menu.name}” ใช้วัตถุดิบอะไรและปริมาณเท่าไร?`, `เมนู “${menu.name}” ใช้วัตถุดิบอะไรและปริมาณเท่าไร? เช่น นมสด 150 ml และผงกาแฟ 18 g`);
  }
  return buildMenuDraft({ name: menu.name, price: menu.price, category: parseMenuCategory(details) }, recipeRows, context);
}

export function parseMenuSetupCommand(message: string, context: MenuSetupContext): AssistantTurn | null {
  const command = findMenuCommand(message);
  if (!command) return null;
  const price = parseMenuPrice(command.text);
  const recipeRows = parseRecipeRows(command.details);
  return buildMenuQuestion({ name: command.name, price }, recipeRows, context, command.details);
}

export function parseMenuSetupFollowUp(message: string, conversation: AssistantConversationMessage[], context: MenuSetupContext): AssistantTurn | null {
  const answer = normalizeText(message);
  if (!answer || conversation.at(-1)?.role !== "user") return null;
  const previous = conversation.slice(0, -1);
  const menuRequest = [...previous].reverse().find((item) => item.role === "user" && isMenuSetupMessage(item.text));
  const previousAssistant = [...previous].reverse().find((item) => item.role === "assistant");
  if (!menuRequest || !previousAssistant) return null;
  const command = findMenuCommand(menuRequest.text);
  if (!command) return null;
  const menuRequestIndex = previous.lastIndexOf(menuRequest);
  const priorAnswers = menuRequestIndex >= 0 ? previous.slice(menuRequestIndex + 1).filter((item) => item.role === "user").map((item) => item.text) : [];
  const priorDetails = priorAnswers.map((item) => /^(?:ราคา\s*)?\d+(?:[.,]\d+)?\s*(?:บาท|บ\.?|฿)?$/i.test(item.trim()) ? `ราคา ${item}` : item).join(" ");

  if (/ราคาขาย|ราคาขายเท่าไร|ราคาขายเท่าไหร่/i.test(previousAssistant.text)) {
    const priceMatch = /^(?:ราคา\s*)?(\d+(?:[.,]\d+)?)\s*(?:บาท|บ\.?|฿)?$/i.exec(answer);
    if (!priceMatch) return null;
    return parseMenuSetupCommand(`${menuRequest.text} ${priorDetails} ราคา ${priceMatch[1]} บาท`, context);
  }
  if (/ใช้วัตถุดิบ|วัตถุดิบอะไร|ปริมาณเท่าไร|ปริมาณเท่าไหร่/i.test(previousAssistant.text)) {
    return parseMenuSetupCommand(`${menuRequest.text} ${priorDetails} ใช้ ${answer}`, context);
  }
  return null;
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

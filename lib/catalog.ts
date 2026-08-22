import type { CatalogDraftKind, IngredientPurchaseInfo, IngredientUnit, MenuCategory, CsvMappingSuggestion } from "./types";

export const DEFAULT_MENU_CATEGORIES: MenuCategory[] = ["กาแฟ", "ชา", "อื่น ๆ"];
export const DEFAULT_INGREDIENT_UNITS: IngredientUnit[] = ["กก.", "ลิตร", "ชิ้น", "ถุง", "ขวด"];

const normalizeMeasureUnit = (value: string) => value.trim().toLowerCase().replace(/[._-]/g, "").replace(/\s+/g, "");

const standardUnit = (value: string) => {
  const unit = normalizeMeasureUnit(value);
  if (["g", "gram", "grams", "กรัม", "ก"].includes(unit)) return { family: "mass", factor: 1 };
  if (["kg", "กก", "กิโลกรัม", "กิโล"].includes(unit)) return { family: "mass", factor: 1000 };
  if (["ml", "milliliter", "milliliters", "มล", "มิลลิลิตร"].includes(unit)) return { family: "volume", factor: 1 };
  if (["l", "liter", "liters", "ลิตร"].includes(unit)) return { family: "volume", factor: 1000 };
  if (["piece", "pieces", "ชิ้น", "หน่วย"].includes(unit)) return { family: "count", factor: 1 };
  return null;
};

export function getUnitConversionFactor(fromUnit: string, toUnit: string, explicitFactor?: number) {
  if (explicitFactor !== undefined && Number.isFinite(explicitFactor) && explicitFactor > 0) return explicitFactor;
  const from = standardUnit(fromUnit);
  const to = standardUnit(toUnit);
  if (!from || !to || from.family !== to.family) return normalizeMeasureUnit(fromUnit) === normalizeMeasureUnit(toUnit) ? 1 : null;
  return from.factor / to.factor;
}

type PurchaseCostInput = Omit<IngredientPurchaseInfo, "unitCost"> & { unitCost?: number };

export function calculatePurchaseUnitCost(purchase: PurchaseCostInput, baseUnit: string) {
  if (purchase.packageCount <= 0 || purchase.contentQuantity <= 0 || purchase.purchasePrice < 0) return null;
  const factor = getUnitConversionFactor(purchase.contentUnit, baseUnit, purchase.conversionFactor);
  if (factor === null) return null;
  const totalBaseQuantity = purchase.packageCount * purchase.contentQuantity * factor;
  if (totalBaseQuantity <= 0) return null;
  return Number((purchase.purchasePrice / totalBaseQuantity).toFixed(6));
}

export function formatPurchaseCostPreview(purchase: PurchaseCostInput, baseUnit: string) {
  const factor = getUnitConversionFactor(purchase.contentUnit, baseUnit, purchase.conversionFactor);
  const unitCost = calculatePurchaseUnitCost(purchase, baseUnit);
  if (factor === null || unitCost === null) return "ระบุหน่วยหรืออัตราแปลงให้ชัดเจนก่อน";
  const total = purchase.packageCount * purchase.contentQuantity * factor;
  return `${purchase.purchasePrice.toLocaleString("th-TH")} บาท ÷ ${total.toLocaleString("th-TH")} ${baseUnit} = ${unitCost.toLocaleString("th-TH", { maximumFractionDigits: 6 })} บาท/${baseUnit}`;
}

export function suggestMarginPrices(cost: number, margins = [0.5, 0.6, 0.7]) {
  return margins.map((margin) => ({ margin, price: Number((cost / (1 - margin)).toFixed(2)) }));
}

const fieldAliases: Record<string, string[]> = {
  name: ["name", "ชื่อ", "ชื่อวัตถุดิบ", "ชื่อเมนู", "ingredient_name", "menu_name"],
  unit: ["unit", "หน่วย", "หน่วยพื้นฐาน"],
  supplier: ["supplier", "ผู้ขาย", "ซัพพลายเออร์"],
  unitCost: ["unitcost", "unit_cost", "cost", "ต้นทุน", "ต้นทุนต่อหน่วย"],
  menuName: ["menuname", "menu_name", "menu", "ชื่อเมนู"],
  ingredientName: ["ingredientname", "ingredient_name", "ingredient", "ชื่อวัตถุดิบ"],
  quantity: ["quantity", "amount", "จำนวน", "ปริมาณ"],
  category: ["category", "หมวด", "ประเภท"],
  price: ["price", "selling_price", "ราคาขาย"],
  packageUnit: ["package_unit", "packageunit", "หน่วยแพ็ก"],
  packageCount: ["package_count", "packagecount", "จำนวนแพ็ก"],
  contentQuantity: ["content_quantity", "contentquantity", "ปริมาณต่อแพ็ก"],
  contentUnit: ["content_unit", "contentunit", "หน่วยในแพ็ก"],
  purchasePrice: ["purchase_price", "purchaseprice", "ราคาแพ็ก"],
  conversionFactor: ["conversion_factor", "conversionfactor", "อัตราแปลง"],
};

export function detectCatalogCsvMapping(headers: string[], samples: Array<Record<string, unknown>> = []): CsvMappingSuggestion {
  const normalized = headers.map((header) => ({ raw: header, value: normalizeMeasureUnit(header) }));
  const has = (fields: string[]) => normalized.some(({ value }) => fields.some((field) => normalizeMeasureUnit(field) === value || value.includes(normalizeMeasureUnit(field))));
  const detectedKind: CatalogDraftKind = has(fieldAliases.menuName) && has(fieldAliases.ingredientName) && has(fieldAliases.quantity) ? "recipe" : has(fieldAliases.price) || has(fieldAliases.category) ? "menu" : "ingredient";
  const fields = detectedKind === "recipe" ? ["menuName", "ingredientName", "quantity", "unit"] : detectedKind === "menu" ? ["name", "category", "price", "active"] : ["name", "unit", "supplier", "unitCost", "quantityOnHand", "reorderPoint", "packageUnit", "packageCount", "contentQuantity", "contentUnit", "purchasePrice", "conversionFactor"];
  const mapping: Record<string, string> = {};
  for (const header of headers) {
    const headerValue = normalizeMeasureUnit(header);
    const match = fields.find((field) => fieldAliases[field]?.some((alias) => normalizeMeasureUnit(alias) === headerValue || headerValue.includes(normalizeMeasureUnit(alias))));
    if (match) mapping[header] = match;
  }
  const matched = Object.keys(mapping).length;
  const confidence = Math.min(0.99, Number((0.45 + matched / Math.max(fields.length, 1) * 0.5 + (samples.length ? 0.04 : 0)).toFixed(2)));
  return { detectedKind, confidence, mapping };
}

export function applyCsvMapping(rows: Array<Record<string, unknown>>, mapping: Record<string, string>) {
  return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [mapping[key] ?? key, value])));
}

export function parseIsoDateInput(value: string): string {
  const normalized = value.trim().replace(/[./-]/g, "/");
  if (!normalized) return "";
  const parts = normalized.split("/").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) return "";
  const [day, month, rawYear] = parts;
  const year = rawYear >= 2400 ? rawYear - 543 : rawYear < 100 ? rawYear + 2000 : rawYear;
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2200) return "";
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return "";
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

export function formatThaiDateInput(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return "";
  return `${match[3]}/${match[2]}/${(Number(match[1]) + 543).toString()}`;
}

export function normalizeCatalogRows(kind: CatalogDraftKind, rows: Array<Record<string, unknown>>) {
  return rows.map((row) => {
    const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim().toLowerCase().replace(/[\s-]+/g, "_"), typeof value === "string" ? value.trim() : value]));
    if (kind === "ingredient") {
      return { name: normalized.name ?? normalized.ingredient_name ?? "", unit: normalized.unit ?? "", supplier: normalized.supplier ?? "", unitCost: normalized.unitcost ?? normalized.unit_cost ?? normalized.cost ?? 0, reorderPoint: normalized.reorderpoint ?? normalized.reorder_point ?? 0, quantityOnHand: normalized.quantityonhand ?? normalized.quantity ?? normalized.opening_stock ?? 0, expiresOn: normalized.expireson ?? normalized.expires_on ?? normalized.expiry ?? "", packageUnit: normalized.packageunit ?? normalized.package_unit ?? "", packageCount: normalized.packagecount ?? normalized.package_count ?? 0, contentQuantity: normalized.contentquantity ?? normalized.content_quantity ?? 0, contentUnit: normalized.contentunit ?? normalized.content_unit ?? "", purchasePrice: normalized.purchaseprice ?? normalized.purchase_price ?? 0, conversionFactor: normalized.conversionfactor ?? normalized.conversion_factor ?? 0 };
    }
    if (kind === "menu") {
      return { name: normalized.name ?? normalized.menu_name ?? "", category: normalized.category ?? "อื่น ๆ", price: normalized.price ?? normalized.selling_price ?? 0, active: normalized.active !== false && normalized.active !== "false" };
    }
    return { menuName: normalized.menuname ?? normalized.menu_name ?? normalized.menu ?? "", ingredientName: normalized.ingredientname ?? normalized.ingredient_name ?? normalized.ingredient ?? "", quantity: normalized.quantity ?? normalized.amount ?? 0, unit: normalized.unit ?? "" };
  });
}

export function validateCatalogRows(kind: CatalogDraftKind, rows: Array<Record<string, unknown>>, knownNames: { ingredients: string[]; menus: string[]; units: string[]; categories: string[] }, conflictMode: "create" | "update" | "skip" = "create") {
  const seen = new Set<string>();
  return rows.map((row, index) => {
    const errors: string[] = [];
    const name = String(kind === "recipe" ? row.ingredientName : row.name ?? "").trim();
    if (!name) errors.push(kind === "recipe" ? "ขาดชื่อวัตถุดิบ" : "ขาดชื่อ");
    if (kind === "ingredient" && !knownNames.units.includes(String(row.unit).trim())) errors.push("หน่วยไม่รู้จัก");
    if (kind === "menu" && !knownNames.categories.includes(String(row.category).trim())) errors.push("หมวดไม่รู้จัก");
    if (kind === "ingredient" && knownNames.ingredients.some((item) => item.toLocaleLowerCase() === name.toLocaleLowerCase()) && conflictMode === "create") errors.push("ชื่อวัตถุดิบซ้ำในร้าน");
    if (kind === "menu" && knownNames.menus.some((item) => item.toLocaleLowerCase() === name.toLocaleLowerCase()) && conflictMode === "create") errors.push("ชื่อเมนูซ้ำในร้าน");
    if (kind === "recipe") {
      if (!knownNames.menus.includes(String(row.menuName).trim())) errors.push("ไม่พบชื่อเมนู");
      if (!knownNames.ingredients.includes(name)) errors.push("ไม่พบชื่อวัตถุดิบ");
    }
    const key = kind === "recipe" ? `${row.menuName}:${row.ingredientName}` : name;
    if (key && seen.has(key)) errors.push("รายการซ้ำในไฟล์");
    if (key) seen.add(key);
    const numeric = Number(kind === "recipe" ? row.quantity : kind === "menu" ? row.price : row.unitCost);
    if (!Number.isFinite(numeric) || numeric < 0) errors.push("ตัวเลขไม่ถูกต้อง");
    return { ...row, _row: index + 1, _errors: errors };
  });
}

export function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function rowsToCsv(rows: Array<Record<string, unknown>>) {
  const headers = Object.keys(rows[0] ?? {});
  return [headers.join(","), ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))].join("\n");
}

import type { CatalogDraftKind, IngredientUnit, MenuCategory } from "./types";

export const DEFAULT_MENU_CATEGORIES: MenuCategory[] = ["กาแฟ", "ชา", "อื่น ๆ"];
export const DEFAULT_INGREDIENT_UNITS: IngredientUnit[] = ["กก.", "ลิตร", "ชิ้น", "ถุง", "ขวด"];

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
      return { name: normalized.name ?? normalized.ingredient_name ?? "", unit: normalized.unit ?? "", supplier: normalized.supplier ?? "", unitCost: normalized.unitcost ?? normalized.unit_cost ?? normalized.cost ?? 0, reorderPoint: normalized.reorderpoint ?? normalized.reorder_point ?? 0, quantityOnHand: normalized.quantityonhand ?? normalized.quantity ?? normalized.opening_stock ?? 0, expiresOn: normalized.expireson ?? normalized.expires_on ?? normalized.expiry ?? "" };
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

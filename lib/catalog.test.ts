import { describe, expect, it } from "vitest";
import { applyCsvMapping, calculatePurchaseUnitCost, detectCatalogCsvMapping, formatThaiDateInput, normalizeCatalogRows, parseIsoDateInput, suggestMarginPrices, validateCatalogRows } from "./catalog";

describe("catalog helpers", () => {
  it("parses Thai Buddhist and Gregorian dates into ISO", () => {
    expect(parseIsoDateInput("22/08/2569")).toBe("2026-08-22");
    expect(parseIsoDateInput("22/08/2026")).toBe("2026-08-22");
    expect(formatThaiDateInput("2026-08-22")).toBe("22/08/2569");
  });

  it("rejects impossible dates", () => {
    expect(parseIsoDateInput("31/02/2569")).toBe("");
    expect(parseIsoDateInput("hello")).toBe("");
  });

  it("normalizes headers and reports duplicate or unknown references", () => {
    const rows = normalizeCatalogRows("recipe", [
      { "menu name": "ลาเต้", "ingredient name": "นม", quantity: "0.18" },
      { "menu name": "ลาเต้", "ingredient name": "นม", quantity: "0.2" },
    ]);
    const validated = validateCatalogRows("recipe", rows, { menus: ["ลาเต้"], ingredients: ["กาแฟ"], units: ["ลิตร"], categories: ["กาแฟ"] });
    expect(validated[0]._errors).toContain("ไม่พบชื่อวัตถุดิบ");
    expect(validated[1]._errors).toContain("รายการซ้ำในไฟล์");
  });

  it("calculates purchase cost from package contents without guessing units", () => {
    expect(calculatePurchaseUnitCost({ packageUnit: "ขวด", packageCount: 1, contentQuantity: 500, contentUnit: "ml", purchasePrice: 65 }, "ml")).toBe(0.13);
    expect(calculatePurchaseUnitCost({ packageUnit: "ถุง", packageCount: 1, contentQuantity: 1000, contentUnit: "g", purchasePrice: 850 }, "g")).toBe(0.85);
    expect(calculatePurchaseUnitCost({ packageUnit: "ถุง", packageCount: 1, contentQuantity: 2, contentUnit: "ถุง", purchasePrice: 100 }, "kg")).toBeNull();
  });

  it("detects CSV kind and keeps mapping editable", () => {
    const detection = detectCatalogCsvMapping(["menu_name", "ingredient_name", "quantity"]);
    expect(detection.detectedKind).toBe("recipe");
    expect(applyCsvMapping([{ menu_name: "ลาเต้", quantity: "2" }], { menu_name: "menuName", quantity: "quantity" })).toEqual([{ menuName: "ลาเต้", quantity: "2" }]);
  });

  it("suggests selling prices from gross margin deterministically", () => {
    expect(suggestMarginPrices(10).map((item) => item.price)).toEqual([20, 25, 33.33]);
  });
});

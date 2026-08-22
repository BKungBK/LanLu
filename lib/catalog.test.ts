import { describe, expect, it } from "vitest";
import { formatThaiDateInput, normalizeCatalogRows, parseIsoDateInput, validateCatalogRows } from "./catalog";

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
});

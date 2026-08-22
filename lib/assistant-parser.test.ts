import { describe, expect, it } from "vitest";
import { parseSimpleIngredientCommand } from "./assistant-parser";

describe("parseSimpleIngredientCommand", () => {
  it("parses the explicit Thai milk purchase command without Gemini", () => {
    const turn = parseSimpleIngredientCommand("เพิ่มวัตถุดิบ นม 10 ขวด ขวดละ 50 บาท และ 500ml");
    expect(turn?.status).toBe("draft");
    if (!turn || turn.status !== "draft") return;
    const row = turn.drafts[0].rows[0];
    expect(row).toMatchObject({
      name: "นม",
      unit: "ml",
      quantityOnHand: 5000,
      packageUnit: "ขวด",
      packageCount: 10,
      contentQuantity: 500,
      contentUnit: "ml",
      purchasePrice: 500,
      unitCost: 0.1,
    });
    expect(turn.calculations?.map((item) => item.value)).toEqual([5000, 10, 500, 0.1]);
  });

  it("accepts the shorter prompt used in the assistant composer", () => {
    const turn = parseSimpleIngredientCommand("เพิ่ม นม 10 ขวด ขวดละ 50 บาทและ 125 ml");
    expect(turn?.status).toBe("draft");
    if (!turn || turn.status !== "draft") return;
    expect(turn.drafts[0].rows[0]).toMatchObject({ name: "นม", quantityOnHand: 1250, contentQuantity: 125, unitCost: 0.4 });
  });

  it("defers ambiguous commands to the normal assistant path", () => {
    expect(parseSimpleIngredientCommand("เพิ่มวัตถุดิบ นม")).toBeNull();
    expect(parseSimpleIngredientCommand("เพิ่มเมนู ลาเต้")).toBeNull();
  });
});

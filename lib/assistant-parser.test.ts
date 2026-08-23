import { describe, expect, it } from "vitest";
import { parseIngredientFollowUp, parseSimpleIngredientCommand } from "./assistant-parser";

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

  it("understands conversational Thai with approximate per-package details", () => {
    const turn = parseSimpleIngredientCommand("ผมมี นม 10 ขวด ประมาณ 500 ml ต่อขวด ราคา 20 ไรงี้");
    expect(turn?.status).toBe("draft");
    if (!turn || turn.status !== "draft") return;
    expect(turn.drafts[0].rows[0]).toMatchObject({
      name: "นม",
      unit: "ml",
      quantityOnHand: 5000,
      packageUnit: "ขวด",
      packageCount: 10,
      contentQuantity: 500,
      contentUnit: "ml",
      purchasePrice: 200,
      unitCost: 0.04,
    });
    expect(turn.warnings).toContain("ปริมาณที่ระบุเป็นค่าประมาณ ตรวจสอบก่อนยืนยัน");
  });

  it("understands a total-purchase message without an explicit package", () => {
    const turn = parseSimpleIngredientCommand("เพิ่มวัตถุดิบ น้ำเชื่อม หน่วย ml ราคาซื้อ 120 บาท ปริมาณ 1000 ml");
    expect(turn?.status).toBe("draft");
    if (!turn || turn.status !== "draft") return;
    expect(turn.drafts[0].rows[0]).toMatchObject({ name: "น้ำเชื่อม", unit: "ml", quantityOnHand: 1000, purchasePrice: 120, unitCost: 0.12 });
  });

  it("asks when a multi-package price has no clear scope", () => {
    const turn = parseSimpleIngredientCommand("ผมมี นม 10 ขวด 500 ml ราคา 20");
    expect(turn?.status).toBe("question");
    if (!turn || turn.status !== "question") return;
    expect(turn.questions[0].id).toBe("purchase-price-scope");
  });

  it("parses an inventory message without a command prefix", () => {
    const turn = parseSimpleIngredientCommand("ผงกาแฟ 2 ถุง 20กรัม 70 บาท");
    expect(turn?.status).toBe("question");
    if (!turn || turn.status !== "question") return;
    expect(turn.questions[0].id).toBe("purchase-price-scope");
  });

  it("resolves a numeric answer using the previous assistant question", () => {
    const turn = parseIngredientFollowUp("70", [
      { role: "user", text: "ผงกาแฟ 2 ถุง 20กรัม 70 บาท" },
      { role: "assistant", text: "ระบุราคาซื้อ 20 บาทต่อถุง" },
      { role: "user", text: "70" },
    ]);
    expect(turn?.status).toBe("draft");
    if (!turn || turn.status !== "draft") return;
    expect(turn.drafts[0].rows[0]).toMatchObject({ name: "ผงกาแฟ", packageCount: 2, contentQuantity: 20, contentUnit: "g", purchasePrice: 140, unitCost: 3.5 });
  });

  it("resolves a scope quick reply without another model call", () => {
    const turn = parseIngredientFollowUp("ต่อถุง", [
      { role: "user", text: "ผงกาแฟ 2 ถุง 20กรัม 70 บาท" },
      { role: "assistant", text: "ราคา 70 บาทเป็นราคาต่อถุงหรือราคารวมทั้งหมด?" },
      { role: "user", text: "ต่อถุง" },
    ]);
    expect(turn?.status).toBe("draft");
    if (!turn || turn.status !== "draft") return;
    expect(turn.drafts[0].rows[0]).toMatchObject({ purchasePrice: 140, unitCost: 3.5 });
  });

  it("resolves a missing quantity answer using the unit in the question", () => {
    const turn = parseIngredientFollowUp("500", [
      { role: "user", text: "ผมมี นม 10 ขวด ราคา 20 ต่อขวด" },
      { role: "assistant", text: "ระบุปริมาณต่อขวด เช่น 500 ml" },
      { role: "user", text: "500" },
    ]);
    expect(turn?.status).toBe("draft");
    if (!turn || turn.status !== "draft") return;
    expect(turn.drafts[0].rows[0]).toMatchObject({ quantityOnHand: 5000, contentQuantity: 500, contentUnit: "ml", purchasePrice: 200 });
  });

  it("defers ambiguous commands to the normal assistant path", () => {
    expect(parseSimpleIngredientCommand("เพิ่มวัตถุดิบ นม")).toBeNull();
    expect(parseSimpleIngredientCommand("เพิ่มเมนู ลาเต้")).toBeNull();
  });
});

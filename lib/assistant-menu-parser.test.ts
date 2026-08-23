import { describe, expect, it } from "vitest";
import { parseMenuSetupCommand, parseMenuSetupFollowUp } from "./assistant-parser";

const context = {
  ingredients: [
    { name: "นมสด", unit: "ml" },
    { name: "ผงกาแฟ", unit: "g" },
  ],
  menus: [],
};

describe("menu setup assistant flow", () => {
  it("builds a menu and recipe draft from a natural Thai command", () => {
    const turn = parseMenuSetupCommand("เพิ่มเมนูลาเต้เย็น ราคา 75 บาท ใช้ นมสด 150 ml และ ผงกาแฟ 18 g", context);
    expect(turn?.status).toBe("draft");
    if (!turn || turn.status !== "draft") return;
    expect(turn.drafts.map((draft) => draft.kind)).toEqual(["menu", "recipe"]);
    expect(turn.drafts[0].rows[0]).toMatchObject({ name: "ลาเต้เย็น", price: 75, category: "อื่น ๆ" });
    expect(turn.drafts[1].rows).toEqual([
      { menuName: "ลาเต้เย็น", ingredientName: "นมสด", quantity: 150, unit: "ml" },
      { menuName: "ลาเต้เย็น", ingredientName: "ผงกาแฟ", quantity: 18, unit: "g" },
    ]);
  });

  it("asks for missing details instead of falling into a format error", () => {
    const turn = parseMenuSetupCommand("เพิ่มเมนูลาเต้เย็น พร้อมวัตถุดิบและสูตรให้ครบ", context);
    expect(turn?.status).toBe("question");
    if (!turn || turn.status !== "question") return;
    expect(turn.questions[0]).toMatchObject({ id: "menu-price", inputType: "number" });
  });

  it("keeps the menu context while collecting price and recipe details", () => {
    const first = parseMenuSetupCommand("เพิ่มเมนูลาเต้เย็น พร้อมวัตถุดิบและสูตรให้ครบ", context);
    expect(first?.status).toBe("question");
    if (!first || first.status !== "question") return;

    const second = parseMenuSetupFollowUp("75", [
      { role: "user", text: "เพิ่มเมนูลาเต้เย็น พร้อมวัตถุดิบและสูตรให้ครบ" },
      { role: "assistant", text: first.message },
      { role: "user", text: "75" },
    ], context);
    expect(second?.status).toBe("question");
    if (!second || second.status !== "question") return;
    expect(second.questions[0].id).toBe("menu-ingredients");

    const third = parseMenuSetupFollowUp("นมสด 150 ml และ ผงกาแฟ 18 g", [
      { role: "user", text: "เพิ่มเมนูลาเต้เย็น พร้อมวัตถุดิบและสูตรให้ครบ" },
      { role: "assistant", text: first.message },
      { role: "user", text: "75" },
      { role: "assistant", text: second.message },
      { role: "user", text: "นมสด 150 ml และ ผงกาแฟ 18 g" },
    ], context);
    expect(third?.status).toBe("draft");
    if (!third || third.status !== "draft") return;
    expect(third.drafts[1].rows).toHaveLength(2);
  });

  it("does not create a recipe draft for an unknown ingredient", () => {
    const turn = parseMenuSetupCommand("เพิ่มเมนูลาเต้ ราคา 70 บาท ใช้ไซรัป 10 ml", context);
    expect(turn?.status).toBe("question");
    if (!turn || turn.status !== "question") return;
    expect(turn.questions[0].id).toBe("menu-unknown-ingredients");
  });

  it("converts recipe quantities into the ingredient stock unit", () => {
    const turn = parseMenuSetupCommand("เพิ่มเมนูลาเต้ ราคา 75 บาท ใช้นมสด 150 ml", {
      ingredients: [{ name: "นมสด", unit: "L" }],
    });
    expect(turn?.status).toBe("draft");
    if (!turn || turn.status !== "draft") return;
    expect(turn.drafts[1].rows[0]).toMatchObject({ ingredientName: "นมสด", quantity: 0.15, unit: "L" });
  });
});

import { describe, expect, it } from "vitest";
import { getForecast, getRecipeCost, getStockStatus, sumSaleRevenue } from "./calculations";
import type { Ingredient, Recipe, SaleEntry } from "./types";

const ingredients: Ingredient[] = [{ id: "milk", name: "นม", unit: "ลิตร", quantityOnHand: 5, reorderPoint: 2, unitCost: 50 }];

describe("LanLu calculations", () => {
  it("calculates revenue from the price snapshot", () => {
    const sale: SaleEntry = { id: "sale", businessDate: "2026-08-22", occurredAt: "2026-08-22T10:00:00+07:00", idempotencyKey: "once", lines: [{ menuItemId: "latte", quantity: 3, priceSnapshot: 85, cogsSnapshot: 20 }] };
    expect(sumSaleRevenue(sale)).toBe(255);
  });

  it("calculates recipe cost from ingredient unit cost", () => {
    const recipe: Recipe = { menuItemId: "latte", updatedAt: "2026-08-22", lines: [{ ingredientId: "milk", quantity: 0.18 }] };
    expect(getRecipeCost(recipe, ingredients)).toBe(9);
  });

  it("keeps stock boundaries explicit", () => {
    expect(getStockStatus({ ...ingredients[0], quantityOnHand: 3 })).toBe("normal");
    expect(getStockStatus({ ...ingredients[0], quantityOnHand: 1.5 })).toBe("warning");
    expect(getStockStatus({ ...ingredients[0], quantityOnHand: 0 })).toBe("critical");
  });

  it("uses a low-confidence fallback when history is short", () => {
    const forecast = getForecast([], 3);
    expect(forecast).toHaveLength(3);
    expect(forecast.every((point) => point.confidence === "low")).toBe(true);
    expect(forecast.every((point) => point.low === 0 && point.high === 0)).toBe(true);
  });
});

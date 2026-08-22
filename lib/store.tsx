"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { initialState } from "./data";
import { getRecipeCost } from "./calculations";
import type { Ingredient, LanluState, MenuCategory, Recipe, SaleEntry, Shop } from "./types";

const STORAGE_KEY = "lanlu-mvp-state-v1";

type RecordSaleInput = {
  businessDate: string;
  orderCount?: number;
  lines: Array<{ menuItemId: string; quantity: number }>;
  idempotencyKey: string;
};

type PostMovementInput = {
  ingredientId: string;
  type: "receipt" | "consumption" | "waste" | "adjustment";
  quantity: number;
  note?: string;
  idempotencyKey: string;
};

type LanluContextValue = {
  state: LanluState;
  hydrated: boolean;
  recordSale: (input: RecordSaleInput) => { ok: boolean; message: string };
  postMovement: (input: PostMovementInput) => { ok: boolean; message: string };
  updateShop: (shop: Partial<Shop>) => void;
  addMenuItem: (input: { name: string; category: MenuCategory; price: number }) => void;
  addIngredient: (input: Omit<Ingredient, "id">) => void;
  saveRecipe: (recipe: Recipe) => void;
  dismissRecommendation: (id: string) => void;
  resetDemo: () => void;
};

const LanluContext = createContext<LanluContextValue | null>(null);

const id = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export function LanluProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<LanluState>(initialState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setState(JSON.parse(saved) as LanluState);
    } catch {
      // Keep the seeded state if local storage is unavailable or corrupted.
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [hydrated, state]);

  const value = useMemo<LanluContextValue>(() => ({
    state,
    hydrated,
    recordSale: (input) => {
      if (!input.lines.some((line) => line.quantity > 0)) return { ok: false, message: "เลือกเมนูอย่างน้อย 1 รายการก่อนบันทึก" };
      if (state.sales.some((sale) => sale.idempotencyKey === input.idempotencyKey)) return { ok: true, message: "รายการนี้ถูกบันทึกแล้ว" };

      const now = new Date().toISOString();
      const lines = input.lines.filter((line) => line.quantity > 0).map((line) => {
        const menu = state.menuItems.find((item) => item.id === line.menuItemId);
        const recipe = state.recipes.find((item) => item.menuItemId === line.menuItemId);
        return {
          menuItemId: line.menuItemId,
          quantity: line.quantity,
          priceSnapshot: menu?.price ?? 0,
          cogsSnapshot: getRecipeCost(recipe, state.ingredients),
        };
      });
      const sale: SaleEntry = { id: id("sale"), businessDate: input.businessDate, occurredAt: now, orderCount: input.orderCount, lines, idempotencyKey: input.idempotencyKey };
      const inventoryMovements = lines.flatMap((line) => {
        const recipe = state.recipes.find((item) => item.menuItemId === line.menuItemId);
        return recipe?.lines.map((recipeLine) => ({
          id: id("movement"), ingredientId: recipeLine.ingredientId, type: "consumption" as const,
          quantity: recipeLine.quantity * line.quantity, occurredAt: now,
          note: `ตัดจากยอดขาย ${state.menuItems.find((item) => item.id === line.menuItemId)?.name ?? "เมนู"}`,
          idempotencyKey: `${input.idempotencyKey}-${line.menuItemId}-${recipeLine.ingredientId}`,
        })) ?? [];
      });
      setState((current) => ({
        ...current,
        sales: [...current.sales, sale],
        ingredients: current.ingredients.map((ingredient) => {
          const used = inventoryMovements.filter((movement) => movement.ingredientId === ingredient.id).reduce((sum, movement) => sum + movement.quantity, 0);
          return used ? { ...ingredient, quantityOnHand: Number((ingredient.quantityOnHand - used).toFixed(3)) } : ingredient;
        }),
        inventoryMovements: [...current.inventoryMovements, ...inventoryMovements],
      }));
      return { ok: true, message: "บันทึกยอดขายและตัดสต๊อกตามสูตรแล้ว" };
    },
    postMovement: (input) => {
      if (input.quantity <= 0) return { ok: false, message: "ใส่จำนวนให้มากกว่า 0" };
      if (state.inventoryMovements.some((movement) => movement.idempotencyKey === input.idempotencyKey)) return { ok: true, message: "รายการนี้ถูกบันทึกแล้ว" };
      const direction = input.type === "receipt" ? 1 : input.type === "adjustment" ? 1 : -1;
      const movement = { id: id("movement"), ...input, occurredAt: new Date().toISOString() };
      setState((current) => ({
        ...current,
        inventoryMovements: [...current.inventoryMovements, movement],
        ingredients: current.ingredients.map((ingredient) => ingredient.id === input.ingredientId ? { ...ingredient, quantityOnHand: Number((ingredient.quantityOnHand + input.quantity * direction).toFixed(3)) } : ingredient),
      }));
      return { ok: true, message: input.type === "receipt" ? "รับวัตถุดิบเข้าสต๊อกแล้ว" : "บันทึกความเคลื่อนไหวแล้ว" };
    },
    updateShop: (shop) => setState((current) => ({ ...current, shop: { ...current.shop, ...shop } })),
    addMenuItem: (input) => setState((current) => ({ ...current, menuItems: [...current.menuItems, { id: id("menu"), ...input, active: true }] })),
    addIngredient: (input) => setState((current) => ({ ...current, ingredients: [...current.ingredients, { id: id("ingredient"), ...input }] })),
    saveRecipe: (recipe) => setState((current) => ({ ...current, recipes: [...current.recipes.filter((item) => item.menuItemId !== recipe.menuItemId), recipe] })),
    dismissRecommendation: (recommendationId) => setState((current) => ({ ...current, recommendations: current.recommendations.map((item) => item.id === recommendationId ? { ...item, dismissed: true } : item) })),
    resetDemo: () => setState(initialState),
  }), [hydrated, state]);

  return <LanluContext.Provider value={value}>{children}</LanluContext.Provider>;
}

export function useLanlu() {
  const context = useContext(LanluContext);
  if (!context) throw new Error("useLanlu must be used inside LanluProvider");
  return context;
}

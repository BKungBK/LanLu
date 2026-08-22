"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { CatalogBundleImportInput, CatalogImportInput, Ingredient, LanluState, MenuCategory, MenuItem, Recommendation, Recipe, Shop } from "./types";

type Result = { ok: boolean; message: string };

type RecordSaleInput = {
  businessDate: string;
  occurredAt?: string;
  orderCount?: number;
  lines: Array<{ menuItemId: string; quantity: number }>;
  idempotencyKey: string;
};

type PostMovementInput = {
  ingredientId: string;
  type: "receipt" | "consumption" | "waste" | "adjustment";
  quantity: number;
  adjustmentDelta?: number;
  occurredAt?: string;
  note?: string;
  lotCode?: string;
  expiresOn?: string;
  unitCost?: number;
  idempotencyKey: string;
};

type LanluContextValue = {
  state: LanluState;
  user: { id: string; email?: string } | null;
  loading: boolean;
  hydrated: boolean;
  error: string;
  needsOnboarding: boolean;
  refresh: () => Promise<void>;
  createShop: (input: { name: string; ownerName: string }) => Promise<Result>;
  recordSale: (input: RecordSaleInput) => Promise<Result>;
  confirmDailyClose: (input: RecordSaleInput & { note?: string }) => Promise<Result>;
  postMovement: (input: PostMovementInput) => Promise<Result>;
  updateShop: (shop: Partial<Shop>) => Promise<Result>;
  addMenuItem: (input: { name: string; category: MenuCategory; price: number }) => Promise<Result>;
  updateMenuItem: (input: Pick<MenuItem, "id"> & Partial<Omit<MenuItem, "id">>) => Promise<Result>;
  createMenuCategory: (name: string) => Promise<Result>;
  addIngredient: (input: Omit<Ingredient, "id"> & { openingExpiry?: string }) => Promise<Result>;
  updateIngredient: (input: Pick<Ingredient, "id"> & Partial<Omit<Ingredient, "id" | "quantityOnHand" | "nearestExpiry">>) => Promise<Result>;
  saveRecipe: (recipe: Recipe) => Promise<Result>;
  importCatalog: (input: CatalogImportInput) => Promise<Result>;
  importCatalogBundle: (input: CatalogBundleImportInput) => Promise<Result>;
  dismissRecommendation: (id: string) => Promise<Result>;
  resetDemo: () => void;
};

const emptyState: LanluState = {
  shop: { id: undefined, name: "ร้านของฉัน", ownerName: "", timezone: "Asia/Bangkok", currency: "THB", onboarded: false },
  menuItems: [],
  ingredients: [],
  recipes: [],
  sales: [],
  inventoryMovements: [],
  recommendations: [],
};

const LanluContext = createContext<LanluContextValue | null>(null);
const number = (value: unknown) => Number(value ?? 0);
const now = () => new Date().toISOString();
const randomKey = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

function messageForError(error: { message?: string } | null, fallback: string) {
  const message = error?.message ?? "";
  if (message.includes("shop_access_denied") || message.includes("JWT")) return "เซสชันหมดอายุหรือไม่มีสิทธิ์เข้าถึงร้านนี้";
  if (message.includes("shop_already_exists")) return "บัญชีนี้มีร้านอยู่แล้ว";
  if (message.includes("ingredient_access_denied")) return "ไม่พบวัตถุดิบของร้านนี้";
  if (message.includes("recipe_requires_line")) return "สูตรต้องมีวัตถุดิบอย่างน้อย 1 รายการ";
  if (message.includes("sale_requires_line")) return "เลือกเมนูอย่างน้อย 1 รายการก่อนบันทึก";
  if (message.includes("menu_item_not_found")) return "ไม่พบเมนูนี้แล้ว ลองโหลดหน้าใหม่";
  if (message.includes("duplicate") || message.includes("unique")) return "รายการนี้ถูกบันทึกไปแล้ว";
  return message || fallback;
}

function stockStatus(quantityOnHand: number, reorderPoint: number) {
  if (quantityOnHand <= 0) return "critical" as const;
  if (quantityOnHand <= reorderPoint) return "warning" as const;
  return "normal" as const;
}

function buildRecommendations(state: LanluState) {
  const createdAt = now();
  const recommendations: Recommendation[] = state.ingredients.flatMap((ingredient) => {
    const result: Recommendation[] = [];
    if (ingredient.quantityOnHand <= ingredient.reorderPoint) {
      result.push({
        id: `local-stock-${ingredient.id}`, type: "stock" as const,
        severity: stockStatus(ingredient.quantityOnHand, ingredient.reorderPoint) === "critical" ? "critical" as const : "warning" as const,
        title: `${ingredient.name} ต่ำกว่าจุดสั่งซื้อ`,
        body: `เหลือ ${ingredient.quantityOnHand} ${ingredient.unit} จากจุดสั่งซื้อ ${ingredient.reorderPoint} ${ingredient.unit}`,
        action: "order_ingredient" as const, createdAt,
      });
    }
    if (ingredient.nearestExpiry) {
      const days = Math.ceil((new Date(`${ingredient.nearestExpiry}T23:59:59+07:00`).getTime() - Date.now()) / 86400000);
      if (days <= 7 && ingredient.quantityOnHand > 0) {
        result.push({
          id: `local-expiry-${ingredient.id}`, type: "expiry" as const,
          severity: days <= 2 ? "critical" as const : "warning" as const,
          title: `ใช้${ingredient.name}ก่อนหมดอายุ`,
          body: `ล็อตใกล้สุดหมดอายุใน ${Math.max(days, 0)} วัน · เหลือ ${ingredient.quantityOnHand} ${ingredient.unit}`,
          action: "prepare_ingredient" as const, createdAt,
        });
      }
    }
    return result;
  });
  const missingRecipe = state.menuItems.find((menu) => !state.recipes.some((recipe) => recipe.menuItemId === menu.id));
  if (missingRecipe) recommendations.push({ id: `local-recipe-${missingRecipe.id}`, type: "sales" as const, severity: "warning" as const, title: `ยังไม่มีสูตร${missingRecipe.name}`, body: "ยอดขายยังบันทึกได้ แต่ระบบยังคำนวณต้นทุนและการใช้วัตถุดิบให้ไม่ได้", action: "setup_recipe" as const, createdAt });
  if (state.sales.length === 0) recommendations.push({ id: "local-data-quality-sales", type: "sales" as const, severity: "info" as const, title: "เริ่มบันทึกยอดขายเพื่อให้ระบบเห็นแนวโน้ม", body: "ยังไม่มีข้อมูลยอดขายที่ยืนยันแล้ว จึงยังไม่มี forecast หรือ insight จากยอดจริง", action: "promote_menu" as const, createdAt });
  return recommendations;
}

export function LanluProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<LanluState>(emptyState);
  const [user, setUser] = useState<LanluContextValue["user"]>(null);
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState("");

  const loadForUser = useCallback(async (currentUser: { id: string; email?: string }) => {
    setLoading(true);
    setError("");
    const { data: member, error: memberError } = await supabase.from("shop_members").select("shop_id, shops(id, name, owner_name, timezone, currency)").eq("user_id", currentUser.id).order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (memberError) { setError(messageForError(memberError, "โหลดข้อมูลร้านไม่สำเร็จ")); setLoading(false); setHydrated(true); return; }
    if (!member?.shop_id) { setState(emptyState); setLoading(false); setHydrated(true); return; }

    const shopId = member.shop_id as string;
    const [menuResult, ingredientResult, lotResult, movementResult, recipeResult, salesResult, recommendationResult] = await Promise.all([
      supabase.from("menu_items").select("id, name, price, active, menu_categories(name)").eq("shop_id", shopId).order("created_at"),
      supabase.from("ingredients").select("id, name, unit, supplier, reorder_point, unit_cost, purchase_package_unit, purchase_package_count, purchase_content_quantity, purchase_content_unit, purchase_price, purchase_conversion_factor").eq("shop_id", shopId).order("created_at"),
      supabase.from("inventory_lots").select("id, ingredient_id, quantity_remaining, expires_on, created_at").eq("shop_id", shopId).order("expires_on", { ascending: true, nullsFirst: false }),
      supabase.from("inventory_movements").select("id, ingredient_id, type, quantity, adjustment_delta, occurred_at, note, idempotency_key").eq("shop_id", shopId).order("occurred_at", { ascending: false }).limit(5000),
      supabase.from("recipes").select("id, menu_item_id, version, updated_at, recipe_lines(ingredient_id, quantity)").eq("shop_id", shopId).order("version", { ascending: false }),
      supabase.from("sales_transactions").select("id, business_date, occurred_at, order_count, idempotency_key, sales_lines(menu_item_id, quantity, price_snapshot, cogs_snapshot)").eq("shop_id", shopId).order("business_date", { ascending: false }).limit(5000),
      supabase.from("recommendations").select("id, type, severity, title, body, action, source_timestamp, dismissed_at").eq("shop_id", shopId).is("dismissed_at", null).order("created_at", { ascending: false }),
    ]);
    const firstError = [menuResult, ingredientResult, lotResult, movementResult, recipeResult, salesResult, recommendationResult].find((result) => result.error)?.error;
    if (firstError) { setError(messageForError(firstError, "โหลดข้อมูลร้านไม่ครบ")); setLoading(false); setHydrated(true); return; }

    const lots = (lotResult.data ?? []) as Array<{ id: string; ingredient_id: string; quantity_remaining: number; expires_on?: string; created_at: string }>;
    const movements = (movementResult.data ?? []) as Array<{ id: string; ingredient_id: string; type: "receipt" | "consumption" | "waste" | "adjustment"; quantity: number; adjustment_delta?: number; occurred_at: string; note?: string; idempotency_key: string }>;
    const quantities = new Map<string, number>();
    movements.forEach((movement) => { const delta = movement.type === "receipt" ? number(movement.quantity) : movement.type === "adjustment" ? number(movement.adjustment_delta ?? movement.quantity) : -number(movement.quantity); quantities.set(movement.ingredient_id, (quantities.get(movement.ingredient_id) ?? 0) + delta); });
    const expiry = new Map<string, string>();
    lots.filter((lot) => number(lot.quantity_remaining) > 0 && lot.expires_on).forEach((lot) => { if (!expiry.has(lot.ingredient_id)) expiry.set(lot.ingredient_id, lot.expires_on!); });
    const menuItems = (menuResult.data ?? []).map((menu: any) => { const category = Array.isArray(menu.menu_categories) ? menu.menu_categories[0]?.name : menu.menu_categories?.name; return { id: menu.id, name: menu.name, category: (category || "อื่น ๆ") as MenuCategory, price: number(menu.price), active: Boolean(menu.active) }; });
    const ingredients = (ingredientResult.data ?? []).map((ingredient: any) => ({
      id: ingredient.id,
      name: ingredient.name,
      unit: ingredient.unit as Ingredient["unit"],
      supplier: ingredient.supplier ?? undefined,
      quantityOnHand: Number((quantities.get(ingredient.id) ?? 0).toFixed(3)),
      reorderPoint: number(ingredient.reorder_point),
      unitCost: number(ingredient.unit_cost),
      nearestExpiry: expiry.get(ingredient.id),
      purchase: ingredient.purchase_package_unit || ingredient.purchase_content_unit ? {
        packageUnit: ingredient.purchase_package_unit ?? "",
        packageCount: number(ingredient.purchase_package_count),
        contentQuantity: number(ingredient.purchase_content_quantity),
        contentUnit: ingredient.purchase_content_unit ?? ingredient.unit,
        purchasePrice: number(ingredient.purchase_price),
        unitCost: number(ingredient.unit_cost),
        conversionFactor: ingredient.purchase_conversion_factor == null ? undefined : number(ingredient.purchase_conversion_factor),
      } : undefined,
    }));
    const seenRecipes = new Set<string>();
    const recipes = ((recipeResult.data ?? []) as Array<{ menu_item_id: string; updated_at: string; version: number; recipe_lines?: Array<{ ingredient_id: string; quantity: number }> }>).filter((recipe) => { if (seenRecipes.has(recipe.menu_item_id)) return false; seenRecipes.add(recipe.menu_item_id); return true; }).map((recipe) => ({ menuItemId: recipe.menu_item_id, updatedAt: recipe.updated_at, lines: (recipe.recipe_lines ?? []).map((line) => ({ ingredientId: line.ingredient_id, quantity: number(line.quantity) })) }));
    const sales = ((salesResult.data ?? []) as Array<{ id: string; business_date: string; occurred_at: string; order_count?: number; idempotency_key: string; sales_lines?: Array<{ menu_item_id: string; quantity: number; price_snapshot: number; cogs_snapshot: number }> }>).map((sale) => ({ id: sale.id, businessDate: sale.business_date, occurredAt: sale.occurred_at, orderCount: sale.order_count, idempotencyKey: sale.idempotency_key, lines: (sale.sales_lines ?? []).map((line) => ({ menuItemId: line.menu_item_id, quantity: line.quantity, priceSnapshot: number(line.price_snapshot), cogsSnapshot: number(line.cogs_snapshot) })) }));
    const loadedState: LanluState = {
      shop: { id: shopId, name: member.shops?.name ?? "ร้านของฉัน", ownerName: member.shops?.owner_name ?? "", timezone: member.shops?.timezone ?? "Asia/Bangkok", currency: member.shops?.currency ?? "THB", onboarded: true },
      menuItems, ingredients, recipes, sales,
      inventoryMovements: movements.map((movement) => ({ id: movement.id, ingredientId: movement.ingredient_id, type: movement.type, quantity: number(movement.quantity), occurredAt: movement.occurred_at, note: movement.note, idempotencyKey: movement.idempotency_key })),
      recommendations: (recommendationResult.data ?? []).map((recommendation: any) => ({ id: recommendation.id, type: recommendation.type, severity: recommendation.severity, title: recommendation.title, body: recommendation.body, action: recommendation.action, createdAt: recommendation.source_timestamp })),
    };
    if (loadedState.recommendations.length === 0) loadedState.recommendations = buildRecommendations(loadedState);
    setState(loadedState); setLoading(false); setHydrated(true);
  }, [supabase]);

  const refresh = useCallback(async () => { if (user) await loadForUser(user); }, [loadForUser, user]);

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }: { data: { user: User | null } }) => { if (!active) return; const nextUser = data.user ? { id: data.user.id, email: data.user.email } : null; setUser(nextUser); if (nextUser) void loadForUser(nextUser); else { setState(emptyState); setLoading(false); setHydrated(true); } });
    const { data: listener } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => { const nextUser = session?.user ? { id: session.user.id, email: session.user.email } : null; setUser(nextUser); if (nextUser) void loadForUser(nextUser); else { setState(emptyState); setLoading(false); } });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [loadForUser, supabase]);

  const createShop = useCallback(async (input: { name: string; ownerName: string }): Promise<Result> => { const { error: rpcError } = await supabase.rpc("create_shop_with_defaults", { shop_name: input.name, shop_owner_name: input.ownerName }); if (rpcError) return { ok: false, message: messageForError(rpcError, "สร้างร้านไม่สำเร็จ") }; await refresh(); return { ok: true, message: "สร้างร้านแล้ว" }; }, [refresh, supabase]);
  const recordSale = useCallback(async (input: RecordSaleInput): Promise<Result> => { if (!state.shop.id) return { ok: false, message: "ตั้งค่าร้านก่อนบันทึกยอดขาย" }; if (!input.lines.some((line) => line.quantity > 0)) return { ok: false, message: "เลือกเมนูอย่างน้อย 1 รายการก่อนบันทึก" }; const { error: rpcError } = await supabase.rpc("record_sales_batch", { target_shop_id: state.shop.id, business_date: input.businessDate, occurred_at: input.occurredAt ?? now(), order_count: input.orderCount ?? null, sale_lines: input.lines, idempotency_key: input.idempotencyKey }); if (rpcError) return { ok: false, message: messageForError(rpcError, "บันทึกยอดขายไม่สำเร็จ") }; await refresh(); return { ok: true, message: "บันทึกยอดขายและตัดสต๊อกตามสูตรแล้ว" }; }, [refresh, state.shop.id, supabase]);
  const confirmDailyClose = useCallback(async (input: RecordSaleInput & { note?: string }): Promise<Result> => { if (!state.shop.id) return { ok: false, message: "ตั้งค่าร้านก่อนปิดยอด" }; if (!input.lines.some((line) => line.quantity > 0)) return { ok: false, message: "เลือกเมนูอย่างน้อย 1 รายการก่อนปิดยอด" }; const { error: rpcError } = await supabase.rpc("confirm_daily_close", { target_shop_id: state.shop.id, business_date: input.businessDate, occurred_at: input.occurredAt ?? now(), order_count: input.orderCount ?? null, sale_lines: input.lines, note: input.note ?? "ยืนยัน Daily close จาก Quick capture", idempotency_key: input.idempotencyKey }); if (rpcError) return { ok: false, message: messageForError(rpcError, "ยืนยัน Daily close ไม่สำเร็จ") }; await refresh(); return { ok: true, message: "ยืนยัน Daily close และตัดสต๊อกแล้ว" }; }, [refresh, state.shop.id, supabase]);
  const postMovement = useCallback(async (input: PostMovementInput): Promise<Result> => { if (!state.shop.id) return { ok: false, message: "ตั้งค่าร้านก่อนบันทึกสต๊อก" }; if (input.quantity <= 0) return { ok: false, message: "ใส่จำนวนให้มากกว่า 0" }; const { error: rpcError } = await supabase.rpc("post_inventory_movement", { target_shop_id: state.shop.id, target_ingredient_id: input.ingredientId, movement_type: input.type, movement_quantity: input.quantity, occurred_at: input.occurredAt ?? now(), note: input.note ?? null, idempotency_key: input.idempotencyKey, lot_code: input.lotCode ?? null, expires_on: input.expiresOn ?? null, unit_cost: input.unitCost ?? null, adjustment_delta: input.adjustmentDelta ?? null }); if (rpcError) return { ok: false, message: messageForError(rpcError, "บันทึกความเคลื่อนไหวไม่สำเร็จ") }; await refresh(); return { ok: true, message: input.type === "receipt" ? "รับวัตถุดิบเข้าสต๊อกแล้ว" : "บันทึกความเคลื่อนไหวแล้ว" }; }, [refresh, state.shop.id, supabase]);
  const updateShop = useCallback(async (shop: Partial<Shop>): Promise<Result> => { if (!state.shop.id) return { ok: false, message: "ยังไม่มีร้าน" }; const { error: updateError } = await supabase.from("shops").update({ name: shop.name, owner_name: shop.ownerName, timezone: shop.timezone, currency: shop.currency, updated_at: now() }).eq("id", state.shop.id); if (updateError) return { ok: false, message: messageForError(updateError, "บันทึกร้านไม่สำเร็จ") }; await refresh(); return { ok: true, message: "บันทึกข้อมูลร้านแล้ว" }; }, [refresh, state.shop.id, supabase]);
  const addMenuItem = useCallback(async (input: { name: string; category: MenuCategory; price: number }): Promise<Result> => { if (!state.shop.id) return { ok: false, message: "ตั้งค่าร้านก่อนเพิ่มเมนู" }; const { data: category } = await supabase.from("menu_categories").select("id").eq("shop_id", state.shop.id).eq("name", input.category).maybeSingle(); const { error: insertError } = await supabase.from("menu_items").insert({ shop_id: state.shop.id, category_id: category?.id ?? null, name: input.name.trim(), price: input.price, created_by: user?.id }); if (insertError) return { ok: false, message: messageForError(insertError, "เพิ่มเมนูไม่สำเร็จ") }; await refresh(); return { ok: true, message: "เพิ่มเมนูแล้ว" }; }, [refresh, state.shop.id, supabase, user?.id]);
  const updateMenuItem = useCallback(async (input: Pick<MenuItem, "id"> & Partial<Omit<MenuItem, "id">>): Promise<Result> => { if (!state.shop.id) return { ok: false, message: "ยังไม่มีร้าน" }; const { error: updateError } = await supabase.rpc("update_catalog_master", { target_shop_id: state.shop.id, target_kind: "menu", target_id: input.id, payload: { ...(input.name === undefined ? {} : { name: input.name.trim() }), ...(input.price === undefined ? {} : { price: input.price }), ...(input.active === undefined ? {} : { active: input.active }), ...(input.category === undefined ? {} : { category: input.category }) } }); if (updateError) return { ok: false, message: messageForError(updateError, "แก้ไขเมนูไม่สำเร็จ") }; await refresh(); return { ok: true, message: "แก้ไขเมนูแล้ว" }; }, [refresh, state.shop.id, supabase]);
  const createMenuCategory = useCallback(async (name: string): Promise<Result> => { if (!state.shop.id || !user?.id || !name.trim()) return { ok: false, message: "ใส่ชื่อหมวดก่อน" }; const { error: insertError } = await supabase.from("menu_categories").upsert({ shop_id: state.shop.id, name: name.trim(), created_by: user.id, updated_at: now() }, { onConflict: "shop_id,name" }); if (insertError) return { ok: false, message: messageForError(insertError, "เพิ่มหมวดไม่สำเร็จ") }; return { ok: true, message: `เพิ่มหมวด${name.trim()}แล้ว` }; }, [state.shop.id, supabase, user?.id]);
  const addIngredient = useCallback(async (input: Omit<Ingredient, "id"> & { openingExpiry?: string }): Promise<Result> => {
    if (!state.shop.id || !user?.id) return { ok: false, message: "ตั้งค่าร้านก่อนเพิ่มวัตถุดิบ" };
    const purchase = input.purchase;
    const { data: ingredient, error: insertError } = await supabase.from("ingredients").insert({ shop_id: state.shop.id, name: input.name.trim(), unit: input.unit, supplier: input.supplier || null, reorder_point: input.reorderPoint, unit_cost: input.unitCost, purchase_package_unit: purchase?.packageUnit || null, purchase_package_count: purchase?.packageCount || null, purchase_content_quantity: purchase?.contentQuantity || null, purchase_content_unit: purchase?.contentUnit || null, purchase_price: purchase?.purchasePrice ?? null, purchase_conversion_factor: purchase?.conversionFactor || null, created_by: user.id }).select("id").single();
    if (insertError || !ingredient) return { ok: false, message: messageForError(insertError, "เพิ่มวัตถุดิบไม่สำเร็จ") };
    if (input.quantityOnHand > 0) { const receipt = await postMovement({ ingredientId: ingredient.id, type: "receipt", quantity: input.quantityOnHand, unitCost: input.unitCost, expiresOn: input.openingExpiry, note: "ยอดเริ่มต้นจากการตั้งค่า", idempotencyKey: randomKey("opening-stock") }); if (!receipt.ok) return receipt; }
    await refresh(); return { ok: true, message: "เพิ่มวัตถุดิบแล้ว" };
  }, [postMovement, refresh, state.shop.id, supabase, user?.id]);
  const updateIngredient = useCallback(async (input: Pick<Ingredient, "id"> & Partial<Omit<Ingredient, "id" | "quantityOnHand" | "nearestExpiry">>): Promise<Result> => {
    if (!state.shop.id) return { ok: false, message: "ยังไม่มีร้าน" };
    const purchase = input.purchase;
    const { error: updateError } = await supabase.rpc("update_catalog_master", { target_shop_id: state.shop.id, target_kind: "ingredient", target_id: input.id, payload: { ...(input.name === undefined ? {} : { name: input.name.trim() }), ...(input.unit === undefined ? {} : { unit: input.unit }), ...(input.supplier === undefined ? {} : { supplier: input.supplier || null }), ...(input.reorderPoint === undefined ? {} : { reorderPoint: input.reorderPoint }), ...(input.unitCost === undefined ? {} : { unitCost: input.unitCost }), ...(purchase === undefined ? {} : { packageUnit: purchase.packageUnit, packageCount: purchase.packageCount, contentQuantity: purchase.contentQuantity, contentUnit: purchase.contentUnit, purchasePrice: purchase.purchasePrice, conversionFactor: purchase.conversionFactor ?? null }) } });
    if (updateError) return { ok: false, message: messageForError(updateError, "แก้ไขวัตถุดิบไม่สำเร็จ") }; await refresh(); return { ok: true, message: "แก้ไขวัตถุดิบแล้ว" };
  }, [refresh, state.shop.id, supabase]);
  const saveRecipe = useCallback(async (recipe: Recipe): Promise<Result> => { if (!state.shop.id) return { ok: false, message: "ตั้งค่าร้านก่อนบันทึกสูตร" }; const { error: rpcError } = await supabase.rpc("save_recipe", { target_shop_id: state.shop.id, target_menu_item_id: recipe.menuItemId, recipe_lines: recipe.lines }); if (rpcError) return { ok: false, message: messageForError(rpcError, "บันทึกสูตรไม่สำเร็จ") }; await refresh(); return { ok: true, message: "บันทึกสูตรแล้ว" }; }, [refresh, state.shop.id, supabase]);
  const importCatalog = useCallback(async (input: CatalogImportInput): Promise<Result> => { if (!state.shop.id) return { ok: false, message: "ตั้งค่าร้านก่อนนำเข้า" }; const { error: importError } = await supabase.rpc("bulk_import_catalog", { target_shop_id: state.shop.id, import_kind: input.kind, import_rows: input.rows, idempotency_key: input.idempotencyKey, conflict_mode: input.conflictMode }); if (importError) return { ok: false, message: messageForError(importError, "นำเข้าข้อมูลไม่สำเร็จ") }; await refresh(); return { ok: true, message: "นำเข้าข้อมูลเข้า LanLu แล้ว" }; }, [refresh, state.shop.id, supabase]);
  const importCatalogBundle = useCallback(async (input: CatalogBundleImportInput): Promise<Result> => {
    if (!state.shop.id) return { ok: false, message: "ตั้งค่าร้านก่อนนำเข้า" };
    const { error: importError } = await supabase.rpc("bulk_import_catalog_bundle", { target_shop_id: state.shop.id, import_rows: input.bundle.drafts.map((draft) => ({ kind: draft.kind, rows: draft.rows })), idempotency_key: input.idempotencyKey, conflict_mode: input.conflictMode });
    if (importError) return { ok: false, message: messageForError(importError, "นำเข้าชุด catalog ไม่สำเร็จ") };
    await refresh(); return { ok: true, message: "นำเข้าชุด catalog แบบ transaction เดียวแล้ว" };
  }, [refresh, state.shop.id, supabase]);
  const dismissRecommendation = useCallback(async (recommendationId: string): Promise<Result> => { if (recommendationId.startsWith("local-")) { setState((current) => ({ ...current, recommendations: current.recommendations.filter((item) => item.id !== recommendationId) })); return { ok: true, message: "ซ่อนคำแนะนำแล้ว" }; } const { error: updateError } = await supabase.from("recommendations").update({ dismissed_at: now() }).eq("id", recommendationId); if (updateError) return { ok: false, message: messageForError(updateError, "ซ่อนคำแนะนำไม่สำเร็จ") }; await refresh(); return { ok: true, message: "ซ่อนคำแนะนำแล้ว" }; }, [refresh, supabase]);
  const value = useMemo<LanluContextValue>(() => ({ state, user, loading, hydrated, error, needsOnboarding: Boolean(user && !state.shop.id), refresh, createShop, recordSale, confirmDailyClose, postMovement, updateShop, addMenuItem, updateMenuItem, createMenuCategory, addIngredient, updateIngredient, saveRecipe, importCatalog, importCatalogBundle, dismissRecommendation, resetDemo: () => setState(emptyState) }), [addIngredient, addMenuItem, confirmDailyClose, createMenuCategory, createShop, dismissRecommendation, error, hydrated, importCatalog, importCatalogBundle, loading, postMovement, recordSale, refresh, saveRecipe, state, updateIngredient, updateMenuItem, updateShop, user]);
  return <LanluContext.Provider value={value}>{children}</LanluContext.Provider>;
}

export function useLanlu() {
  const context = useContext(LanluContext);
  if (!context) throw new Error("useLanlu must be used inside LanluProvider");
  return context;
}

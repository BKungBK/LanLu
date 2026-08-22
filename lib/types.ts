export type MenuCategory = "กาแฟ" | "ชา" | "อื่น ๆ";

export type MenuItem = {
  id: string;
  name: string;
  category: MenuCategory;
  price: number;
  active: boolean;
};

export type Ingredient = {
  id: string;
  name: string;
  unit: "กก." | "ลิตร" | "ชิ้น" | "ถุง" | "ขวด";
  quantityOnHand: number;
  reorderPoint: number;
  unitCost: number;
  nearestExpiry?: string;
  supplier?: string;
};

export type RecipeLine = {
  ingredientId: string;
  quantity: number;
};

export type Recipe = {
  menuItemId: string;
  lines: RecipeLine[];
  updatedAt: string;
};

export type SaleLine = {
  menuItemId: string;
  quantity: number;
  priceSnapshot: number;
  cogsSnapshot: number;
};

export type SaleEntry = {
  id: string;
  businessDate: string;
  occurredAt: string;
  orderCount?: number;
  lines: SaleLine[];
  idempotencyKey: string;
};

export type InventoryMovement = {
  id: string;
  ingredientId: string;
  type: "receipt" | "consumption" | "waste" | "adjustment";
  quantity: number;
  occurredAt: string;
  note?: string;
  idempotencyKey: string;
};

export type RecommendationType = "stock" | "expiry" | "sales" | "promotion";
export type RecommendationSeverity = "info" | "warning" | "critical";

export type Recommendation = {
  id: string;
  type: RecommendationType;
  severity: RecommendationSeverity;
  title: string;
  body: string;
  action: "order_ingredient" | "adjust_stock" | "promote_menu" | "prepare_ingredient" | "setup_recipe";
  createdAt: string;
  dismissed?: boolean;
};

export type Shop = {
  id?: string;
  name: string;
  ownerName: string;
  timezone: string;
  currency: string;
  onboarded: boolean;
};

export type LanluState = {
  shop: Shop;
  menuItems: MenuItem[];
  ingredients: Ingredient[];
  recipes: Recipe[];
  sales: SaleEntry[];
  inventoryMovements: InventoryMovement[];
  recommendations: Recommendation[];
};

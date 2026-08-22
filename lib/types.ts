export type MenuCategory = string;
export type IngredientUnit = string;

export type IngredientPurchaseInfo = {
  packageUnit: string;
  packageCount: number;
  contentQuantity: number;
  contentUnit: string;
  purchasePrice: number;
  unitCost: number;
  conversionFactor?: number;
};

export type MenuItem = {
  id: string;
  name: string;
  category: MenuCategory;
  price: number;
  active: boolean;
  archivedAt?: string;
};

export type Ingredient = {
  id: string;
  name: string;
  unit: IngredientUnit;
  quantityOnHand: number;
  reorderPoint: number;
  unitCost: number;
  nearestExpiry?: string;
  supplier?: string;
  active?: boolean;
  purchase?: IngredientPurchaseInfo;
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

export type CatalogDraftKind = "ingredient" | "menu" | "recipe";

export type CatalogDraft = {
  kind: CatalogDraftKind;
  source: "gemini" | "csv" | "manual";
  rows: Array<Record<string, unknown>>;
  warnings: string[];
};

export type CatalogDraftBundle = {
  source: "gemini" | "csv" | "manual";
  drafts: CatalogDraft[];
  warnings: string[];
};

export type AssistantQuestion = {
  id: string;
  label: string;
  inputType: "text" | "number" | "select";
  options?: string[];
};

export type AssistantCalculation = {
  label: string;
  value: number;
  unit: string;
};

export type CsvMappingSuggestion = {
  detectedKind: CatalogDraftKind;
  confidence: number;
  mapping: Record<string, string>;
};

export type AssistantTurn =
  | { status: "question"; message: string; questions: AssistantQuestion[] }
  | { status: "answer"; message: string; calculations?: AssistantCalculation[]; csvMapping?: CsvMappingSuggestion }
  | { status: "draft"; message: string; drafts: CatalogDraft[]; warnings: string[] };

export type CatalogImportInput = {
  kind: CatalogDraftKind;
  rows: Array<Record<string, unknown>>;
  idempotencyKey: string;
  conflictMode: "create" | "update" | "skip";
};

export type CatalogBundleImportInput = {
  bundle: CatalogDraftBundle;
  idempotencyKey: string;
  conflictMode: "create" | "update" | "skip";
};

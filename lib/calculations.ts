import type { Ingredient, LanluState, MenuItem, Recipe, SaleEntry } from "./types";

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(value);

export const getTodayInTimezone = (timeZone = "Asia/Bangkok") =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export const getDateRange = (endDate: string, length = 7) => Array.from({ length }, (_, index) => {
  const date = new Date(`${endDate}T12:00:00+07:00`);
  date.setDate(date.getDate() - (length - 1 - index));
  return date.toISOString().slice(0, 10);
});

export const sumSaleRevenue = (sale: SaleEntry) => sale.lines.reduce((sum, line) => sum + line.quantity * line.priceSnapshot, 0);

export const sumSaleCogs = (sale: SaleEntry) => sale.lines.reduce((sum, line) => sum + line.quantity * line.cogsSnapshot, 0);

export const getRecipeCost = (recipe: Recipe | undefined, ingredients: Ingredient[]) => {
  if (!recipe) return 0;
  const ingredientMap = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
  return recipe.lines.reduce((sum, line) => sum + line.quantity * (ingredientMap.get(line.ingredientId)?.unitCost ?? 0), 0);
};

export const getSalesForDate = (sales: SaleEntry[], businessDate: string) => sales.filter((sale) => sale.businessDate === businessDate);

export const getSaleUnits = (sales: SaleEntry[]) => sales.reduce((sum, sale) => sum + sale.lines.reduce((lineSum, line) => lineSum + line.quantity, 0), 0);

export const getOrderCount = (sales: SaleEntry[]) => sales.reduce((sum, sale) => sum + (sale.orderCount ?? 0), 0);

export const getRevenue = (sales: SaleEntry[]) => sales.reduce((sum, sale) => sum + sumSaleRevenue(sale), 0);

export const getGrossProfit = (sales: SaleEntry[]) => sales.reduce((sum, sale) => sum + sumSaleRevenue(sale) - sumSaleCogs(sale), 0);

export const getStockStatus = (ingredient: Ingredient) => {
  if (ingredient.quantityOnHand <= 0 || ingredient.quantityOnHand < ingredient.reorderPoint * 0.55) return "critical" as const;
  if (ingredient.quantityOnHand < ingredient.reorderPoint) return "warning" as const;
  return "normal" as const;
};

export const getDaysUntil = (date?: string, today = new Date()) => {
  if (!date) return undefined;
  const target = new Date(`${date}T12:00:00+07:00`).getTime();
  const current = new Date(`${today.toISOString().slice(0, 10)}T12:00:00+07:00`).getTime();
  return Math.ceil((target - current) / 86_400_000);
};

export const aggregateSalesByDay = (sales: SaleEntry[], dates: string[]) => {
  const values = new Map(dates.map((date) => [date, 0]));
  sales.forEach((sale) => {
    if (values.has(sale.businessDate)) values.set(sale.businessDate, (values.get(sale.businessDate) ?? 0) + getSaleUnits([sale]));
  });
  return dates.map((date) => ({ date, units: values.get(date) ?? 0 }));
};

export const getMenuSales = (sales: SaleEntry[], menuItems: MenuItem[]) => {
  const counts = new Map(menuItems.map((menu) => [menu.id, 0]));
  sales.forEach((sale) => sale.lines.forEach((line) => counts.set(line.menuItemId, (counts.get(line.menuItemId) ?? 0) + line.quantity)));
  return menuItems.map((menu) => ({ ...menu, units: counts.get(menu.id) ?? 0 })).sort((a, b) => b.units - a.units);
};

export const getForecast = (sales: SaleEntry[], days = 7) => {
  const dates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date("2026-08-16T12:00:00+07:00");
    date.setDate(date.getDate() + index);
    return date.toISOString().slice(0, 10);
  });
  const actuals = aggregateSalesByDay(sales, dates);
  const observed = actuals.filter((point) => point.units > 0).map((point) => point.units);
  const average = observed.length ? observed.reduce((sum, units) => sum + units, 0) / observed.length : 0;
  const confidence = observed.length >= 28 ? "high" : observed.length >= 7 ? "medium" : "low";
  const spread = confidence === "high" ? 0.12 : confidence === "medium" ? 0.2 : 0.32;
  return Array.from({ length: days }, (_, index) => {
    const day = new Date("2026-08-23T12:00:00+07:00");
    day.setDate(day.getDate() + index);
    const predictedUnits = Math.round(average * (index % 7 === 5 || index % 7 === 6 ? 1.08 : 0.96));
    return {
      date: day.toISOString().slice(0, 10),
      predictedUnits,
      low: Math.max(0, Math.round(predictedUnits * (1 - spread))),
      high: Math.round(predictedUnits * (1 + spread)),
      confidence,
    };
  });
};

export const getDashboardMetrics = (state: LanluState, today: string) => {
  const todaySales = getSalesForDate(state.sales, today);
  const activeIngredients = state.ingredients.filter((ingredient) => getStockStatus(ingredient) !== "normal");
  return {
    revenue: getRevenue(todaySales),
    units: getSaleUnits(todaySales),
    orders: getOrderCount(todaySales),
    grossProfit: getGrossProfit(todaySales),
    stockAlerts: activeIngredients.length,
  };
};

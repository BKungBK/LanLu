import { NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AssistantTurn, CsvMappingSuggestion } from "@/lib/types";
import { parseSimpleIngredientCommand } from "@/lib/assistant-parser";

export const runtime = "nodejs";

const chatMessageSchema = z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(2_000) });
const requestSchema = z.object({
  message: z.string().trim().max(2_000).default(""),
  conversation: z.array(chatMessageSchema).max(12).default([]),
  csvPreview: z.object({ headers: z.array(z.string().max(120)).max(40), samples: z.array(z.record(z.string(), z.unknown())).max(5) }).optional(),
}).refine((value) => value.message.length > 0 || value.csvPreview !== undefined, "message_or_csv_required");

const questionSchema = z.object({ id: z.string().max(80), label: z.string().max(240), inputType: z.enum(["text", "number", "select"]), options: z.array(z.string().max(120)).max(20).optional() });
const calculationSchema = z.object({ label: z.string().max(160), value: z.number().finite(), unit: z.string().max(40) });
const draftSchema = z.object({ kind: z.enum(["ingredient", "menu", "recipe"]), rows: z.array(z.record(z.string(), z.unknown())).max(50), warnings: z.array(z.string().max(240)).max(20).default([]) });
const turnSchema = z.object({
  status: z.enum(["question", "answer", "draft"]),
  message: z.string().max(1_000),
  questions: z.array(questionSchema).max(8).default([]),
  calculations: z.array(calculationSchema).max(12).optional(),
  csvMapping: z.object({ detectedKind: z.enum(["ingredient", "menu", "recipe"]), confidence: z.number().min(0).max(1), mapping: z.record(z.string(), z.string()) }).optional(),
  drafts: z.array(draftSchema).max(12).default([]),
  warnings: z.array(z.string().max(240)).max(20).default([]),
});

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    status: { type: Type.STRING, enum: ["question", "answer", "draft"] },
    message: { type: Type.STRING },
    questions: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, label: { type: Type.STRING }, inputType: { type: Type.STRING, enum: ["text", "number", "select"] }, options: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ["id", "label", "inputType"] } },
    calculations: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { label: { type: Type.STRING }, value: { type: Type.NUMBER }, unit: { type: Type.STRING } }, required: ["label", "value", "unit"] } },
    csvMapping: { type: Type.OBJECT, properties: { detectedKind: { type: Type.STRING, enum: ["ingredient", "menu", "recipe"] }, confidence: { type: Type.NUMBER }, mapping: { type: Type.OBJECT, properties: {} } }, required: ["detectedKind", "confidence", "mapping"] },
    drafts: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { kind: { type: Type.STRING, enum: ["ingredient", "menu", "recipe"] }, rows: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, unit: { type: Type.STRING }, unitCost: { type: Type.NUMBER }, quantityOnHand: { type: Type.NUMBER }, expiresOn: { type: Type.STRING }, packageUnit: { type: Type.STRING }, packageCount: { type: Type.NUMBER }, contentQuantity: { type: Type.NUMBER }, contentUnit: { type: Type.STRING }, purchasePrice: { type: Type.NUMBER }, conversionFactor: { type: Type.NUMBER }, menuName: { type: Type.STRING }, ingredientName: { type: Type.STRING }, quantity: { type: Type.NUMBER }, category: { type: Type.STRING }, price: { type: Type.NUMBER }, active: { type: Type.BOOLEAN } } } }, warnings: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ["kind", "rows"] } },
    warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["status", "message"],
} as const;

type CatalogContext = { ingredients: Array<{ name: string; unit: string; unitCost: number; hasPurchase: boolean }>; menus: string[]; units: string[]; categories: string[] };

async function loadCatalogContext(supabase: Awaited<ReturnType<typeof createClient>>, shopId: string): Promise<CatalogContext> {
  const [ingredientsResult, menusResult, categoriesResult] = await Promise.all([
    supabase.from("ingredients").select("name, unit, unit_cost, purchase_package_unit, purchase_content_unit").eq("shop_id", shopId).eq("active", true).order("created_at").limit(100),
    supabase.from("menu_items").select("name, category_id").eq("shop_id", shopId).is("archived_at", null).order("created_at").limit(100),
    supabase.from("menu_categories").select("name").eq("shop_id", shopId).order("name").limit(40),
  ]);
  const ingredients = (ingredientsResult.data ?? []).map((item: any) => ({ name: String(item.name), unit: String(item.unit), unitCost: Number(item.unit_cost ?? 0), hasPurchase: Boolean(item.purchase_package_unit || item.purchase_content_unit) }));
  const menus = (menusResult.data ?? []).map((item: any) => String(item.name));
  const categories = (categoriesResult.data ?? []).map((item: any) => String(item.name));
  const units = Array.from(new Set(ingredients.map((item) => item.unit).concat(["g", "kg", "ml", "L", "ชิ้น"])));
  return { ingredients, menus, units, categories };
}

function buildPrompt(message: string, conversation: z.infer<typeof chatMessageSchema>[], context: CatalogContext, csvPreview?: { headers: string[]; samples: Array<Record<string, unknown>> }) {
  const history = conversation.slice(-10).map((item) => `${item.role === "user" ? "User" : "Assistant"}: ${item.text}`).join("\n");
  const catalog = context.ingredients.map((item) => `${item.name} [${item.unit}, ${item.unitCost} บาท/${item.unit}${item.hasPurchase ? ", มีแพ็กซื้อ" : ", ยังไม่มีแพ็กซื้อ"}]`).join(", ");
  const csvInstruction = csvPreview ? `CSV preview only. Detect the catalog kind and map raw headers to canonical fields. Do not parse or import the full file yet. Headers: ${csvPreview.headers.join(", ")}. Samples: ${JSON.stringify(csvPreview.samples)}` : "";
  return [
    "You are LanLu's server-side catalog assistant. Never save data, call tools, output SQL, or claim that anything was saved.",
    "Classify the user's intent yourself. If the user asks a question about costs, ingredients, menus, recipes, or stock without asking to change data, return status=answer.",
    "For a change request, return status=draft with one combined drafts array. If one critical field is missing or ambiguous, return status=question and ask exactly one question with the best inputType and quick reply options.",
    "For ingredients, only use name, stock unit, current quantity, unit cost, purchase package details, and expiry. Do not output supplier or reorder point fields. Never invent missing numbers: omit them or ask one question instead of using zero.",
    "The stock unit is the unit used whenever the shop receives, sells, wastes, or adjusts stock, such as ml, g, L, kg, or ขวด. Explain this in Thai when the user asks what it means.",
    "Never leave ingredientName blank. If an ingredient is not an exact match in Known ingredients, ask whether to create a new ingredient or select an existing one before returning a confirmable recipe draft.",
    "Treat a menu and its recipe as one user-facing menu setup. Keep recipe rows attached to the menu concept in the message and warnings, even if the internal draft contains separate menu and recipe records.",
    "Do not invent density or unsafe unit conversions. A purchase package may calculate only from standard g/kg, ml/L, piece units or an explicit conversion factor supplied by the user. Keep selling price confirmation in a question; never choose a price automatically.",
    `Known ingredients: ${catalog || "none"}`,
    `Known menus: ${context.menus.join(", ") || "none"}`,
    `Known units: ${context.units.join(", ") || "none"}`,
    `Known categories: ${context.categories.join(", ") || "none"}`,
    history ? `Conversation so far:\n${history}` : "No previous conversation.",
    csvInstruction,
    `User message: ${message || "Analyze the CSV preview."}`,
    "Use Thai when the user writes Thai. Keep the answer concise and put uncertainty in warnings.",
  ].filter(Boolean).join("\n");
}

function normalizeTurn(raw: unknown): AssistantTurn {
  const parsed = turnSchema.parse(raw);
  if (parsed.status === "question") return { status: "question", message: parsed.message, questions: parsed.questions.slice(0, 1) };
  if (parsed.status === "answer") return { status: "answer", message: parsed.message, calculations: parsed.calculations, csvMapping: parsed.csvMapping as CsvMappingSuggestion | undefined };
  return { status: "draft", message: parsed.message, calculations: parsed.calculations, drafts: parsed.drafts.map((draft) => ({ ...draft, source: "gemini" as const })), warnings: parsed.warnings.concat(parsed.drafts.flatMap((draft) => draft.warnings)) };
}

async function generateTurn(ai: GoogleGenAI, model: string, prompt: string) {
  const response = await ai.models.generateContent({ model, contents: prompt, config: { responseMimeType: "application/json", responseSchema } });
  return normalizeTurn(JSON.parse(response.text ?? "{}"));
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้องเข้าสู่ระบบก่อนใช้ผู้ช่วย" }, { status: 401 });
  const body = requestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "ข้อมูลคำสั่งไม่ถูกต้องหรือยาวเกินกำหนด" }, { status: 400 });
  const fastPath = parseSimpleIngredientCommand(body.data.message);
  if (fastPath) return NextResponse.json({ turn: fastPath, ...fastPath });
  if (!process.env.GEMINI_API_KEY) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Gemini ฝั่ง server" }, { status: 503 });
  const { data: member, error: memberError } = await supabase.from("shop_members").select("shop_id").eq("user_id", user.id).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (memberError || !member?.shop_id) return NextResponse.json({ error: "ไม่พบร้านของบัญชีนี้" }, { status: 403 });
  const context = await loadCatalogContext(supabase, member.shop_id as string);
  const prompt = buildPrompt(body.data.message, body.data.conversation, context, body.data.csvPreview);
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  try {
    const turn = await generateTurn(ai, "gemini-3.6-flash", prompt);
    return NextResponse.json({ turn, ...turn });
  } catch {
    try {
      const turn = await generateTurn(ai, "gemini-3.5-flash-lite", prompt);
      return NextResponse.json({ turn, ...turn });
    } catch {
      return NextResponse.json({ error: "ผู้ช่วยตอบไม่สำเร็จ ลองลดคำสั่งหรือ retry อีกครั้ง" }, { status: 502 });
    }
  }
}

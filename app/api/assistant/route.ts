import { NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { CatalogDraftKind } from "@/lib/types";

export const runtime = "nodejs";

const requestSchema = z.object({
  prompt: z.string().trim().min(1).max(2_000),
  kind: z.enum(["ingredient", "menu", "recipe"]),
  context: z.object({ ingredients: z.array(z.string().max(100)).max(100).default([]), menus: z.array(z.string().max(100)).max(100).default([]), units: z.array(z.string().max(40)).max(40).default([]), categories: z.array(z.string().max(60)).max(40).default([]) }).default({ ingredients: [], menus: [], units: [], categories: [] }),
});

const draftSchema = z.object({
  kind: z.enum(["ingredient", "menu", "recipe"]),
  source: z.literal("gemini"),
  rows: z.array(z.record(z.string(), z.unknown())).max(50),
  warnings: z.array(z.string().max(240)).max(20),
});

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    kind: { type: Type.STRING, enum: ["ingredient", "menu", "recipe"] },
    source: { type: Type.STRING, enum: ["gemini"] },
    rows: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, unit: { type: Type.STRING }, supplier: { type: Type.STRING }, unitCost: { type: Type.NUMBER }, reorderPoint: { type: Type.NUMBER }, quantityOnHand: { type: Type.NUMBER }, menuName: { type: Type.STRING }, ingredientName: { type: Type.STRING }, quantity: { type: Type.NUMBER }, category: { type: Type.STRING }, price: { type: Type.NUMBER }, active: { type: Type.BOOLEAN } } } },
    warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["kind", "source", "rows", "warnings"],
} as const;

function buildPrompt(kind: CatalogDraftKind, prompt: string, context: z.infer<typeof requestSchema>["context"]) {
  const fields = kind === "ingredient" ? "name, unit, supplier, unitCost, reorderPoint, quantityOnHand, expiresOn" : kind === "menu" ? "name, category, price, active" : "menuName, ingredientName, quantity, unit";
  return [
    "You are LanLu's catalog assistant. Produce a structured draft only. Never claim to have saved anything and never output SQL or executable code.",
    `The requested draft kind is ${kind}. Every row must use these fields where applicable: ${fields}. Keep rows <= 50. Use Thai values when the user writes Thai. Put uncertainty or missing information in warnings.`,
    `Known ingredients: ${context.ingredients.join(", ") || "none"}`,
    `Known menus: ${context.menus.join(", ") || "none"}`,
    `Known units: ${context.units.join(", ") || "none"}`,
    `Known categories: ${context.categories.join(", ") || "none"}`,
    `User request: ${prompt}`,
  ].join("\n");
}

async function generateDraft(ai: GoogleGenAI, model: string, prompt: string) {
  const response = await ai.models.generateContent({ model, contents: prompt, config: { responseMimeType: "application/json", responseSchema } });
  const parsed = JSON.parse(response.text ?? "{}");
  return draftSchema.parse({ ...parsed, source: "gemini" });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้องเข้าสู่ระบบก่อนใช้ผู้ช่วย" }, { status: 401 });

  const { data: member, error: memberError } = await supabase.from("shop_members").select("shop_id, shops(name)").eq("user_id", user.id).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (memberError || !member?.shop_id) return NextResponse.json({ error: "ไม่พบร้านของบัญชีนี้" }, { status: 403 });
  const shopRelation = member.shops as unknown as { name?: string } | Array<{ name?: string }> | null;
  const shopName = Array.isArray(shopRelation) ? shopRelation[0]?.name : shopRelation?.name;

  const body = requestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "ข้อมูลคำสั่งไม่ถูกต้องหรือยาวเกินกำหนด" }, { status: 400 });
  if (!process.env.GEMINI_API_KEY) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Gemini ฝั่ง server" }, { status: 503 });

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const prompt = buildPrompt(body.data.kind, body.data.prompt, body.data.context);
  try {
    const draft = await generateDraft(ai, "gemini-3.6-flash", prompt);
    return NextResponse.json({ draft, shop: { id: member.shop_id, name: shopName } });
  } catch {
    try {
      const draft = await generateDraft(ai, "gemini-3.5-flash-lite", prompt);
      return NextResponse.json({ draft, shop: { id: member.shop_id, name: shopName } });
    } catch {
      return NextResponse.json({ error: "ผู้ช่วยสร้าง draft ไม่สำเร็จ ลองลดคำสั่งหรือ retry อีกครั้ง" }, { status: 502 });
    }
  }
}

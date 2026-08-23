"use client";

import { useMemo, useRef, useState } from "react";
import { IconAlertTriangle, IconCheck, IconDownload, IconFileUpload, IconMessageChatbot, IconRotate2, IconSend, IconSparkles, IconUpload } from "@tabler/icons-react";
import { useLanlu } from "@/lib/store";
import type { AssistantTurn, CatalogDraftBundle, CatalogDraftKind } from "@/lib/types";
import { applyCsvMapping, detectCatalogCsvMapping, getUnitConversionFactor, normalizeCatalogRows, rowsToCsv, suggestMarginPrices, validateCatalogRows } from "@/lib/catalog";
import { CreatableSelect } from "@/components/form-controls";
import { PageHeader, SectionCard } from "@/components/ui";

type ChatMessage = { role: "assistant" | "user"; text: string; turn?: AssistantTurn };
const kindLabels: Record<CatalogDraftKind, string> = { ingredient: "วัตถุดิบ", menu: "เมนู", recipe: "สูตร" };
const prompts = ["เพิ่มสูตรลาเต้ นม 150 ml ผงกาแฟ 18 g", "นม 1 ขวด 500 ml ราคา 65 บาท คิดต้นทุนต่อ ml ให้หน่อย", "เพิ่มเมนูลาเต้เย็น พร้อมวัตถุดิบและสูตรให้ครบ"];
const templates: Record<CatalogDraftKind, Array<Record<string, unknown>>> = {
  ingredient: [{ name: "นมสด", unit: "ลิตร", unitCost: 50, quantityOnHand: 5, expiresOn: "", packageUnit: "ขวด", packageCount: 1, contentQuantity: 1000, contentUnit: "ml", purchasePrice: 50 }],
  menu: [{ name: "ลาเต้เย็น", category: "กาแฟ", price: 75, active: true }],
  recipe: [{ menuName: "ลาเต้เย็น", ingredientName: "นมสด", quantity: 0.18, unit: "ลิตร" }],
};

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && text[index + 1] === '"' && quoted) { cell += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === "," && !quoted) { row.push(cell); cell = ""; continue; }
    if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && text[index + 1] === "\n") index += 1; row.push(cell); if (row.some((value) => value.trim())) rows.push(row); row = []; cell = ""; continue; }
    cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [headers = [], ...values] = rows;
  return values.map((line) => Object.fromEntries(headers.map((header, index) => [header.trim(), line[index] ?? ""])));
}

function stripMeta(rows: Array<Record<string, unknown>>) {
  return rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith("_"))));
}

const initialMessages: ChatMessage[] = [{ role: "assistant", text: "พิมพ์คำสั่งได้เลย ผมจะแยกวัตถุดิบ เมนู สูตร หรือคำถามต้นทุนให้เอง และจะถามข้อมูลที่ขาดทีละข้อ" }];

export function AssistantPage() {
  const { state, importCatalog, importCatalogBundle } = useLanlu();
  const [mode, setMode] = useState<"gemini" | "csv">("gemini");
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [questionDrafts, setQuestionDrafts] = useState<Record<string, string>>({});
  const [bundle, setBundle] = useState<CatalogDraftBundle | null>(null);
  const [csvKind, setCsvKind] = useState<CatalogDraftKind>("ingredient");
  const [csvMapping, setCsvMapping] = useState<Record<string, string>>({});
  const [csvConfidence, setCsvConfidence] = useState(0);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvText, setCsvText] = useState("");
  const [csvRows, setCsvRows] = useState<Array<Record<string, unknown>>>([]);
  const [conflictMode, setConflictMode] = useState<"create" | "update" | "skip">("create");
  const [csvError, setCsvError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [lastFailedPrompt, setLastFailedPrompt] = useState("");
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const context = useMemo(() => ({ ingredients: state.ingredients.filter((ingredient) => ingredient.active !== false).map((ingredient) => ingredient.name), menus: state.menuItems.filter((menu) => !menu.archivedAt).map((menu) => menu.name), units: Array.from(new Set(state.ingredients.filter((ingredient) => ingredient.active !== false).map((ingredient) => ingredient.unit).concat(["g", "kg", "ml", "L", "ชิ้น"]))), categories: Array.from(new Set(state.menuItems.filter((menu) => !menu.archivedAt).map((menu) => menu.category).concat(["กาแฟ", "ชา", "อื่น ๆ"]))) }), [state.ingredients, state.menuItems]);
  const csvValidated = useMemo(() => validateCatalogRows(csvKind, normalizeCatalogRows(csvKind, csvRows), context, conflictMode), [context, conflictMode, csvKind, csvRows]);
  const csvHasErrors = csvValidated.some((row) => (row._errors as string[]).length > 0);
  const pricingSuggestions = useMemo(() => {
    if (!bundle) return [];
    const recipeDraft = bundle.drafts.find((draft) => draft.kind === "recipe");
    if (!recipeDraft) return [];
    const costs = new Map<string, number>();
    for (const row of recipeDraft.rows) {
      const menuName = String(row.menuName ?? "").trim();
      const ingredient = state.ingredients.find((item) => item.active !== false && item.name.toLocaleLowerCase() === String(row.ingredientName ?? "").trim().toLocaleLowerCase());
      const factor = ingredient ? getUnitConversionFactor(String(row.unit ?? ingredient.unit), ingredient.unit) : null;
      if (!menuName || !ingredient || factor === null) continue;
      costs.set(menuName, (costs.get(menuName) ?? 0) + Number(row.quantity ?? 0) * factor * ingredient.unitCost);
    }
    return Array.from(costs, ([menuName, cost]) => ({ menuName, cost, prices: suggestMarginPrices(cost) })).filter((item) => item.cost > 0 && !bundle.drafts.some((draft) => draft.kind === "menu" && draft.rows.some((row) => String(row.name ?? "").trim() === item.menuName && Number(row.price ?? 0) > 0)));
  }, [bundle, state.ingredients]);

  const sendMessage = async (value = prompt) => {
    const currentPrompt = value.trim();
    if (!currentPrompt || pendingRef.current) return;
    const nextConversation = [...messages, { role: "user" as const, text: currentPrompt }].slice(-12);
    pendingRef.current = true;
    setMessages((current) => [...current, { role: "user", text: currentPrompt }]); setPending(true); setFeedback("");
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: currentPrompt, conversation: nextConversation }), signal: controller.signal });
      const payload = await response.json() as { turn?: AssistantTurn; error?: string };
      if (!response.ok || !payload.turn) { setPrompt(currentPrompt); setLastFailedPrompt(currentPrompt); setFeedback(payload.error ?? "ผู้ช่วยตอบไม่สำเร็จ"); return; }
      const turn = payload.turn;
      setPrompt("");
      setLastFailedPrompt("");
      setMessages((current) => [...current, { role: "assistant", text: turn.message, turn }]);
      if (turn.status === "draft") setBundle({ source: "gemini", drafts: turn.drafts, warnings: turn.warnings, calculations: turn.calculations });
    } catch (error) {
      setPrompt(currentPrompt);
      setLastFailedPrompt(currentPrompt);
      setFeedback(error instanceof Error && error.name === "AbortError" ? "ผู้ช่วยใช้เวลานานเกินไป ลองส่งใหม่อีกครั้ง" : "เชื่อมต่อผู้ช่วยไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      window.clearTimeout(timeoutId);
      pendingRef.current = false;
      setPending(false);
    }
  };

  const confirmBundle = async () => {
    if (!bundle || pending || bundle.drafts.length === 0) return;
    setPending(true); setFeedback("");
    try {
      const result = await importCatalogBundle({ bundle, idempotencyKey: `assistant-bundle-${crypto.randomUUID()}`, conflictMode: "create" });
      setFeedback(result.message);
      if (result.ok) { setBundle(null); setMessages(initialMessages); setQuestionDrafts({}); setLastFailedPrompt(""); }
    } catch {
      setFeedback("บันทึก draft ไม่สำเร็จ ระบบพร้อมให้ลองส่งคำสั่งใหม่");
    } finally {
      setPending(false);
    }
  };

  const handleCsv = async (file?: File) => {
    if (!file) return;
    setCsvError(""); setFeedback(""); setCsvRows([]); setCsvText("");
    try {
      const text = await file.text();
      const allRows = parseCsv(text);
      const headers = Object.keys(allRows[0] ?? {});
      if (!headers.length) throw new Error("empty");
      const fallback = detectCatalogCsvMapping(headers, allRows.slice(0, 5));
      setCsvText(text); setCsvHeaders(headers); setCsvKind(fallback.detectedKind); setCsvMapping(fallback.mapping); setCsvConfidence(fallback.confidence);
      const response = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csvPreview: { headers, samples: allRows.slice(0, 5) } }) });
      const payload = await response.json() as { turn?: AssistantTurn; error?: string };
      if (payload.turn?.status === "answer" && payload.turn.csvMapping) { setCsvKind(payload.turn.csvMapping.detectedKind); setCsvMapping(payload.turn.csvMapping.mapping); setCsvConfidence(payload.turn.csvMapping.confidence); }
      if (!response.ok && payload.error) setFeedback(payload.error);
    } catch { setCsvError("อ่าน CSV ไม่สำเร็จ ตรวจ encoding และหัวตาราง"); }
  };

  const applyMapping = () => {
    if (!csvText) return;
    setCsvRows(applyCsvMapping(parseCsv(csvText), csvMapping));
  };
  const updateRows = (index: number, key: string, value: unknown) => setCsvRows((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  const updateBundleDraft = (draftIndex: number, rowIndex: number, key: string, value: unknown) => setBundle((current) => current ? { ...current, drafts: current.drafts.map((draft, index) => index !== draftIndex ? draft : { ...draft, rows: draft.rows.map((row, index) => index === rowIndex ? { ...row, [key]: value } : row) }) } : current);
  const applySuggestedPrice = (menuName: string, price: number) => setBundle((current) => current ? { ...current, drafts: current.drafts.some((draft) => draft.kind === "menu") ? current.drafts.map((draft) => draft.kind === "menu" ? { ...draft, rows: draft.rows.map((row) => String(row.name ?? "").trim() === menuName ? { ...row, price } : row) } : draft) : [...current.drafts, { kind: "menu", source: "gemini", rows: [{ name: menuName, category: "อื่น ๆ", price, active: true }], warnings: ["ราคาขายนี้มาจากตัวเลือก margin ต้องตรวจสอบก่อนยืนยัน"] }] } : current);
  const downloadTemplate = () => { const blob = new Blob([rowsToCsv(templates[csvKind])], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `lanlu-${csvKind}-template.csv`; anchor.click(); URL.revokeObjectURL(url); };
  const confirmCsv = async () => {
    if (csvHasErrors || !csvRows.length || pending) return;
    setPending(true); setFeedback("");
    try {
      const result = await importCatalog({ kind: csvKind, rows: stripMeta(csvValidated), idempotencyKey: `csv-${crypto.randomUUID()}`, conflictMode });
      setFeedback(result.message);
      if (result.ok) { setCsvRows([]); setCsvText(""); setCsvHeaders([]); }
    } catch {
      setFeedback("นำเข้า CSV ไม่สำเร็จ ระบบพร้อมให้ลองใหม่");
    } finally {
      setPending(false);
    }
  };

  return <>
    <PageHeader eyebrow="LanLu workspace" title="ผู้ช่วยและนำเข้าข้อมูล" description="คุยด้วยภาษาธรรมชาติ ให้ระบบเตรียม draft และตรวจทุกอย่างก่อนบันทึก" action={<div className="assistant-tabs"><button type="button" className={`assistant-tab ${mode === "gemini" ? "active" : ""}`} onClick={() => setMode("gemini")}><IconSparkles size={14} /> ผู้ช่วย Gemini</button><button type="button" className={`assistant-tab ${mode === "csv" ? "active" : ""}`} onClick={() => setMode("csv")}><IconFileUpload size={14} /> นำเข้า CSV</button></div>} />
    {mode === "gemini" ? <div className="assistant-layout">
      <SectionCard className="assistant-chat" title="คุยกับผู้ช่วย" description="ถามต้นทุนหรือสั่งเพิ่มข้อมูลได้เลย · Gemini ไม่มีสิทธิ์บันทึกฐานข้อมูล">
        <div className="assistant-messages">{messages.map((message, index) => <div className={`assistant-message ${message.role === "user" ? "user" : ""}`} key={`${message.role}-${index}`}><strong>{message.role === "user" ? "คุณ" : "Gemini"}</strong><div>{message.text}</div><QuestionBlock turn={message.turn} values={questionDrafts} onChange={(id, value) => setQuestionDrafts((current) => ({ ...current, [id]: value }))} onAnswer={(value) => void sendMessage(value)} />{message.turn?.status === "answer" && message.turn.calculations?.length ? <div className="assistant-calculations">{message.turn.calculations.map((calculation) => <span key={`${calculation.label}-${calculation.value}`}><strong>{calculation.value}</strong> {calculation.unit}<small>{calculation.label}</small></span>)}</div> : null}</div>)}</div>
        <div className="assistant-prompt-row">{prompts.map((item) => <button type="button" className="assistant-prompt" key={item} onClick={() => setPrompt(item)}>{item}</button>)}</div>
        <div className="assistant-composer"><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} placeholder="เช่น เพิ่มสูตรลาเต้ นม 10 มิล ผงกาแฟ 2 5กรัม" maxLength={2000} /><div className="assistant-composer-footer"><span className="assistant-note">จำบริบทเฉพาะ session นี้ · ยังไม่บันทึกจนกดยืนยัน</span><button type="button" className="button button-primary" onClick={() => void sendMessage()} disabled={pending || !prompt.trim()}><IconSend size={15} />{pending ? "กำลังคิด…" : "ส่งข้อความ"}</button></div>{pending && <div className="assistant-status" role="status" aria-live="polite"><IconSparkles size={14} />Gemini กำลังวิเคราะห์ข้อมูล…</div>}{feedback && <div className="capture-feedback assistant-feedback" role="alert"><IconAlertTriangle size={14} /><span>{feedback}</span>{lastFailedPrompt && <button type="button" className="button button-quiet button-small assistant-retry" onClick={() => void sendMessage(lastFailedPrompt)} disabled={pending}><IconRotate2 size={14} />ลองส่งอีกครั้ง</button>}</div>}</div>
      </SectionCard>
      <SectionCard className="draft-panel" title="Draft ที่แก้ไขได้" description="คำสั่งเดียวรวมวัตถุดิบ เมนู และสูตรได้ · ยืนยันครั้งเดียวแบบ transaction">
        {!bundle ? <div className="empty-state"><div className="empty-mark"><IconMessageChatbot size={23} /></div><h3>ยังไม่มี draft</h3><p>ถามข้อมูลต้นทุน หรือสั่งให้ผู้ช่วยเตรียมรายการ catalog</p></div> : <><div className="draft-header"><div><h2>ชุดข้อมูลจาก Gemini</h2><p>{bundle.drafts.length} ชนิด · {bundle.drafts.reduce((sum, draft) => sum + draft.rows.length, 0)} แถว · รอตรวจ</p></div><span className="draft-badge">ยังไม่บันทึก</span></div>{bundle.calculations?.length ? <div className="assistant-calculations draft-calculations">{bundle.calculations.map((calculation) => <span key={`${calculation.label}-${calculation.value}`}><strong>{calculation.value}</strong> {calculation.unit}<small>{calculation.label}</small></span>)}</div> : null}{bundle.drafts.map((draft, draftIndex) => <div className="draft-group" key={`${draft.kind}-${draftIndex}`}><div className="draft-group-title"><strong>{kindLabels[draft.kind]}</strong><span>{draft.rows.length} แถว</span></div><div className="draft-rows">{draft.rows.map((row, rowIndex) => <DraftRow key={rowIndex} kind={draft.kind} row={row} idPrefix={`${draftIndex}-${rowIndex}`} onChange={(key, value) => updateBundleDraft(draftIndex, rowIndex, key, value)} />)}</div></div>)}{pricingSuggestions.length > 0 && <div className="pricing-suggestions"><strong>ต้นทุนต่อเสิร์ฟคำนวณแล้ว แต่ยังไม่มีราคาขาย</strong>{pricingSuggestions.map((suggestion) => <div className="pricing-row" key={suggestion.menuName}><span>{suggestion.menuName} · ต้นทุน {suggestion.cost.toFixed(2)} บาท</span><div>{suggestion.prices.map((item) => <button type="button" className="assistant-prompt" key={item.margin} onClick={() => applySuggestedPrice(suggestion.menuName, item.price)}>กำไร {Math.round(item.margin * 100)}% · {item.price} บาท</button>)}</div></div>)}</div>}{bundle.warnings.length > 0 && <div className="draft-warning"><IconAlertTriangle size={16} />{bundle.warnings.join(" · ")}</div>}<div className="form-actions"><button type="button" className="button button-primary" onClick={() => void confirmBundle()} disabled={pending}><IconCheck size={15} />{pending ? "กำลังบันทึก…" : "ตรวจแล้ว ยืนยันชุดข้อมูล"}</button></div></>}
      </SectionCard>
    </div> : <SectionCard title="นำเข้าข้อมูลจาก CSV" description="อ่าน header และตัวอย่างแถวเพื่อ auto-detect ก่อนค่อย parse ข้อมูลเต็ม">
      <div className="csv-toolbar"><div><strong>{csvHeaders.length ? `ตรวจพบ ${kindLabels[csvKind]}` : "ยังไม่ได้เลือกไฟล์"}</strong>{csvHeaders.length > 0 && <span className="csv-confidence">ความมั่นใจ {Math.round(csvConfidence * 100)}%</span>}</div><div className="csv-toolbar-actions"><CreatableSelect id="csv-conflict" value={{ create: "ซ้ำให้แจ้ง", update: "ซ้ำให้อัปเดต", skip: "ซ้ำให้ข้าม" }[conflictMode]} options={["ซ้ำให้แจ้ง", "ซ้ำให้อัปเดต", "ซ้ำให้ข้าม"]} onChange={(value) => { const next = Object.entries({ create: "ซ้ำให้แจ้ง", update: "ซ้ำให้อัปเดต", skip: "ซ้ำให้ข้าม" }).find(([, label]) => label === value)?.[0] as "create" | "update" | "skip" | undefined; if (next) setConflictMode(next); }} /><button type="button" className="button button-quiet button-small" onClick={downloadTemplate}><IconDownload size={14} />ดาวน์โหลดตัวอย่าง</button></div></div>
      <div className="csv-dropzone" onClick={() => fileRef.current?.click()} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") fileRef.current?.click(); }}><IconUpload size={22} /><strong>{csvHeaders.length ? "เปลี่ยนไฟล์ CSV" : "เลือกไฟล์ CSV"}</strong><span>ระบบจะอ่านเฉพาะ header/ตัวอย่างก่อน ไม่ส่งข้อมูลเต็มให้ Gemini</span><input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(event) => void handleCsv(event.target.files?.[0])} /></div>
      {csvError && <div className="auth-error" role="alert">{csvError}</div>}
      {csvHeaders.length > 0 && <div className="csv-mapping"><div className="data-note"><span><strong>แก้ mapping ก่อนอ่านข้อมูลเต็ม</strong></span><span>{csvKind === "recipe" ? "เมนู + วัตถุดิบ + ปริมาณ" : kindLabels[csvKind]}</span></div><div className="csv-mapping-grid"><div className="form-field"><label htmlFor="csv-kind">ชนิดข้อมูล</label><select id="csv-kind" className="select-input" value={csvKind} onChange={(event) => setCsvKind(event.target.value as CatalogDraftKind)}><option value="ingredient">วัตถุดิบ</option><option value="menu">เมนู</option><option value="recipe">สูตร</option></select></div>{csvHeaders.map((header) => <div className="form-field" key={header}><label htmlFor={`mapping-${header}`}>{header}</label><select id={`mapping-${header}`} className="select-input" value={csvMapping[header] ?? ""} onChange={(event) => setCsvMapping((current) => ({ ...current, [header]: event.target.value }))}><option value="">ไม่ใช้คอลัมน์นี้</option>{["name", "unit", "unitCost", "quantityOnHand", "expiresOn", "packageUnit", "packageCount", "contentQuantity", "contentUnit", "purchasePrice", "conversionFactor", "menuName", "ingredientName", "quantity", "category", "price", "active"].map((field) => <option value={field} key={field}>{field}</option>)}</select></div>)}</div><button type="button" className="button button-soft" onClick={applyMapping}><IconCheck size={15} />ใช้ mapping และ preview ข้อมูลเต็ม</button></div>}
      {!!csvValidated.length && <><div className="data-note"><span>{csvValidated.length} แถว · {csvHasErrors ? "ยังมีรายการต้องแก้" : "ผ่าน validation เบื้องต้น"}</span><span>{csvHasErrors ? "แก้ cell ที่มีพื้นหลังแดง" : "พร้อมยืนยัน"}</span></div><div className="csv-table-wrap"><table className="csv-table"><thead><tr>{Object.keys(csvValidated[0]).filter((key) => !key.startsWith("_")).map((key) => <th key={key}>{key}</th>)}<th>สถานะ</th></tr></thead><tbody>{csvValidated.map((row, index) => <tr key={index}>{Object.entries(row).filter(([key]) => !key.startsWith("_")).map(([key, value]) => <td key={key} className={(row._errors as string[]).length ? "has-error" : ""}><input className="table-input" value={String(value ?? "")} onChange={(event) => updateRows(index, key, event.target.value)} /></td>)}<td>{(row._errors as string[]).length ? <span className="csv-error">{(row._errors as string[]).join(" · ")}</span> : <IconCheck size={15} color="var(--sage-dark)" />}</td></tr>)}</tbody></table></div><div className="csv-confirm"><button type="button" className="button button-primary" onClick={() => void confirmCsv()} disabled={pending || csvHasErrors}><IconCheck size={15} />ตรวจแล้ว นำเข้า {kindLabels[csvKind]}</button></div></>}
      {feedback && <div className="capture-feedback" role="status"><IconCheck size={14} />{feedback}</div>}
    </SectionCard>}
  </>;
}

function DraftRow({ kind, row, idPrefix, onChange }: { kind: CatalogDraftKind; row: Record<string, unknown>; idPrefix: string; onChange: (key: string, value: unknown) => void }) {
  const fields: Array<[string, string]> = kind === "ingredient" ? [["name", "ชื่อ"], ["unit", "หน่วยตัดสต๊อก"], ["unitCost", "ต้นทุนต่อหน่วย"], ["quantityOnHand", "มีอยู่ตอนนี้"], ["packageUnit", "ซื้อเป็น"], ["packageCount", "จำนวนแพ็ก"], ["contentQuantity", "1 แพ็กมี"], ["contentUnit", "หน่วยในแพ็ก"], ["purchasePrice", "ราคาที่จ่ายต่อแพ็ก"], ["conversionFactor", "อัตราแปลง (ถ้าจำเป็น)"]] : kind === "menu" ? [["name", "ชื่อเมนู"], ["category", "หมวด"], ["price", "ราคาขาย"], ["active", "เปิดขาย"]] : [["menuName", "ชื่อเมนู"], ["ingredientName", "ชื่อวัตถุดิบ"], ["quantity", "ปริมาณ"], ["unit", "หน่วย"]];
  return <div className="draft-row"><div className="draft-row-grid">{fields.map(([key, label]) => <div className="form-field" key={key}><label htmlFor={`draft-${idPrefix}-${key}`}>{label}</label>{key === "active" ? <input id={`draft-${idPrefix}-${key}`} type="checkbox" checked={row[key] !== false && row[key] !== "false"} onChange={(event) => onChange(key, event.target.checked)} /> : <input id={`draft-${idPrefix}-${key}`} className="text-input" value={String(row[key] ?? "")} onChange={(event) => onChange(key, ["price", "unitCost", "quantityOnHand", "quantity", "packageCount", "contentQuantity", "purchasePrice", "conversionFactor"].includes(key) ? Number(event.target.value) : event.target.value)} />}</div>)}</div></div>;
}

function QuestionBlock({ turn, values, onChange, onAnswer }: { turn?: AssistantTurn; values: Record<string, string>; onChange: (id: string, value: string) => void; onAnswer: (value: string) => void }) {
  if (!turn || turn.status !== "question" || !turn.questions[0]) return null;
  const question = turn.questions[0];
  const value = values[question.id] ?? "";
  return <div className="assistant-question"><strong>{question.label}</strong>{question.inputType === "select" ? <div className="assistant-quick-replies">{question.options?.map((option) => <button type="button" className="assistant-prompt" key={option} onClick={() => onAnswer(option)}>{option}</button>)}</div> : <div className="assistant-question-input"><input className="text-input" type={question.inputType} value={value} onChange={(event) => onChange(question.id, event.target.value)} placeholder={question.label} /><button type="button" className="button button-soft button-small" onClick={() => onAnswer(value)} disabled={!value.trim()}>ตอบ</button></div>}</div>;
}

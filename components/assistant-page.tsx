"use client";

import { useMemo, useRef, useState } from "react";
import { IconAlertTriangle, IconCheck, IconDownload, IconFileUpload, IconMessageChatbot, IconSend, IconSparkles, IconUpload } from "@tabler/icons-react";
import { useLanlu } from "@/lib/store";
import type { CatalogDraft, CatalogDraftKind } from "@/lib/types";
import { normalizeCatalogRows, rowsToCsv, validateCatalogRows } from "@/lib/catalog";
import { CreatableSelect } from "@/components/form-controls";
import { PageHeader, SectionCard } from "@/components/ui";

type ChatMessage = { role: "assistant" | "user"; text: string };

const kindLabels: Record<CatalogDraftKind, string> = { ingredient: "วัตถุดิบ", menu: "เมนู", recipe: "สูตร" };
const prompts = ["เพิ่มวัตถุดิบตามรายการนี้: นม 2 ลิตร, น้ำเชื่อม 1 ขวด", "สร้างสูตรลาเต้เย็น ใช้นม 0.18 ลิตร และกาแฟ 0.018 กก.", "จัดหมวดเมนูในรายการให้หน่อย"];
const templates: Record<CatalogDraftKind, Array<Record<string, unknown>>> = {
  ingredient: [{ name: "นมสด", unit: "ลิตร", supplier: "", unitCost: 50, reorderPoint: 2, quantityOnHand: 5, expiresOn: "" }],
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
  return values.map((line) => Object.fromEntries(headers.map((header, index) => [header, line[index] ?? ""])));
}

function stripMeta(rows: Array<Record<string, unknown>>) {
  return rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith("_"))));
}

export function AssistantPage() {
  const { state, importCatalog } = useLanlu();
  const [mode, setMode] = useState<"gemini" | "csv">("gemini");
  const [kind, setKind] = useState<CatalogDraftKind>("ingredient");
  const [conflictMode, setConflictMode] = useState<"create" | "update" | "skip">("create");
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "assistant", text: "สวัสดี ผมช่วยเตรียม draft วัตถุดิบ เมนู หรือสูตรให้ได้ ตรวจและแก้ไข draft ก่อนกดยืนยันทุกครั้ง" }]);
  const [draft, setDraft] = useState<CatalogDraft | null>(null);
  const [csvRows, setCsvRows] = useState<Array<Record<string, unknown>>>([]);
  const [csvError, setCsvError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [pending, setPending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const context = useMemo(() => ({ ingredients: state.ingredients.map((ingredient) => ingredient.name), menus: state.menuItems.map((menu) => menu.name), units: Array.from(new Set(state.ingredients.map((ingredient) => ingredient.unit).concat(["กก.", "ลิตร", "ชิ้น", "ถุง", "ขวด"]))), categories: Array.from(new Set(state.menuItems.map((menu) => menu.category).concat(["กาแฟ", "ชา", "อื่น ๆ"]))) }), [state.ingredients, state.menuItems]);
  const csvValidated = useMemo(() => validateCatalogRows(kind, normalizeCatalogRows(kind, csvRows), context, conflictMode), [context, conflictMode, csvRows, kind]);
  const csvHasErrors = csvValidated.some((row) => (row._errors as string[]).length > 0);

  const updateRows = (setter: React.Dispatch<React.SetStateAction<Array<Record<string, unknown>>>>, index: number, key: string, value: unknown) => setter((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));

  const createDraft = async () => {
    if (!prompt.trim() || pending) return;
    const currentPrompt = prompt.trim();
    setPrompt(""); setMessages((current) => [...current, { role: "user", text: currentPrompt }]); setPending(true); setFeedback("");
    try {
      const response = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: currentPrompt, kind, context }) });
      const payload = await response.json() as { draft?: CatalogDraft; error?: string };
      if (!response.ok || !payload.draft) { setFeedback(payload.error ?? "ผู้ช่วยตอบไม่สำเร็จ"); return; }
      setDraft(payload.draft); setMessages((current) => [...current, { role: "assistant", text: `เตรียม draft ${kindLabels[payload.draft!.kind]} ให้แล้ว ตรวจข้อมูลด้านขวาก่อนยืนยัน` }]);
    } catch { setFeedback("เชื่อมต่อผู้ช่วยไม่สำเร็จ ลองใหม่อีกครั้ง"); }
    finally { setPending(false); }
  };

  const confirmDraft = async () => {
    if (!draft || pending) return;
    setPending(true); setFeedback("");
    const result = await importCatalog({ kind: draft.kind, rows: stripMeta(draft.rows), idempotencyKey: `assistant-${crypto.randomUUID()}`, conflictMode: "create" });
    setPending(false); setFeedback(result.message); if (result.ok) setDraft(null);
  };

  const handleCsv = async (file?: File) => {
    if (!file) return;
    setCsvError(""); setFeedback("");
    try { setCsvRows(parseCsv(await file.text())); } catch { setCsvError("อ่าน CSV ไม่สำเร็จ ตรวจ encoding และหัวตาราง"); }
  };

  const downloadTemplate = () => { const blob = new Blob([rowsToCsv(templates[kind])], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `lanlu-${kind}-template.csv`; anchor.click(); URL.revokeObjectURL(url); };
  const confirmCsv = async () => { if (csvHasErrors || !csvRows.length || pending) return; setPending(true); const result = await importCatalog({ kind, rows: stripMeta(csvValidated), idempotencyKey: `csv-${crypto.randomUUID()}`, conflictMode }); setPending(false); setFeedback(result.message); if (result.ok) setCsvRows([]); };

  return <>
    <PageHeader eyebrow="LanLu workspace" title="ผู้ช่วยและนำเข้าข้อมูล" description="ให้ผู้ช่วยเตรียม draft หรือใช้ CSV เติม catalog ได้เร็วขึ้น โดยคุณเป็นคนตรวจและยืนยันทุกครั้ง" action={<div className="assistant-tabs"><button type="button" className={`assistant-tab ${mode === "gemini" ? "active" : ""}`} onClick={() => setMode("gemini")}><IconSparkles size={14} /> ผู้ช่วย Gemini</button><button type="button" className={`assistant-tab ${mode === "csv" ? "active" : ""}`} onClick={() => setMode("csv")}><IconFileUpload size={14} /> นำเข้า CSV</button></div>} />
    {mode === "gemini" ? <div className="assistant-layout">
      <SectionCard className="assistant-chat" title="คุยกับผู้ช่วย" description="Gemini สร้าง structured draft เท่านั้น ยังไม่บันทึกฐานข้อมูลจนกดปุ่มยืนยัน">
        <div className="assistant-messages">{messages.map((message, index) => <div className={`assistant-message ${message.role === "user" ? "user" : ""}`} key={`${message.role}-${index}`}><strong>{message.role === "user" ? "คุณ" : "Gemini"}</strong><div>{message.text}</div></div>)}</div>
        <div className="assistant-prompt-row">{prompts.map((item) => <button type="button" className="assistant-prompt" key={item} onClick={() => setPrompt(item)}>{item}</button>)}</div>
        <div className="assistant-composer"><CreatableSelect id="assistant-kind" label="ชนิด draft" value={kindLabels[kind]} options={Object.entries(kindLabels).map(([, label]) => label)} onChange={(value) => { const next = Object.entries(kindLabels).find(([, label]) => label === value)?.[0] as CatalogDraftKind | undefined; if (next) setKind(next); }} /><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="เช่น เพิ่มวัตถุดิบตามรายการนี้..." maxLength={2000} /><div className="assistant-composer-footer"><span className="assistant-note">ไม่เกิน 2,000 ตัวอักษร · draft ต้องตรวจโดยคน</span><button type="button" className="button button-primary" onClick={createDraft} disabled={pending || !prompt.trim()}><IconSend size={15} />{pending ? "กำลังเตรียม…" : "สร้าง draft"}</button></div></div>
      </SectionCard>
      <SectionCard className="draft-panel" title="Draft ที่แก้ไขได้" description="แก้แถวได้ก่อนยืนยันเข้า LanLu">
        {!draft ? <div className="empty-state"><div className="empty-mark"><IconMessageChatbot size={23} /></div><h3>ยังไม่มี draft</h3><p>ลองสั่งให้ผู้ช่วยเพิ่มวัตถุดิบ สร้างเมนู หรือร่างสูตร</p></div> : <><div className="draft-header"><div><h2>{kindLabels[draft.kind]}</h2><p>{draft.rows.length} แถว · source: Gemini</p></div><span className="draft-badge">รอตรวจ</span></div><div className="draft-rows">{draft.rows.map((row, index) => <DraftRow key={index} kind={draft.kind} row={row} onChange={(key, value) => setDraft((current) => current ? { ...current, rows: current.rows.map((item, rowIndex) => rowIndex === index ? { ...item, [key]: value } : item) } : current)} />)}</div>{draft.warnings.length > 0 && <div className="draft-warning"><IconAlertTriangle size={16} />{draft.warnings.join(" · ")}</div>}<div className="form-actions"><button type="button" className="button button-primary" onClick={confirmDraft} disabled={pending}><IconCheck size={15} />ตรวจแล้ว เพิ่มเข้า LanLu</button></div></>}
      </SectionCard>
    </div> : <SectionCard title="นำเข้าข้อมูลจาก CSV" description="เลือกชนิดข้อมูล ดาวน์โหลด template แล้ว upload เพื่อ preview และ validation ก่อนยืนยัน">
      <div className="csv-toolbar"><div className="csv-kind-list">{Object.entries(kindLabels).map(([id, label]) => <button type="button" className={`csv-kind ${kind === id ? "active" : ""}`} key={id} onClick={() => { setKind(id as CatalogDraftKind); setCsvRows([]); }}>{label}</button>)}</div><div className="csv-toolbar-actions"><CreatableSelect id="csv-conflict" value={{ create: "ซ้ำให้แจ้ง", update: "ซ้ำให้อัปเดต", skip: "ซ้ำให้ข้าม" }[conflictMode]} options={["ซ้ำให้แจ้ง", "ซ้ำให้อัปเดต", "ซ้ำให้ข้าม"]} onChange={(value) => { const next = Object.entries({ create: "ซ้ำให้แจ้ง", update: "ซ้ำให้อัปเดต", skip: "ซ้ำให้ข้าม" }).find(([, label]) => label === value)?.[0] as "create" | "update" | "skip" | undefined; if (next) setConflictMode(next); }} /><button type="button" className="button button-quiet button-small" onClick={downloadTemplate}><IconDownload size={14} />ดาวน์โหลดตัวอย่าง</button></div></div>
      <div className="csv-dropzone" onClick={() => fileRef.current?.click()} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") fileRef.current?.click(); }}><IconUpload size={22} /><strong>เลือกไฟล์ CSV</strong><span>ระบบจะ preview, normalize และบอกแถวที่ต้องแก้ก่อนบันทึก</span><input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(event) => void handleCsv(event.target.files?.[0])} /></div>
      {csvError && <div className="auth-error" role="alert">{csvError}</div>}
      {!!csvValidated.length && <><div className="data-note"><span>{csvValidated.length} แถว · {csvHasErrors ? "ยังมีรายการต้องแก้" : "ผ่าน validation เบื้องต้น"}</span><span>{csvHasErrors ? "แก้ cell ที่มีพื้นหลังแดง" : "พร้อมยืนยัน"}</span></div><div className="csv-table-wrap"><table className="csv-table"><thead><tr>{Object.keys(csvValidated[0]).filter((key) => !key.startsWith("_")).map((key) => <th key={key}>{key}</th>)}<th>สถานะ</th></tr></thead><tbody>{csvValidated.map((row, index) => <tr key={index}>{Object.entries(row).filter(([key]) => !key.startsWith("_")).map(([key, value]) => <td key={key} className={(row._errors as string[]).length ? "has-error" : ""}><input className="table-input" value={String(value ?? "")} onChange={(event) => updateRows(setCsvRows, index, key, event.target.value)} /></td>)}<td>{(row._errors as string[]).length ? <span className="csv-error">{(row._errors as string[]).join(" · ")}</span> : <IconCheck size={15} color="var(--sage-dark)" />}</td></tr>)}</tbody></table></div><div className="csv-confirm"><button type="button" className="button button-primary" onClick={confirmCsv} disabled={pending || csvHasErrors}><IconCheck size={15} />ตรวจแล้ว นำเข้า {kindLabels[kind]}</button></div></>}
      {feedback && <div className="capture-feedback" role="status"><IconCheck size={14} />{feedback}</div>}
    </SectionCard>}
  </>;
}

function DraftRow({ kind, row, onChange }: { kind: CatalogDraftKind; row: Record<string, unknown>; onChange: (key: string, value: unknown) => void }) {
  const fields = kind === "ingredient" ? [["name", "ชื่อ"], ["unit", "หน่วย"], ["supplier", "Supplier"], ["unitCost", "ต้นทุน/หน่วย"], ["reorderPoint", "จุดสั่งซื้อ"], ["quantityOnHand", "ยอดเริ่มต้น"]] : kind === "menu" ? [["name", "ชื่อเมนู"], ["category", "หมวด"], ["price", "ราคาขาย"], ["active", "เปิดขาย"]] : [["menuName", "ชื่อเมนู"], ["ingredientName", "ชื่อวัตถุดิบ"], ["quantity", "ปริมาณ"], ["unit", "หน่วย"]];
  return <div className="draft-row"><div className="draft-row-grid">{fields.map(([key, label]) => <div className="form-field" key={key}><label htmlFor={`draft-${key}`}>{label}</label>{key === "active" ? <input id={`draft-${key}`} type="checkbox" checked={row[key] !== false && row[key] !== "false"} onChange={(event) => onChange(key, event.target.checked)} /> : <input id={`draft-${key}`} className="text-input" value={String(row[key] ?? "")} onChange={(event) => onChange(key, ["price", "unitCost", "reorderPoint", "quantityOnHand", "quantity"].includes(key) ? Number(event.target.value) : event.target.value)} />}</div>)}</div></div>;
}

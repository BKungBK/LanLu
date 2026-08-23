"use client";

import { useEffect, useMemo, useState } from "react";
import { IconAdjustments, IconAlertTriangle, IconCheck, IconDeviceFloppy, IconInfoCircle, IconPackageImport, IconReceipt, IconRotate2, IconSearch, IconTrash } from "@tabler/icons-react";
import { formatCurrency, getTodayInTimezone } from "@/lib/calculations";
import { useLanlu } from "@/lib/store";
import { DateField } from "@/components/form-controls";
import { DatePill, EmptyState, PageHeader, SectionCard, Stepper } from "@/components/ui";

type CaptureMode = "sales" | "receipt" | "waste" | "adjustment";
const modes: Array<{ id: CaptureMode; label: string; icon: typeof IconReceipt }> = [
  { id: "sales", label: "เพิ่มยอดขาย", icon: IconReceipt },
  { id: "receipt", label: "รับวัตถุดิบ", icon: IconPackageImport },
  { id: "waste", label: "แจ้งของเสีย", icon: IconTrash },
  { id: "adjustment", label: "ปรับยอดสต๊อก", icon: IconAdjustments },
];

export function CapturePage() {
  const { state, recordSale, confirmDailyClose, postMovement, loading, hydrated, error: storeError } = useLanlu();
  const [mode, setMode] = useState<CaptureMode>("sales");
  const [businessDate, setBusinessDate] = useState("");
  const [menuCounts, setMenuCounts] = useState<Record<string, number>>({});
  const [ingredientCounts, setIngredientCounts] = useState<Record<string, number>>({});
  const [ingredientSearch, setIngredientSearch] = useState("");
  const [orderCount, setOrderCount] = useState(0);
  const [lotCode, setLotCode] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [feedback, setFeedback] = useState("");
  const [feedbackTone, setFeedbackTone] = useState<"success" | "error">("success");
  const [pending, setPending] = useState(false);
  const [draftKey, setDraftKey] = useState("");
  const [draftReady, setDraftReady] = useState(false);
  const [closeDay, setCloseDay] = useState(false);

  useEffect(() => {
    const fallbackDate = hydrated ? getTodayInTimezone(state.shop.timezone) : "";
    let nextDraftKey = `capture-${crypto.randomUUID()}`;
    try {
      const saved = window.localStorage.getItem("lanlu-capture-draft-v1");
      if (saved) {
        const draft = JSON.parse(saved) as { businessDate?: string; menuCounts?: Record<string, number>; ingredientCounts?: Record<string, number>; orderCount?: number; idempotencyKey?: string };
        setBusinessDate(draft.businessDate || fallbackDate);
        if (draft.menuCounts) setMenuCounts(draft.menuCounts);
        if (draft.ingredientCounts) {
          const selected = Object.entries(draft.ingredientCounts).find(([, quantity]) => Number(quantity) > 0);
          setIngredientCounts(selected ? { [selected[0]]: Number(selected[1]) } : {});
        }
        if (draft.orderCount) setOrderCount(draft.orderCount);
        if (draft.idempotencyKey) nextDraftKey = draft.idempotencyKey;
      } else {
        setBusinessDate(fallbackDate);
      }
    } catch { /* Continue with a clean draft. */ }
    setDraftKey(nextDraftKey);
    setDraftReady(true);
  }, [hydrated, state.shop.timezone]);

  useEffect(() => {
    if (!draftReady) return;
    try {
      window.localStorage.setItem("lanlu-capture-draft-v1", JSON.stringify({ businessDate, menuCounts, ingredientCounts, orderCount, idempotencyKey: draftKey }));
    } catch { /* Keep the in-memory draft if storage is unavailable. */ }
  }, [businessDate, draftKey, draftReady, ingredientCounts, menuCounts, orderCount]);

  const activeMenus = useMemo(() => state.menuItems.filter((menu) => menu.active && !menu.archivedAt), [state.menuItems]);
  const activeIngredients = useMemo(() => state.ingredients.filter((ingredient) => ingredient.active !== false), [state.ingredients]);
  const visibleIngredients = useMemo(() => { const search = ingredientSearch.trim().toLocaleLowerCase(); return activeIngredients.filter((ingredient) => !search || [ingredient.name, ingredient.unit, ingredient.supplier ?? ""].some((value) => value.toLocaleLowerCase().includes(search))); }, [activeIngredients, ingredientSearch]);
  const selectedLines = useMemo(() => activeMenus.map((menu) => ({ menuItemId: menu.id, quantity: menuCounts[menu.id] ?? 0 })).filter((line) => line.quantity > 0), [activeMenus, menuCounts]);
  const totalCups = selectedLines.reduce((sum, line) => sum + line.quantity, 0);
  const totalRevenue = selectedLines.reduce((sum, line) => sum + line.quantity * (state.menuItems.find((menu) => menu.id === line.menuItemId)?.price ?? 0), 0);
  const selectedIngredient = Object.entries(ingredientCounts).find(([, quantity]) => quantity > 0);
  const changeMode = (next: CaptureMode) => { setMode(next); setFeedback(""); setFeedbackTone("success"); };
  const setMenuCount = (menuId: string, value: number) => setMenuCounts((current) => ({ ...current, [menuId]: Math.max(0, value) }));
  const setIngredientCount = (ingredientId: string, value: number) => {
    const nextValue = Math.max(0, value);
    setIngredientCounts(nextValue > 0 ? { [ingredientId]: nextValue } : (current) => ({ ...current, [ingredientId]: 0 }));
  };

  const handleSubmit = async () => {
    if (pending || !hydrated) return;
    setFeedback("");
    setFeedbackTone("success");
    if (!businessDate) { setFeedbackTone("error"); setFeedback("เลือกวันที่ข้อมูลก่อนบันทึก"); return; }
    if (mode === "sales" && selectedLines.length === 0) { setFeedbackTone("error"); setFeedback("เลือกเมนูอย่างน้อย 1 รายการก่อนบันทึก"); return; }
    if (mode !== "sales" && !selectedIngredient) { setFeedbackTone("error"); setFeedback("เลือกวัตถุดิบและใส่จำนวนก่อนบันทึก"); return; }
    setPending(true);
    try {
      if (mode === "sales") {
        const input = { businessDate, orderCount: orderCount || undefined, lines: selectedLines, idempotencyKey: draftKey || `capture-${businessDate}` };
        const result = closeDay ? await confirmDailyClose({ ...input, note: "ยืนยัน Daily close จาก Quick capture" }) : await recordSale(input);
        setFeedbackTone(result.ok ? "success" : "error");
        setFeedback(result.message);
        if (result.ok) { setMenuCounts({}); setOrderCount(0); setDraftKey(`capture-${crypto.randomUUID()}`); window.localStorage.removeItem("lanlu-capture-draft-v1"); }
        return;
      }
      const result = await postMovement({ ingredientId: selectedIngredient![0], type: mode, quantity: selectedIngredient![1], note: mode === "receipt" ? "รับเข้าโดย Quick capture" : undefined, lotCode: mode === "receipt" ? lotCode || undefined : undefined, expiresOn: mode === "receipt" ? expiresOn || undefined : undefined, idempotencyKey: draftKey || `movement-${mode}-${businessDate}` });
      setFeedbackTone(result.ok ? "success" : "error");
      setFeedback(result.message);
      if (result.ok) { setIngredientCounts({}); setLotCode(""); setExpiresOn(""); setDraftKey(`movement-${crypto.randomUUID()}`); window.localStorage.removeItem("lanlu-capture-draft-v1"); }
    } catch {
      setFeedbackTone("error");
      setFeedback("เชื่อมต่อระบบไม่สำเร็จ ข้อมูลยังอยู่ใน Draft ลองอีกครั้งได้");
    } finally {
      setPending(false);
    }
  };

  const helpItems = mode === "sales"
    ? ["ขายเมนูที่ยังไม่มีสูตรได้ ระบบจะแจ้งคุณภาพข้อมูลแยกไว้", "กดซ้ำหรือ retry ได้ เพราะแต่ละรายการมี idempotency key", "ยืนยันครั้งเดียว ระบบตัด stock ตามสูตรให้ทันที"]
    : mode === "receipt"
      ? ["รับเข้าได้ทีละรายการ พร้อม lot และวันหมดอายุเพื่อใช้ FEFO", "ถ้ารับซ้ำ ให้ตรวจจำนวนกับ lot ก่อนยืนยัน", "ยืนยันแล้วระบบจะเพิ่ม stock และเก็บ ledger ให้ทันที"]
      : mode === "waste"
        ? ["ของเสียจะลด stock แต่ไม่ลบยอดรับเข้าเดิม", "ใส่จำนวนของเสียตามหน่วยฐานของวัตถุดิบ", "ตรวจชื่อวัตถุดิบและจำนวนก่อนยืนยันทุกครั้ง"]
        : ["Adjustment ใช้แก้ส่วนต่างจากการนับจริง", "ใส่จำนวนที่ต้องการปรับ ไม่ใช่ยอดคงเหลือใหม่", "ทุก adjustment มี audit trail ย้อนดูได้"];

  return <>
    <PageHeader eyebrow="บันทึกข้อมูล" title="บันทึกยอดขายและสต๊อก" description="เลือกประเภท ใส่จำนวน ตรวจสรุป แล้วบันทึกในรอบเดียว" action={<DatePill>Draft เก็บในเครื่อง</DatePill>} />
    <div className="capture-layout">
      <SectionCard className="capture-panel" title="เริ่มบันทึกข้อมูล" description="เลือกวันที่ธุรกิจ แล้วระบบจะคำนวณ stock จากสูตรให้อัตโนมัติ">
        <div className="capture-mode" role="tablist" aria-label="ประเภทการบันทึก">{modes.map(({ id, label, icon: Icon }) => <button type="button" role="tab" aria-selected={mode === id} key={id} className={`mode-button ${mode === id ? "active" : ""}`} onClick={() => changeMode(id)}><span className="mode-icon"><Icon size={16} /></span><span>{label}</span></button>)}</div>
        <div className="date-field"><DateField id="business-date" label="วันที่ข้อมูล" value={businessDate} onChange={setBusinessDate} /></div>
        {mode === "sales" ? <>
          <div className="capture-section-intro"><span className="capture-step-number">1</span><div><strong>เลือกเมนูและจำนวนแก้ว</strong><span>กด + ตามจำนวนที่ขาย กด - หากใส่เกิน</span></div><span className="capture-counter">{totalCups} แก้ว</span></div>
          {activeMenus.length === 0 ? <EmptyState title="ยังไม่มีเมนู" description="ไปตั้งค่าเมนูของร้านก่อน แล้วกลับมาบันทึกยอดขาย" actionHref="/settings/menu" actionLabel="ตั้งค่าเมนู" /> : <div className="menu-grid">{activeMenus.map((menu) => <div className={`menu-choice ${(menuCounts[menu.id] ?? 0) > 0 ? "selected" : ""}`} key={menu.id}><small>{menu.category}</small><strong>{menu.name}</strong><div className="menu-choice-bottom"><span className="menu-price">{formatCurrency(menu.price)}</span><Stepper contextLabel={`เพิ่มจำนวน${menu.name}`} value={menuCounts[menu.id] ?? 0} onChange={(value) => setMenuCount(menu.id, value)} /></div></div>)}</div>}
          <div className="order-field"><label className="field-label order-field-label" htmlFor="order-count"><span><strong>2. จำนวนบิล / ออเดอร์</strong><small>ถ้าทราบ ใส่เพื่อดูภาพร้านละเอียดขึ้น</small></span></label><input id="order-count" className="text-input compact-input" type="number" min="0" step="1" placeholder="เช่น 42" value={orderCount || ""} onChange={(event) => setOrderCount(Math.max(0, Number(event.target.value) || 0))} /></div>
          <label className="close-day-toggle"><input type="checkbox" checked={closeDay} onChange={(event) => setCloseDay(event.target.checked)} /><span><strong>บันทึกและปิดยอดวันนี้</strong><small>ใช้เมื่อจบวัน ระบบจะสร้าง Daily close และเก็บ audit event</small></span></label>
        </> : <>
          <div className="capture-section-intro"><span className="capture-step-number">1</span><div><strong>เลือกวัตถุดิบและจำนวน</strong><span>บันทึกทีละ 1 รายการ เพื่อไม่ให้เลือกผิด</span></div></div>
          {activeIngredients.length === 0 ? <EmptyState title="ยังไม่มีวัตถุดิบ" description="ไปเพิ่มวัตถุดิบก่อน เพื่อรับเข้าและตัดสต๊อก" actionHref="/inventory" actionLabel="ไปวัตถุดิบ" /> : <><label className="inventory-search capture-ingredient-search"><IconSearch size={16} /><span className="sr-only">ค้นหาวัตถุดิบในรายการ</span><input value={ingredientSearch} onChange={(event) => setIngredientSearch(event.target.value)} placeholder="ค้นหาวัตถุดิบที่ต้องการบันทึก" /></label><div className="inventory-capture-grid">{visibleIngredients.map((ingredient) => <div className={`inventory-capture-row ${(ingredientCounts[ingredient.id] ?? 0) > 0 ? "selected" : ""}`} key={ingredient.id}><div><strong>{ingredient.name}</strong><small>คงเหลือ {ingredient.quantityOnHand} {ingredient.unit}</small></div><Stepper contextLabel={`เพิ่มจำนวน${ingredient.name}`} value={ingredientCounts[ingredient.id] ?? 0} max={9999} onChange={(value) => setIngredientCount(ingredient.id, value)} /></div>)}{visibleIngredients.length === 0 && <div className="inventory-empty"><IconSearch size={20} /><span>ไม่พบวัตถุดิบจากคำค้นหา</span></div>}</div></>}
          {mode === "receipt" && <div className="form-grid capture-lot-fields"><div className="form-field"><label htmlFor="lot-code">รหัสล็อต (ถ้ามี)</label><input id="lot-code" className="text-input" value={lotCode} onChange={(event) => setLotCode(event.target.value)} maxLength={60} /></div><DateField id="expires-on" label="วันหมดอายุ (ถ้ามี)" value={expiresOn} onChange={setExpiresOn} /></div>}
        </>}
        <div className="capture-footer"><span className="draft-note"><span className="draft-dot" />บันทึก Draft อัตโนมัติในเครื่อง{loading && hydrated ? " · กำลังซิงก์ข้อมูลล่าสุด" : ""}</span><button type="button" className="button button-primary" onClick={handleSubmit} disabled={pending || !hydrated} aria-busy={pending || loading}><IconDeviceFloppy size={16} />{!hydrated ? "กำลังเตรียมข้อมูล…" : pending ? "กำลังบันทึก…" : mode === "sales" ? closeDay ? "บันทึกและปิดยอด" : "บันทึกยอดขาย" : "บันทึกความเคลื่อนไหว"}</button></div>
        {storeError && !feedback && <div className="capture-feedback error" role="alert"><IconAlertTriangle size={14} />โหลดข้อมูลร้านไม่สำเร็จ ลองโหลดหน้าใหม่ก่อนบันทึก</div>}
        {feedback && <div className={`capture-feedback ${feedbackTone}`} role={feedbackTone === "error" ? "alert" : "status"}>{feedbackTone === "error" ? <IconAlertTriangle size={14} /> : <IconCheck size={14} />}{feedback}</div>}
      </SectionCard>
      <div className="capture-summary">
        {mode === "sales" ? <SectionCard className="summary-hero" title="ตรวจยอดก่อนบันทึก" description="รายการนี้จะถูกเพิ่มเป็นยอดขายใหม่"><span className="summary-label">ยอดขายรอบนี้</span><div className="summary-total">{formatCurrency(totalRevenue)}</div><div className="summary-meta">{totalCups} แก้ว · {orderCount || "ไม่ระบุ"} บิล</div><div className="summary-list">{selectedLines.length ? selectedLines.map((line) => <div className="summary-line" key={line.menuItemId}><span>{state.menuItems.find((menu) => menu.id === line.menuItemId)?.name}</span><strong>{line.quantity} แก้ว</strong></div>) : <div className="summary-line"><span>ยังไม่ได้เลือกเมนู</span><strong>กด + เพื่อเริ่ม</strong></div>}</div></SectionCard> : <SectionCard className="summary-hero" title="สรุปวัตถุดิบ" description="ตรวจจำนวนก่อนบันทึก"><span className="summary-label">จำนวนที่จะบันทึก</span><div className="summary-total">{selectedIngredient?.[1] ?? 0}</div><div className="summary-meta">{selectedIngredient ? state.ingredients.find((ingredient) => ingredient.id === selectedIngredient[0])?.unit : "เลือกวัตถุดิบด้านซ้าย"}</div><div className="summary-list"><div className="summary-line"><span>{selectedIngredient ? state.ingredients.find((ingredient) => ingredient.id === selectedIngredient[0])?.name : "ยังไม่ได้เลือก"}</span><strong>{mode === "receipt" ? "รับเข้า" : mode === "waste" ? "ของเสีย" : "ปรับยอด"}</strong></div></div></SectionCard>}
        <SectionCard className="capture-help" title="จำไว้นิดหนึ่ง"><ul className="help-list">{helpItems.map((item, index) => <li key={item}>{index === 0 ? <IconInfoCircle size={15} /> : index === 1 ? <IconRotate2 size={15} /> : <IconCheck size={15} />}{item}</li>)}</ul></SectionCard>
      </div>
    </div>
  </>;
}

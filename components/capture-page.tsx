"use client";

import { useEffect, useMemo, useState } from "react";
import { IconAdjustments, IconCalendarEvent, IconCheck, IconDeviceFloppy, IconInfoCircle, IconPackageImport, IconReceipt, IconRotate2, IconTrash } from "@tabler/icons-react";
import { formatCurrency } from "@/lib/calculations";
import { useLanlu } from "@/lib/store";
import { DatePill, EmptyState, PageHeader, SectionCard, Stepper } from "@/components/ui";

type CaptureMode = "sales" | "receipt" | "waste" | "adjustment";
const modes: Array<{ id: CaptureMode; label: string; icon: typeof IconReceipt }> = [
  { id: "sales", label: "เพิ่มยอดขาย", icon: IconReceipt },
  { id: "receipt", label: "รับวัตถุดิบ", icon: IconPackageImport },
  { id: "waste", label: "แจ้งของเสีย", icon: IconTrash },
  { id: "adjustment", label: "ปรับยอดสต๊อก", icon: IconAdjustments },
];

export function CapturePage() {
  const { state, recordSale, confirmDailyClose, postMovement, loading } = useLanlu();
  const [mode, setMode] = useState<CaptureMode>("sales");
  const [businessDate, setBusinessDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [menuCounts, setMenuCounts] = useState<Record<string, number>>({});
  const [ingredientCounts, setIngredientCounts] = useState<Record<string, number>>({});
  const [orderCount, setOrderCount] = useState(0);
  const [lotCode, setLotCode] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [feedback, setFeedback] = useState("");
  const [pending, setPending] = useState(false);
  const [draftKey, setDraftKey] = useState("");
  const [closeDay, setCloseDay] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("lanlu-capture-draft-v1");
      if (saved) {
        const draft = JSON.parse(saved) as { businessDate?: string; menuCounts?: Record<string, number>; ingredientCounts?: Record<string, number>; orderCount?: number };
        if (draft.businessDate) setBusinessDate(draft.businessDate);
        if (draft.menuCounts) setMenuCounts(draft.menuCounts);
        if (draft.ingredientCounts) setIngredientCounts(draft.ingredientCounts);
        if (draft.orderCount) setOrderCount(draft.orderCount);
      }
    } catch { /* Continue with a clean draft. */ }
    setDraftKey(`capture-${crypto.randomUUID()}`);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("lanlu-capture-draft-v1", JSON.stringify({ businessDate, menuCounts, ingredientCounts, orderCount }));
  }, [businessDate, ingredientCounts, menuCounts, orderCount]);

  const selectedLines = useMemo(() => state.menuItems.map((menu) => ({ menuItemId: menu.id, quantity: menuCounts[menu.id] ?? 0 })).filter((line) => line.quantity > 0), [menuCounts, state.menuItems]);
  const totalCups = selectedLines.reduce((sum, line) => sum + line.quantity, 0);
  const totalRevenue = selectedLines.reduce((sum, line) => sum + line.quantity * (state.menuItems.find((menu) => menu.id === line.menuItemId)?.price ?? 0), 0);
  const selectedIngredient = Object.entries(ingredientCounts).find(([, quantity]) => quantity > 0);
  const changeMode = (next: CaptureMode) => { setMode(next); setFeedback(""); };
  const setMenuCount = (menuId: string, value: number) => setMenuCounts((current) => ({ ...current, [menuId]: Math.max(0, value) }));
  const setIngredientCount = (ingredientId: string, value: number) => setIngredientCounts((current) => ({ ...current, [ingredientId]: Math.max(0, value) }));

  const handleSubmit = async () => {
    if (pending) return;
    setPending(true);
    if (mode === "sales") {
      const input = { businessDate, orderCount: orderCount || undefined, lines: selectedLines, idempotencyKey: draftKey || `capture-${businessDate}` };
      const result = closeDay ? await confirmDailyClose({ ...input, note: "ยืนยัน Daily close จาก Quick capture" }) : await recordSale(input);
      setFeedback(result.message);
      if (result.ok) { setMenuCounts({}); setOrderCount(0); setDraftKey(`capture-${crypto.randomUUID()}`); window.localStorage.removeItem("lanlu-capture-draft-v1"); }
      setPending(false);
      return;
    }
    if (!selectedIngredient) { setFeedback("เลือกวัตถุดิบและใส่จำนวนก่อนบันทึก"); setPending(false); return; }
    const result = await postMovement({ ingredientId: selectedIngredient[0], type: mode, quantity: selectedIngredient[1], note: mode === "receipt" ? "รับเข้าโดย Quick capture" : undefined, lotCode: mode === "receipt" ? lotCode || undefined : undefined, expiresOn: mode === "receipt" ? expiresOn || undefined : undefined, idempotencyKey: draftKey || `movement-${mode}-${businessDate}` });
    setFeedback(result.message);
    if (result.ok) { setIngredientCounts({}); setLotCode(""); setExpiresOn(""); setDraftKey(`movement-${crypto.randomUUID()}`); window.localStorage.removeItem("lanlu-capture-draft-v1"); }
    setPending(false);
  };

  return <>
    <PageHeader eyebrow="บันทึกข้อมูล" title="Quick capture" description="บันทึกข้อมูลย้อนหลังหรือปิดยอดวันนี้ในรอบเดียว" action={<DatePill>Draft เก็บในเครื่อง</DatePill>} />
    <div className="capture-layout">
      <SectionCard className="capture-panel" title="เลือกสิ่งที่ต้องการบันทึก" description="เลือกวันที่ธุรกิจ แล้วระบบจะคำนวณ stock จากสูตรให้อัตโนมัติ">
        <div className="capture-mode" role="tablist" aria-label="ประเภทการบันทึก">{modes.map(({ id, label, icon: Icon }) => <button type="button" role="tab" aria-selected={mode === id} key={id} className={`mode-button ${mode === id ? "active" : ""}`} onClick={() => changeMode(id)}><Icon size={14} /> {label}</button>)}</div>
        <div className="date-field"><label className="field-label" htmlFor="business-date"><IconCalendarEvent size={14} /> วันที่ข้อมูล</label><input id="business-date" className="date-input" type="date" value={businessDate} onChange={(event) => setBusinessDate(event.target.value)} /></div>
        {mode === "sales" ? <>
          <p className="menu-prompt">แตะ + / - เพื่อใส่จำนวนแก้วที่ขาย</p>
          {state.menuItems.length === 0 ? <EmptyState title="ยังไม่มีเมนู" description="ไปตั้งค่าเมนูของร้านก่อน แล้วกลับมาบันทึกยอดขาย" actionHref="/settings/menu" actionLabel="ตั้งค่าเมนู" /> : <div className="menu-grid">{state.menuItems.filter((item) => item.active).map((menu) => <div className={`menu-choice ${(menuCounts[menu.id] ?? 0) > 0 ? "selected" : ""}`} key={menu.id}><small>{menu.category}</small><strong>{menu.name}</strong><div className="menu-choice-bottom"><span className="menu-price">{formatCurrency(menu.price)}</span><Stepper value={menuCounts[menu.id] ?? 0} onChange={(value) => setMenuCount(menu.id, value)} /></div></div>)}</div>}
          <div className="order-field"><label className="field-label" htmlFor="order-count">จำนวนรายการขาย <span>(ถ้ามี)</span></label><input id="order-count" className="text-input compact-input" type="number" min="0" placeholder="เช่น 42" value={orderCount || ""} onChange={(event) => setOrderCount(Number(event.target.value))} /></div>
          <label className="close-day-toggle"><input type="checkbox" checked={closeDay} onChange={(event) => setCloseDay(event.target.checked)} /><span><strong>ปิดยอดวันนี้ด้วย</strong><small>สร้าง Daily close และล็อกชุดข้อมูลวันนี้เป็น audit event</small></span></label>
        </> : <>
          <p className="menu-prompt">เลือกวัตถุดิบ 1 รายการต่อครั้ง แล้วใส่จำนวน</p>
          {state.ingredients.length === 0 ? <EmptyState title="ยังไม่มีวัตถุดิบ" description="ไปตั้งค่าวัตถุดิบก่อน เพื่อรับเข้าและตัดสต๊อก" actionHref="/settings/ingredients" actionLabel="ตั้งค่าวัตถุดิบ" /> : <div className="inventory-capture-grid">{state.ingredients.map((ingredient) => <div className="inventory-capture-row" key={ingredient.id}><div><strong>{ingredient.name}</strong><small>คงเหลือ {ingredient.quantityOnHand} {ingredient.unit}</small></div><Stepper value={ingredientCounts[ingredient.id] ?? 0} max={9999} onChange={(value) => setIngredientCount(ingredient.id, value)} /></div>)}</div>}
          {mode === "receipt" && <div className="form-grid capture-lot-fields"><div className="form-field"><label htmlFor="lot-code">รหัสล็อต (ถ้ามี)</label><input id="lot-code" className="text-input" value={lotCode} onChange={(event) => setLotCode(event.target.value)} maxLength={60} /></div><div className="form-field"><label htmlFor="expires-on">วันหมดอายุ (ถ้ามี)</label><input id="expires-on" className="date-input" type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} /></div></div>}
        </>}
        <div className="capture-footer"><span className="draft-note"><span className="draft-dot" />บันทึก Draft อัตโนมัติในเครื่อง</span><button type="button" className="button button-primary" onClick={handleSubmit} disabled={pending || loading}><IconDeviceFloppy size={16} />{pending ? "กำลังบันทึก…" : mode === "sales" ? closeDay ? "ยืนยัน Daily close" : "บันทึกยอดขาย" : "บันทึกความเคลื่อนไหว"}</button></div>
        {feedback && <div className="capture-feedback" role="status"><IconCheck size={14} />{feedback}</div>}
      </SectionCard>
      <div className="capture-summary">
        {mode === "sales" ? <SectionCard className="summary-hero" title="สรุปรอบนี้" description="ตรวจให้ครบก่อนยืนยัน"><span className="summary-label">ยอดขายโดยประมาณ</span><div className="summary-total">{formatCurrency(totalRevenue)}</div><div className="summary-meta">{totalCups} แก้ว · {orderCount || "—"} รายการ</div><div className="summary-list">{selectedLines.length ? selectedLines.map((line) => <div className="summary-line" key={line.menuItemId}><span>{state.menuItems.find((menu) => menu.id === line.menuItemId)?.name}</span><strong>{line.quantity} แก้ว</strong></div>) : <div className="summary-line"><span>ยังไม่ได้เลือกเมนู</span><strong>เริ่มแตะ +</strong></div>}</div></SectionCard> : <SectionCard className="summary-hero" title="สรุปวัตถุดิบ" description="ตรวจจำนวนก่อนบันทึก"><span className="summary-label">จำนวนที่จะบันทึก</span><div className="summary-total">{selectedIngredient?.[1] ?? 0}</div><div className="summary-meta">{selectedIngredient ? state.ingredients.find((ingredient) => ingredient.id === selectedIngredient[0])?.unit : "เลือกวัตถุดิบด้านซ้าย"}</div><div className="summary-list"><div className="summary-line"><span>{selectedIngredient ? state.ingredients.find((ingredient) => ingredient.id === selectedIngredient[0])?.name : "ยังไม่ได้เลือก"}</span><strong>{mode === "receipt" ? "รับเข้า" : mode === "waste" ? "ของเสีย" : "ปรับยอด"}</strong></div></div></SectionCard>}
        <SectionCard className="capture-help" title="จำไว้นิดหนึ่ง"><ul className="help-list"><li><IconInfoCircle size={15} />ขายเมนูที่ยังไม่มีสูตรได้ ระบบจะแจ้งคุณภาพข้อมูลแยกไว้</li><li><IconRotate2 size={15} />กดซ้ำหรือ retry ได้ เพราะแต่ละรายการมี idempotency key</li><li><IconCheck size={15} />ยืนยันครั้งเดียว ระบบตัด stock ตามสูตรให้ทันที</li></ul></SectionCard>
      </div>
    </div>
  </>;
}

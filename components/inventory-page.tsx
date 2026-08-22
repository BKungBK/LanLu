"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { IconArchive, IconCalendarDue, IconCheck, IconClipboardCheck, IconInfoCircle, IconPencil, IconPackage, IconPackageImport, IconPlus, IconRestore, IconSearch, IconTrash, IconX } from "@tabler/icons-react";
import { DEMO_TODAY } from "@/lib/data";
import { getDaysUntil, getStockStatus } from "@/lib/calculations";
import { DEFAULT_INGREDIENT_UNITS } from "@/lib/catalog";
import { useLanlu } from "@/lib/store";
import type { IngredientUnit } from "@/lib/types";
import { DatePill, PageHeader, SectionCard, StatusBadge } from "@/components/ui";

type CatalogFilter = "all" | "active" | "archived";
type ExpiryFilter = "all" | "soon" | "expired" | "future" | "unknown";

const demoDate = new Date(`${DEMO_TODAY}T12:00:00+07:00`);

function expiryBucket(value?: string): Exclude<ExpiryFilter, "all"> {
  const days = getDaysUntil(value, demoDate);
  if (days === undefined) return "unknown";
  if (days <= 0) return "expired";
  return days <= 7 ? "soon" : "future";
}

export function InventoryPage() {
  const { state, addIngredient, updateIngredient, archiveCatalogItem, restoreCatalogItem, deleteCatalogItem, loading } = useLanlu();
  const [query, setQuery] = useState("");
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilter>("active");
  const [expiryFilter, setExpiryFilter] = useState<ExpiryFilter>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<IngredientUnit>("ลิตร");
  const [initialQuantity, setInitialQuantity] = useState(0);
  const [unitCost, setUnitCost] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [pending, setPending] = useState(false);

  const resetEditor = () => {
    setEditingId(null);
    setShowEditor(false);
    setName("");
    setUnit("ลิตร");
    setInitialQuantity(0);
    setUnitCost(0);
  };

  const openCreate = () => {
    resetEditor();
    setShowEditor(true);
    setFeedback("");
  };

  const openEdit = (id: string) => {
    const ingredient = state.ingredients.find((item) => item.id === id);
    if (!ingredient) return;
    setEditingId(id);
    setShowEditor(true);
    setName(ingredient.name);
    setUnit(ingredient.unit);
    setInitialQuantity(0);
    setUnitCost(ingredient.unitCost);
    setFeedback("");
  };

  const filteredIngredients = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return state.ingredients
      .filter((ingredient) => catalogFilter === "all" || (catalogFilter === "active" ? ingredient.active !== false : ingredient.active === false))
      .filter((ingredient) => expiryFilter === "all" || expiryBucket(ingredient.nearestExpiry) === expiryFilter)
      .filter((ingredient) => !normalizedQuery || [ingredient.name, ingredient.unit].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)))
      .sort((a, b) => {
        const status = { critical: 0, warning: 1, normal: 2 };
        const statusDelta = status[getStockStatus(a)] - status[getStockStatus(b)];
        return statusDelta || a.name.localeCompare(b.name, "th");
      });
  }, [catalogFilter, expiryFilter, query, state.ingredients]);

  const expiring = useMemo(() => state.ingredients
    .filter((ingredient) => ingredient.active !== false)
    .filter((ingredient) => { const days = getDaysUntil(ingredient.nearestExpiry, demoDate); return days !== undefined && days <= 7; })
    .sort((a, b) => (getDaysUntil(a.nearestExpiry, demoDate) ?? 99) - (getDaysUntil(b.nearestExpiry, demoDate) ?? 99)), [state.ingredients]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || unitCost < 0 || initialQuantity < 0) return;
    setPending(true);
    setFeedback("");
    const result = editingId
      ? await updateIngredient({ id: editingId, name: name.trim(), unit, unitCost })
      : await addIngredient({ name: name.trim(), unit, quantityOnHand: initialQuantity, reorderPoint: 0, unitCost });
    setPending(false);
    setFeedback(result.message);
    if (result.ok) resetEditor();
  };

  const archiveIngredient = async (id: string, ingredientName: string) => {
    const recipeCount = state.recipes.filter((recipe) => recipe.lines.some((line) => line.ingredientId === id)).length;
    const menuCount = state.recipes.filter((recipe) => recipe.lines.some((line) => line.ingredientId === id)).map((recipe) => recipe.menuItemId).filter((menuId, index, menuIds) => menuIds.indexOf(menuId) === index).length;
    if (!window.confirm(`เก็บ “${ingredientName}” ออกจากรายการ?\n\n${recipeCount ? `มี ${recipeCount} สูตรที่อ้างอิงอยู่ (${menuCount} เมนู)` : "ยังไม่มีสูตรที่อ้างอิง"}\nledger, ยอดขายย้อนหลัง และสูตรเดิมจะไม่ถูกลบ`)) return;
    setPending(true);
    setFeedback("");
    const result = await archiveCatalogItem("ingredient", id);
    setPending(false);
    setFeedback(result.message);
    if (result.ok && editingId === id) resetEditor();
  };

  const restoreIngredient = async (id: string) => {
    setPending(true);
    setFeedback("");
    const result = await restoreCatalogItem("ingredient", id);
    setPending(false);
    setFeedback(result.message);
  };

  const deleteIngredient = async (id: string, ingredientName: string) => {
    if (!window.confirm(`ลบ “${ingredientName}” ถาวร?\n\nทำได้เฉพาะวัตถุดิบที่ไม่มีสูตรหรือประวัติรับ-จ่ายสต๊อก ระบบจะเก็บ audit event การลบไว้`)) return;
    setPending(true);
    setFeedback("");
    const result = await deleteCatalogItem("ingredient", id);
    setPending(false);
    setFeedback(result.message);
    if (result.ok && editingId === id) resetEditor();
  };

  const actionFilter = (value: CatalogFilter, label: string) => <button type="button" className={`filter-button ${catalogFilter === value ? "active" : ""}`} onClick={() => setCatalogFilter(value)}>{label}</button>;
  const expiryActionFilter = (value: ExpiryFilter, label: string) => <button type="button" className={`filter-button ${expiryFilter === value ? "active" : ""}`} onClick={() => setExpiryFilter(value)}>{label}</button>;

  return <>
    <PageHeader eyebrow="วัตถุดิบ" title="สต๊อกที่ต้องรู้" description="ค้นหา แก้ไข และจัดการวัตถุดิบจากหน้าเดียว โดยไม่กระทบ ledger ย้อนหลัง" action={<><DatePill /><button type="button" className="button button-primary" onClick={openCreate}><IconPlus size={15} />เพิ่มวัตถุดิบ</button></>} />
    <div className="inventory-layout">
      <SectionCard className="inventory-table" title="วัตถุดิบทั้งหมด" description={`${filteredIngredients.length} จาก ${state.ingredients.length} รายการ · สต๊อกติดลบได้เพื่อไม่บล็อกการขาย`}>
        <div className="inventory-toolbar">
          <label className="inventory-search"><IconSearch size={16} /><span className="sr-only">ค้นหาวัตถุดิบ</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาชื่อหรือหน่วยตัดสต๊อก" /></label>
          <div className="inventory-filters" aria-label="สถานะวัตถุดิบ">{actionFilter("all", "ทั้งหมด")} {actionFilter("active", "ใช้งานอยู่")} {actionFilter("archived", "เก็บแล้ว")}</div>
          <div className="inventory-filters" aria-label="วันหมดอายุ">{expiryActionFilter("all", "ทุกวันหมดอายุ")} {expiryActionFilter("soon", "ใกล้หมดอายุ")} {expiryActionFilter("expired", "หมดอายุแล้ว")} {expiryActionFilter("future", "ยังไม่เร่งด่วน")} {expiryActionFilter("unknown", "ไม่ระบุ")}</div>
        </div>
        {filteredIngredients.length ? <div>{filteredIngredients.map((ingredient) => {
          const archived = ingredient.active === false;
          const status = getStockStatus(ingredient);
          const ratio = Math.min(100, Math.max(7, ingredient.quantityOnHand / Math.max(ingredient.reorderPoint * 2, 1) * 100));
          return <div className={`inventory-item ${archived ? "inventory-item-archived" : ""}`} key={ingredient.id}>
            <div className="inventory-name"><strong>{ingredient.name}</strong><span>{ingredient.purchase ? `ซื้อ ${ingredient.purchase.packageCount} ${ingredient.purchase.packageUnit}` : "ยังไม่มีข้อมูลแพ็กซื้อ"}</span></div>
            <div className="stock-level"><span>คงเหลือ</span><strong>{ingredient.quantityOnHand} {ingredient.unit}</strong><div className="stock-line"><i className={status} style={{ width: `${ratio}%` }} /></div></div>
            <div className="stock-level"><span>ต้นทุนต่อหน่วย</span><strong>{ingredient.unitCost.toLocaleString("th-TH")} บาท/{ingredient.unit}</strong></div>
            <StatusBadge status={archived ? "info" : status} label={archived ? "เก็บแล้ว" : undefined} />
            <div className="inventory-actions">
              {!archived && <button type="button" className="action-button" title={`แก้ไข ${ingredient.name}`} aria-label={`แก้ไข ${ingredient.name}`} onClick={() => openEdit(ingredient.id)} disabled={pending}><IconPencil size={15} /><span className="action-button-label">แก้ไข</span></button>}
              {archived ? <><button type="button" className="action-button" title={`เลิกเก็บ ${ingredient.name}`} aria-label={`เลิกเก็บ ${ingredient.name}`} onClick={() => void restoreIngredient(ingredient.id)} disabled={pending}><IconRestore size={15} /><span className="action-button-label">เลิกเก็บ</span></button><button type="button" className="action-button action-button-danger" title={`ลบ ${ingredient.name} ถาวร`} aria-label={`ลบ ${ingredient.name} ถาวร`} onClick={() => void deleteIngredient(ingredient.id, ingredient.name)} disabled={pending}><IconTrash size={15} /><span className="action-button-label">ลบ</span></button></> : <button type="button" className="action-button action-button-danger" title={`เก็บ ${ingredient.name} ออกจากรายการ`} aria-label={`เก็บ ${ingredient.name} ออกจากรายการ`} onClick={() => void archiveIngredient(ingredient.id, ingredient.name)} disabled={pending}><IconArchive size={15} /><span className="action-button-label">เก็บออก</span></button>}
            </div>
          </div>;
        })}</div> : <div className="inventory-empty"><IconPackage size={23} /><strong>ไม่พบวัตถุดิบตามตัวกรอง</strong><span>ลองเปลี่ยนคำค้นหาหรือเพิ่มวัตถุดิบใหม่</span></div>}
        <div className="inventory-legend"><span className="legend"><i style={{ background: "var(--sage)" }} />ปกติ</span><span className="legend"><i className="warning" />เฝ้าระวัง</span><span className="legend"><i className="critical" />ต้องจัดการ</span></div>
      </SectionCard>
      <div>
        {showEditor && <SectionCard className="expiry-card inventory-editor" title={editingId ? "แก้ไขวัตถุดิบ" : "เพิ่มวัตถุดิบ"} description={editingId ? "แก้ข้อมูลวัตถุดิบได้ โดยไม่เขียนทับประวัติเดิม" : "จำนวนที่มีตอนนี้จะสร้างรายการรับเข้าและเก็บ audit trail"}>
          <form className="form-grid" onSubmit={submit}>
            <div className="form-field full"><label htmlFor="inventory-ingredient-name">ชื่อวัตถุดิบ</label><input id="inventory-ingredient-name" className="text-input" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required /></div>
            <div className="form-field full"><label htmlFor="inventory-ingredient-unit">หน่วยตัดสต๊อก</label><input id="inventory-ingredient-unit" className="text-input" list="inventory-units" value={unit} onChange={(event) => setUnit(event.target.value)} required /><small className="form-hint"><IconInfoCircle size={13} /> หน่วยที่ใช้ทุกครั้งที่รับของ ขาย ทิ้ง หรือปรับยอด เช่น ml, g หรือ ขวด</small><datalist id="inventory-units">{DEFAULT_INGREDIENT_UNITS.map((item) => <option key={item} value={item} />)}</datalist></div>
            <div className="form-field"><label htmlFor="inventory-ingredient-cost">ต้นทุนต่อหน่วย (ถ้ารู้)</label><input id="inventory-ingredient-cost" className="text-input" type="number" min="0" step="0.000001" value={unitCost} onChange={(event) => setUnitCost(Number(event.target.value))} /><small className="form-hint">ถ้ายังไม่รู้ ใส่ 0 แล้วบันทึกต้นทุนตอนรับของเข้าได้</small></div>
            {!editingId && <div className="form-field"><label htmlFor="inventory-ingredient-opening">มีอยู่ตอนนี้</label><input id="inventory-ingredient-opening" className="text-input" type="number" min="0" step="0.001" value={initialQuantity} onChange={(event) => setInitialQuantity(Number(event.target.value))} /><small className="form-hint">จำนวนที่มีในร้านตอนเริ่มใช้ระบบ</small></div>}
            <div className="form-actions full"><button type="submit" className="button button-primary" disabled={pending || loading}><IconCheck size={15} />{pending ? "กำลังบันทึก…" : editingId ? "บันทึกการแก้ไข" : "เพิ่มวัตถุดิบ"}</button><button type="button" className="button button-quiet" onClick={resetEditor} disabled={pending}><IconX size={15} />ยกเลิก</button></div>
          </form>
          {feedback && <div className="capture-feedback" role="status"><IconCheck size={14} />{feedback}</div>}
        </SectionCard>}
        <SectionCard className="expiry-card" title="ใกล้หมดอายุ" description="FEFO: ใช้ล็อตที่หมดอายุก่อนก่อน">
          {expiring.length ? expiring.map((ingredient) => { const days = getDaysUntil(ingredient.nearestExpiry, demoDate) ?? 0; return <div className="expiry-item" key={ingredient.id}><span className="expiry-icon"><IconCalendarDue size={18} stroke={1.8} /></span><div><strong>{ingredient.name}</strong><span>เหลือ {ingredient.quantityOnHand} {ingredient.unit} · {days <= 0 ? "หมดอายุแล้ว" : `หมดอายุใน ${days} วัน`}</span></div></div>; }) : <div className="empty-state"><div className="empty-mark"><IconPackage size={22} /></div><h3>ยังไม่มีรายการเร่งด่วน</h3><p>วัตถุดิบทั้งหมดมีวันหมดอายุห่างพอ</p></div>}
        </SectionCard>
        <SectionCard className="expiry-card" title="ทางลัดการบันทึก" description="ทุก movement เก็บผู้บันทึก เวลา และหมายเหตุใน production">
          <div className="help-list"><div className="expiry-item"><span className="expiry-icon"><IconPackageImport size={18} stroke={1.8} /></span><div><strong>รับของเข้า</strong><span>เพิ่ม lot และวันหมดอายุผ่าน Quick capture</span></div></div><div className="expiry-item"><span className="expiry-icon"><IconClipboardCheck size={18} stroke={1.8} /></span><div><strong>นับสต๊อกจริง</strong><span>ใช้ adjustment เพื่อรักษา audit trail</span></div></div></div>
          <Link href="/capture" className="button button-soft" style={{ width: "100%", marginTop: 14 }}><IconPlus size={15} />เปิด Quick capture</Link>
        </SectionCard>
      </div>
    </div>
  </>;
}

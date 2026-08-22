"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { IconCheck, IconPackage, IconPencil, IconPlus, IconToolsKitchen2, IconX } from "@tabler/icons-react";
import { useLanlu } from "@/lib/store";
import type { IngredientUnit } from "@/lib/types";
import { DEFAULT_INGREDIENT_UNITS } from "@/lib/catalog";
import { CreatableSelect, DateField } from "@/components/form-controls";
import { EmptyState, PageHeader, SectionCard } from "@/components/ui";

export function IngredientSettings() {
  const { state, addIngredient, updateIngredient, loading } = useLanlu();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<IngredientUnit>("ลิตร");
  const [supplier, setSupplier] = useState("");
  const [quantity, setQuantity] = useState(0);
  const [reorderPoint, setReorderPoint] = useState(1);
  const [unitCost, setUnitCost] = useState(0);
  const [openingExpiry, setOpeningExpiry] = useState("");
  const [feedback, setFeedback] = useState("");
  const [pending, setPending] = useState(false);
  const units = useMemo(() => Array.from(new Set([...DEFAULT_INGREDIENT_UNITS, ...state.ingredients.map((ingredient) => ingredient.unit), unit])), [state.ingredients, unit]);

  const resetForm = () => { setEditingId(null); setName(""); setUnit("ลิตร"); setSupplier(""); setQuantity(0); setReorderPoint(1); setUnitCost(0); setOpeningExpiry(""); };
  const editIngredient = (id: string) => { const ingredient = state.ingredients.find((item) => item.id === id); if (!ingredient) return; setEditingId(id); setName(ingredient.name); setUnit(ingredient.unit); setSupplier(ingredient.supplier ?? ""); setReorderPoint(ingredient.reorderPoint); setUnitCost(ingredient.unitCost); setQuantity(0); setOpeningExpiry(""); setFeedback(""); };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || quantity < 0 || reorderPoint < 0 || unitCost < 0) return;
    setPending(true); setFeedback("");
    const result = editingId
      ? await updateIngredient({ id: editingId, name: name.trim(), unit, supplier: supplier.trim(), reorderPoint, unitCost })
      : await addIngredient({ name: name.trim(), unit, supplier: supplier.trim(), quantityOnHand: quantity, reorderPoint, unitCost, openingExpiry });
    setPending(false); setFeedback(result.message);
    if (result.ok) resetForm();
  };

  return <>
    <PageHeader eyebrow="ตั้งค่าร้าน" title="วัตถุดิบและต้นทุน" description="กำหน่วย จุดสั่งซื้อ และต้นทุนต่อหน่วย เพื่อให้คำแนะนำมีเหตุผล" action={<Link href="/settings/menu" className="button button-soft"><IconToolsKitchen2 size={15} />ไปเมนูและสูตร</Link>} />
    <div className="settings-grid">
      <SectionCard className="form-card" title="วัตถุดิบทั้งหมด" description={`${state.ingredients.length} รายการ · ยอดคงเหลือคำนวณจาก ledger จริง`}>
        {state.ingredients.length === 0 ? <EmptyState title="ยังไม่มีวัตถุดิบ" description="เพิ่มวัตถุดิบแรกของร้านทางด้านขวา" /> : <div className="setting-list">{state.ingredients.map((ingredient) => <div className={`setting-row ${editingId === ingredient.id ? "setting-row-editing" : ""}`} key={ingredient.id}><div><strong>{ingredient.name}</strong><span>คงเหลือ {ingredient.quantityOnHand} {ingredient.unit} · จุดสั่งซื้อ {ingredient.reorderPoint}{ingredient.supplier ? ` · ${ingredient.supplier}` : ""}</span></div><div className="setting-row-actions"><span className={`recipe-status ${ingredient.quantityOnHand <= 0 ? "missing" : ""}`}><IconPackage size={13} />{ingredient.unitCost.toLocaleString("th-TH")} บาท/{ingredient.unit}</span><button type="button" className="icon-button" aria-label={`แก้ไข ${ingredient.name}`} onClick={() => editIngredient(ingredient.id)}><IconPencil size={15} /></button></div></div>)}</div>}
      </SectionCard>
      <SectionCard className="form-card" title={editingId ? "แก้ไขวัตถุดิบ" : "เพิ่มวัตถุดิบ"} description={editingId ? "แก้ master data ได้โดยไม่เขียนทับ movement เดิม" : "ยอดเริ่มต้นจะสร้าง receipt lot พร้อม audit trail"}>
        <form className="form-grid" onSubmit={submit}>
          <div className="form-field full"><label htmlFor="ingredient-name">ชื่อวัตถุดิบ</label><input id="ingredient-name" className="text-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="เช่น น้ำเชื่อม" maxLength={100} required /></div>
          <CreatableSelect id="ingredient-unit" label="หน่วย" value={unit} options={units} onChange={setUnit} onCreate={(value) => setUnit(value)} />
          <div className="form-field"><label htmlFor="ingredient-supplier">Supplier</label><input id="ingredient-supplier" className="text-input" value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="เช่น ร้านวัตถุดิบ A" maxLength={120} /></div>
          <div className="form-field"><label htmlFor="ingredient-cost">ต้นทุน/หน่วย</label><input id="ingredient-cost" className="text-input" type="number" min="0" step="0.01" value={unitCost} onChange={(event) => setUnitCost(Number(event.target.value))} /></div>
          <div className="form-field"><label htmlFor="ingredient-reorder">จุดสั่งซื้อ</label><input id="ingredient-reorder" className="text-input" type="number" min="0" step="0.001" value={reorderPoint} onChange={(event) => setReorderPoint(Number(event.target.value))} /></div>
          {!editingId && <><div className="form-field"><label htmlFor="ingredient-qty">ยอดเริ่มต้น</label><input id="ingredient-qty" className="text-input" type="number" min="0" step="0.001" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></div><DateField id="ingredient-expiry" label="วันหมดอายุยอดเริ่มต้น (ถ้ามี)" value={openingExpiry} onChange={setOpeningExpiry} /></>}
          <div className="form-actions full"><button type="submit" className="button button-primary" disabled={pending || loading}><IconPlus size={15} />{pending ? "กำลังบันทึก…" : editingId ? "บันทึกการแก้ไข" : "เพิ่มวัตถุดิบ"}</button>{editingId && <button type="button" className="button button-quiet" onClick={resetForm} disabled={pending}><IconX size={15} />ยกเลิก</button>}</div>
        </form>
        {feedback && <div className="capture-feedback" role="status"><IconCheck size={14} />{feedback}</div>}
      </SectionCard>
    </div>
  </>;
}

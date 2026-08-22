"use client";

import Link from "next/link";
import { useState } from "react";
import { IconCheck, IconPackage, IconPlus, IconToolsKitchen2 } from "@tabler/icons-react";
import { useLanlu } from "@/lib/store";
import { EmptyState, PageHeader, SectionCard } from "@/components/ui";

export function IngredientSettings() {
  const { state, addIngredient, loading } = useLanlu();
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<"กก." | "ลิตร" | "ชิ้น" | "ถุง" | "ขวด">("ลิตร");
  const [quantity, setQuantity] = useState(0);
  const [reorderPoint, setReorderPoint] = useState(1);
  const [unitCost, setUnitCost] = useState(0);
  const [openingExpiry, setOpeningExpiry] = useState("");
  const [feedback, setFeedback] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || quantity < 0 || reorderPoint < 0 || unitCost < 0) return;
    setPending(true); setFeedback("");
    const result = await addIngredient({ name: name.trim(), unit, quantityOnHand: quantity, reorderPoint, unitCost, openingExpiry });
    setPending(false); setFeedback(result.message);
    if (result.ok) { setName(""); setQuantity(0); setOpeningExpiry(""); }
  };

  return <>
    <PageHeader eyebrow="ตั้งค่าร้าน" title="วัตถุดิบและต้นทุน" description="กำหน่วย จุดสั่งซื้อ และต้นทุนต่อหน่วย เพื่อให้คำแนะนำมีเหตุผล" action={<Link href="/settings/menu" className="button button-soft"><IconToolsKitchen2 size={15} />ไปเมนูและสูตร</Link>} />
    <div className="settings-grid">
      <SectionCard className="form-card" title="วัตถุดิบทั้งหมด" description={`${state.ingredients.length} รายการ · ยอดคงเหลือคำนวณจาก ledger จริง`}>
        {state.ingredients.length === 0 ? <EmptyState title="ยังไม่มีวัตถุดิบ" description="เพิ่มวัตถุดิบแรกของร้านทางด้านขวา" /> : <div className="setting-list">{state.ingredients.map((ingredient) => <div className="setting-row" key={ingredient.id}><div><strong>{ingredient.name}</strong><span>คงเหลือ {ingredient.quantityOnHand} {ingredient.unit} · จุดสั่งซื้อ {ingredient.reorderPoint}</span></div><span className={`recipe-status ${ingredient.quantityOnHand <= 0 ? "missing" : ""}`}><IconPackage size={13} />{ingredient.unitCost.toLocaleString("th-TH")} บาท/{ingredient.unit}</span></div>)}</div>}
      </SectionCard>
      <SectionCard className="form-card" title="เพิ่มวัตถุดิบ" description="ยอดเริ่มต้นจะสร้าง receipt lot พร้อม audit trail">
        <form className="form-grid" onSubmit={submit}><div className="form-field full"><label htmlFor="ingredient-name">ชื่อวัตถุดิบ</label><input id="ingredient-name" className="text-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="เช่น น้ำเชื่อม" maxLength={100} required /></div><div className="form-field"><label htmlFor="ingredient-unit">หน่วย</label><select id="ingredient-unit" className="select-input" value={unit} onChange={(event) => setUnit(event.target.value as typeof unit)}><option>ลิตร</option><option>กก.</option><option>ชิ้น</option><option>ถุง</option><option>ขวด</option></select></div><div className="form-field"><label htmlFor="ingredient-cost">ต้นทุน/หน่วย</label><input id="ingredient-cost" className="text-input" type="number" min="0" step="0.01" value={unitCost} onChange={(event) => setUnitCost(Number(event.target.value))} /></div><div className="form-field"><label htmlFor="ingredient-qty">ยอดเริ่มต้น</label><input id="ingredient-qty" className="text-input" type="number" min="0" step="0.001" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></div><div className="form-field"><label htmlFor="ingredient-reorder">จุดสั่งซื้อ</label><input id="ingredient-reorder" className="text-input" type="number" min="0" step="0.001" value={reorderPoint} onChange={(event) => setReorderPoint(Number(event.target.value))} /></div><div className="form-field full"><label htmlFor="ingredient-expiry">วันหมดอายุยอดเริ่มต้น (ถ้ามี)</label><input id="ingredient-expiry" className="date-input" type="date" value={openingExpiry} onChange={(event) => setOpeningExpiry(event.target.value)} /></div><div className="form-actions full"><button type="submit" className="button button-primary" disabled={pending || loading}><IconPlus size={15} />{pending ? "กำลังบันทึก…" : "เพิ่มวัตถุดิบ"}</button></div></form>{feedback && <div className="capture-feedback" role="status"><IconCheck size={14} />{feedback}</div>}
      </SectionCard>
    </div>
  </>;
}

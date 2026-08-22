"use client";

import Link from "next/link";
import { useState } from "react";
import { IconCheck, IconPackage, IconPlus, IconToolsKitchen2 } from "@tabler/icons-react";
import { useLanlu } from "@/lib/store";
import { PageHeader, SectionCard } from "@/components/ui";

export function IngredientSettings() {
  const { state, addIngredient } = useLanlu();
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<"กก." | "ลิตร" | "ชิ้น" | "ถุง" | "ขวด">("ลิตร");
  const [quantity, setQuantity] = useState(0);
  const [reorderPoint, setReorderPoint] = useState(1);
  const [unitCost, setUnitCost] = useState(0);
  const [feedback, setFeedback] = useState("");
  const submit = (event: React.FormEvent) => { event.preventDefault(); if (!name.trim()) return; addIngredient({ name: name.trim(), unit, quantityOnHand: quantity, reorderPoint, unitCost }); setName(""); setQuantity(0); setFeedback("เพิ่มวัตถุดิบแล้ว"); };

  return <>
    <PageHeader eyebrow="ตั้งค่าร้าน" title="วัตถุดิบและต้นทุน" description="กำหน่วย, จุดสั่งซื้อ และต้นทุนต่อหน่วยเพื่อให้คำแนะนำมีเหตุผล" action={<Link href="/settings/menu" className="button button-soft"><IconToolsKitchen2 size={15} />ไปเมนูและสูตร</Link>} />
    <div className="settings-grid">
      <SectionCard className="form-card" title="วัตถุดิบทั้งหมด" description={`${state.ingredients.length} รายการ · ต้นทุนใช้ใน recipe snapshot`}>
        <div className="setting-list">{state.ingredients.map((ingredient) => <div className="setting-row" key={ingredient.id}><div><strong>{ingredient.name}</strong><span>คงเหลือ {ingredient.quantityOnHand} {ingredient.unit} · จุดสั่งซื้อ {ingredient.reorderPoint}</span></div><span className="recipe-status"><IconPackage size={13} />{ingredient.unitCost.toLocaleString("th-TH")} บาท/{ingredient.unit}</span></div>)}</div>
      </SectionCard>
      <SectionCard className="form-card" title="เพิ่มวัตถุดิบ" description="เริ่มจากข้อมูลที่รู้ก่อนได้ แล้วเติม lot ภายหลัง">
        <form className="form-grid" onSubmit={submit}><div className="form-field full"><label htmlFor="ingredient-name">ชื่อวัตถุดิบ</label><input id="ingredient-name" className="text-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="เช่น น้ำเชื่อม" required /></div><div className="form-field"><label htmlFor="ingredient-unit">หน่วย</label><select id="ingredient-unit" className="select-input" value={unit} onChange={(event) => setUnit(event.target.value as typeof unit)}><option>ลิตร</option><option>กก.</option><option>ชิ้น</option><option>ถุง</option><option>ขวด</option></select></div><div className="form-field"><label htmlFor="ingredient-cost">ต้นทุน/หน่วย</label><input id="ingredient-cost" className="text-input" type="number" min="0" value={unitCost} onChange={(event) => setUnitCost(Number(event.target.value))} /></div><div className="form-field"><label htmlFor="ingredient-qty">ยอดเริ่มต้น</label><input id="ingredient-qty" className="text-input" type="number" min="0" step="0.01" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></div><div className="form-field"><label htmlFor="ingredient-reorder">จุดสั่งซื้อ</label><input id="ingredient-reorder" className="text-input" type="number" min="0" step="0.01" value={reorderPoint} onChange={(event) => setReorderPoint(Number(event.target.value))} /></div><div className="form-actions full"><button type="submit" className="button button-primary"><IconPlus size={15} />เพิ่มวัตถุดิบ</button></div></form>{feedback && <div className="capture-feedback"><IconCheck size={14} />{feedback}</div>}
      </SectionCard>
    </div>
  </>;
}

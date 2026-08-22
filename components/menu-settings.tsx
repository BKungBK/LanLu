"use client";

import Link from "next/link";
import { useState } from "react";
import { IconBook2, IconCheck, IconPlus, IconReceipt, IconSettings } from "@tabler/icons-react";
import { useLanlu } from "@/lib/store";
import { PageHeader, SectionCard, StatusBadge } from "@/components/ui";

export function MenuSettings() {
  const { state, addMenuItem } = useLanlu();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<"กาแฟ" | "ชา" | "อื่น ๆ">("กาแฟ");
  const [price, setPrice] = useState(80);
  const [feedback, setFeedback] = useState("");
  const submit = (event: React.FormEvent) => { event.preventDefault(); if (!name.trim()) return; addMenuItem({ name: name.trim(), category, price }); setName(""); setPrice(80); setFeedback("เพิ่มเมนูแล้ว"); };

  return <>
    <PageHeader eyebrow="ตั้งค่าร้าน" title="เมนูและสูตร" description="สร้างเมนูของร้าน แล้วค่อยผูกสูตรเพื่อคำนวณต้นทุนและการใช้วัตถุดิบ" action={<Link href="/settings/ingredients" className="button button-soft"><IconSettings size={15} />ไปวัตถุดิบ</Link>} />
    <div className="settings-grid">
      <SectionCard className="form-card" title="เมนูของร้าน" description={`${state.menuItems.length} เมนู · ราคาในยอดขายจะถูก snapshot ตอนบันทึก`}>
        <div className="setting-list">{state.menuItems.map((menu) => { const hasRecipe = state.recipes.some((recipe) => recipe.menuItemId === menu.id); return <div className="setting-row" key={menu.id}><div><strong>{menu.name}</strong><span>{menu.category} · {menu.price.toLocaleString("th-TH")} บาท</span></div><span className={`recipe-status ${hasRecipe ? "" : "missing"}`}>{hasRecipe ? <><IconCheck size={13} />มีสูตรแล้ว</> : <><IconReceipt size={13} />ยังไม่มีสูตร</>}</span></div>; })}</div>
      </SectionCard>
      <SectionCard className="form-card" title="เพิ่มเมนู" description="ข้อมูลขั้นต่ำที่ต้องใช้ใน Quick capture">
        <form className="form-grid" onSubmit={submit}><div className="form-field full"><label htmlFor="menu-name">ชื่อเมนู</label><input id="menu-name" className="text-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="เช่น ชามะนาว" required /></div><div className="form-field"><label htmlFor="menu-category">หมวด</label><select id="menu-category" className="select-input" value={category} onChange={(event) => setCategory(event.target.value as typeof category)}><option>กาแฟ</option><option>ชา</option><option>อื่น ๆ</option></select></div><div className="form-field"><label htmlFor="menu-price">ราคาขาย</label><input id="menu-price" className="text-input" type="number" min="0" value={price} onChange={(event) => setPrice(Number(event.target.value))} /></div><div className="form-actions full"><button type="submit" className="button button-primary"><IconPlus size={15} />เพิ่มเมนู</button></div></form>{feedback && <div className="capture-feedback"><IconCheck size={14} />{feedback}</div>}
        <div className="forecast-note" style={{ marginTop: 18 }}><IconBook2 size={15} />สูตรเมนูจะใช้คำนวณ COGS และตัด stock อัตโนมัติ ถ้ายังไม่ตั้งสูตร ระบบยังบันทึกยอดขายได้</div>
      </SectionCard>
    </div>
  </>;
}

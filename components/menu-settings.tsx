"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { IconBook2, IconCheck, IconPlus, IconSettings, IconToolsKitchen2 } from "@tabler/icons-react";
import { useLanlu } from "@/lib/store";
import type { MenuCategory } from "@/lib/types";
import { EmptyState, PageHeader, SectionCard } from "@/components/ui";

export function MenuSettings() {
  const { state, addMenuItem, saveRecipe, loading } = useLanlu();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<MenuCategory>("กาแฟ");
  const [price, setPrice] = useState(80);
  const [selectedMenuId, setSelectedMenuId] = useState("");
  const [recipeCounts, setRecipeCounts] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => { if (!selectedMenuId && state.menuItems[0]) setSelectedMenuId(state.menuItems[0].id); }, [selectedMenuId, state.menuItems]);
  useEffect(() => { const recipe = state.recipes.find((item) => item.menuItemId === selectedMenuId); setRecipeCounts(Object.fromEntries((recipe?.lines ?? []).map((line) => [line.ingredientId, line.quantity]))); }, [selectedMenuId, state.recipes]);
  const selectedMenu = useMemo(() => state.menuItems.find((menu) => menu.id === selectedMenuId), [selectedMenuId, state.menuItems]);

  const submitMenu = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || price < 0) return;
    setPending(true); setFeedback("");
    const result = await addMenuItem({ name: name.trim(), category, price });
    setPending(false); setFeedback(result.message);
    if (result.ok) { setName(""); setPrice(80); }
  };

  const submitRecipe = async () => {
    if (!selectedMenuId) return;
    const lines = Object.entries(recipeCounts).filter(([, quantity]) => quantity > 0).map(([ingredientId, quantity]) => ({ ingredientId, quantity }));
    setPending(true); setFeedback("");
    const result = await saveRecipe({ menuItemId: selectedMenuId, updatedAt: new Date().toISOString(), lines });
    setPending(false); setFeedback(result.message);
  };

  return <>
    <PageHeader eyebrow="ตั้งค่าร้าน" title="เมนูและสูตร" description="สร้างเมนู แล้วผูกสูตรเพื่อคำนวณต้นทุนและการใช้วัตถุดิบ" action={<Link href="/settings/ingredients" className="button button-soft"><IconToolsKitchen2 size={15} />ไปวัตถุดิบ</Link>} />
    <div className="settings-grid">
      <SectionCard className="form-card" title="เมนูของร้าน" description={`${state.menuItems.length} เมนู · ราคาในยอดขายถูก snapshot ตอนบันทึก`}>
        {state.menuItems.length === 0 ? <EmptyState title="ยังไม่มีเมนู" description="เพิ่มเมนูแรกของร้านทางด้านขวา" /> : <div className="setting-list">{state.menuItems.map((menu) => { const hasRecipe = state.recipes.some((recipe) => recipe.menuItemId === menu.id); return <button type="button" className={`setting-row setting-row-button ${selectedMenuId === menu.id ? "selected" : ""}`} key={menu.id} onClick={() => setSelectedMenuId(menu.id)}><span><strong>{menu.name}</strong><span>{menu.category} · {menu.price.toLocaleString("th-TH")} บาท</span></span><span className={`recipe-status ${hasRecipe ? "" : "missing"}`}>{hasRecipe ? <><IconCheck size={13} />มีสูตรแล้ว</> : <><IconBook2 size={13} />ตั้งสูตร</>}</span></button>; })}</div>}
      </SectionCard>
      <div className="settings-stack">
        <SectionCard className="form-card" title="เพิ่มเมนู" description="ข้อมูลขั้นต่ำที่ใช้ใน Quick capture">
          <form className="form-grid" onSubmit={submitMenu}><div className="form-field full"><label htmlFor="menu-name">ชื่อเมนู</label><input id="menu-name" className="text-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="เช่น ชามะนาว" maxLength={100} required /></div><div className="form-field"><label htmlFor="menu-category">หมวด</label><select id="menu-category" className="select-input" value={category} onChange={(event) => setCategory(event.target.value as MenuCategory)}><option>กาแฟ</option><option>ชา</option><option>อื่น ๆ</option></select></div><div className="form-field"><label htmlFor="menu-price">ราคาขาย</label><input id="menu-price" className="text-input" type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(Number(event.target.value))} /></div><div className="form-actions full"><button type="submit" className="button button-primary" disabled={pending || loading}><IconPlus size={15} />เพิ่มเมนู</button></div></form>
          {feedback && <div className="capture-feedback" role="status"><IconCheck size={14} />{feedback}</div>}
        </SectionCard>
        <SectionCard className="form-card recipe-editor" title={selectedMenu ? `สูตร${selectedMenu.name}` : "ตั้งสูตรเมนู"} description={selectedMenu ? "ใส่ปริมาณต่อ 1 แก้ว ระบบจะใช้ต้นทุนและตัด stock อัตโนมัติ" : "เลือกเมนูเพื่อเริ่มตั้งสูตร"}>
          {!selectedMenu ? <EmptyState title="เลือกเมนูก่อน" description="สูตรจะผูกกับเมนูที่เลือก" /> : state.ingredients.length === 0 ? <EmptyState title="ยังไม่มีวัตถุดิบ" description="เพิ่มวัตถุดิบก่อนตั้งสูตร" actionHref="/settings/ingredients" actionLabel="ไปเพิ่มวัตถุดิบ" /> : <><div className="recipe-lines">{state.ingredients.map((ingredient) => <div className="recipe-line" key={ingredient.id}><label htmlFor={`recipe-${ingredient.id}`}>{ingredient.name}<small>ต่อ 1 แก้ว · {ingredient.unit}</small></label><input id={`recipe-${ingredient.id}`} className="text-input" type="number" min="0" step="0.001" value={recipeCounts[ingredient.id] ?? ""} onChange={(event) => setRecipeCounts((current) => ({ ...current, [ingredient.id]: Number(event.target.value) }))} placeholder="0" /></div>)}</div><div className="form-actions"><button type="button" className="button button-primary" onClick={submitRecipe} disabled={pending || loading}>บันทึกสูตร</button></div></>}
        </SectionCard>
      </div>
    </div>
  </>;
}

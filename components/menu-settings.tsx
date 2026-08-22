"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { IconArchive, IconBook2, IconCheck, IconPencil, IconPlus, IconRestore, IconToolsKitchen2, IconTrash, IconX } from "@tabler/icons-react";
import { useLanlu } from "@/lib/store";
import type { MenuCategory } from "@/lib/types";
import { DEFAULT_MENU_CATEGORIES } from "@/lib/catalog";
import { CreatableSelect } from "@/components/form-controls";
import { EmptyState, PageHeader, SectionCard } from "@/components/ui";

export function MenuSettings() {
  const { state, addMenuItem, updateMenuItem, createMenuCategory, saveRecipe, archiveCatalogItem, restoreCatalogItem, deleteCatalogItem, archiveRecipe, loading } = useLanlu();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<MenuCategory>("กาแฟ");
  const [price, setPrice] = useState(80);
  const [active, setActive] = useState(true);
  const [selectedMenuId, setSelectedMenuId] = useState("");
  const [recipeCounts, setRecipeCounts] = useState<Record<string, number>>({});
  const [recipeIngredientId, setRecipeIngredientId] = useState("");
  const [feedback, setFeedback] = useState("");
  const [pending, setPending] = useState(false);
  const [catalogFilter, setCatalogFilter] = useState<"all" | "active" | "archived">("active");
  const categories = useMemo(() => Array.from(new Set([...DEFAULT_MENU_CATEGORIES, ...state.menuItems.map((menu) => menu.category), category])), [category, state.menuItems]);
  const recipeIngredients = useMemo(() => state.ingredients.filter((ingredient) => (recipeCounts[ingredient.id] ?? 0) > 0), [recipeCounts, state.ingredients]);
  const visibleMenus = useMemo(() => state.menuItems.filter((menu) => catalogFilter === "all" || (catalogFilter === "active" ? !menu.archivedAt : Boolean(menu.archivedAt))), [catalogFilter, state.menuItems]);

  useEffect(() => { if (!selectedMenuId && visibleMenus[0]) setSelectedMenuId(visibleMenus[0].id); }, [selectedMenuId, visibleMenus]);
  useEffect(() => { const recipe = state.recipes.find((item) => item.menuItemId === selectedMenuId); setRecipeCounts(Object.fromEntries((recipe?.lines ?? []).map((line) => [line.ingredientId, line.quantity]))); }, [selectedMenuId, state.recipes]);
  const selectedMenu = useMemo(() => state.menuItems.find((menu) => menu.id === selectedMenuId), [selectedMenuId, state.menuItems]);

  const resetMenuForm = () => { setEditingId(null); setName(""); setCategory("กาแฟ"); setPrice(80); setActive(true); };
  const editMenu = (menuId: string) => { const menu = state.menuItems.find((item) => item.id === menuId); if (!menu) return; setEditingId(menu.id); setName(menu.name); setCategory(menu.category); setPrice(menu.price); setActive(menu.active); setFeedback(""); };
  const handleCreateCategory = async (value: string) => { const result = await createMenuCategory(value); if (!result.ok) setFeedback(result.message); setCategory(value); };

  const submitMenu = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || price < 0) return;
    setPending(true); setFeedback("");
    const result = editingId ? await updateMenuItem({ id: editingId, name: name.trim(), category, price, active }) : await addMenuItem({ name: name.trim(), category, price });
    setPending(false); setFeedback(result.message);
    if (result.ok) resetMenuForm();
  };

  const submitRecipe = async () => {
    if (!selectedMenuId) return;
    const lines = Object.entries(recipeCounts).filter(([, quantity]) => quantity > 0).map(([ingredientId, quantity]) => ({ ingredientId, quantity }));
    setPending(true); setFeedback("");
    const result = await saveRecipe({ menuItemId: selectedMenuId, updatedAt: new Date().toISOString(), lines });
    setPending(false); setFeedback(result.message);
  };
  const archiveMenu = async (id: string, menuName: string) => {
    const salesCount = state.sales.filter((sale) => sale.lines.some((line) => line.menuItemId === id)).length;
    const hasRecipe = state.recipes.some((recipe) => recipe.menuItemId === id);
    if (!window.confirm(`เก็บเมนู “${menuName}” ออกจากรายการ?\n\n${salesCount ? `มี ${salesCount} รายการขายย้อนหลัง` : "ยังไม่มียอดขายย้อนหลัง"} · ${hasRecipe ? "มีสูตรที่ใช้งานอยู่" : "ยังไม่มีสูตรที่ใช้งานอยู่"}\nประวัติทั้งหมดจะยังอยู่และไม่ถูกลบ`)) return;
    setPending(true); setFeedback("");
    const result = await archiveCatalogItem("menu", id);
    setPending(false); setFeedback(result.message);
    if (result.ok && selectedMenuId === id) setSelectedMenuId("");
  };
  const restoreMenu = async (id: string) => {
    setPending(true); setFeedback("");
    const result = await restoreCatalogItem("menu", id);
    setPending(false); setFeedback(result.message);
  };
  const deleteMenu = async (id: string, menuName: string) => {
    if (!window.confirm(`ลบ “${menuName}” ถาวร?\n\nทำได้เฉพาะเมนูที่ไม่มีสูตรหรือยอดขายย้อนหลัง ระบบจะเก็บ audit event การลบไว้`)) return;
    setPending(true); setFeedback("");
    const result = await deleteCatalogItem("menu", id);
    setPending(false); setFeedback(result.message);
    if (result.ok && selectedMenuId === id) { setSelectedMenuId(""); resetMenuForm(); }
  };
  const archiveSelectedRecipe = async () => {
    if (!selectedMenu) return;
    if (!window.confirm(`เก็บสูตรเวอร์ชันล่าสุดของ “${selectedMenu.name}” ออกจากการใช้งาน? สูตรเก่าจะยังอยู่ใน audit trail`)) return;
    setPending(true); setFeedback("");
    const result = await archiveRecipe(selectedMenu.id);
    setPending(false); setFeedback(result.message);
  };

  return <>
    <PageHeader eyebrow="Catalog" title="เมนู" description="สร้างเมนูและใส่สูตรไว้ในรายการเดียว เพื่อคำนวณต้นทุนและการใช้วัตถุดิบ" action={<Link href="/inventory" className="button button-soft"><IconToolsKitchen2 size={15} />ไปวัตถุดิบ</Link>} />
    <div className="settings-grid">
      <SectionCard className="form-card" title="เมนูของร้าน" description={`${visibleMenus.length} เมนู · ราคาในยอดขายถูก snapshot ตอนบันทึก`}>
        <div className="inventory-filters catalog-filters" aria-label="สถานะเมนู"><button type="button" className={`filter-button ${catalogFilter === "active" ? "active" : ""}`} onClick={() => setCatalogFilter("active")}>ใช้งานอยู่</button><button type="button" className={`filter-button ${catalogFilter === "all" ? "active" : ""}`} onClick={() => setCatalogFilter("all")}>ทั้งหมด</button><button type="button" className={`filter-button ${catalogFilter === "archived" ? "active" : ""}`} onClick={() => setCatalogFilter("archived")}>เก็บแล้ว</button></div>
        {visibleMenus.length === 0 ? <EmptyState title="ยังไม่มีเมนูในมุมมองนี้" description="เพิ่มเมนูใหม่ หรือเปลี่ยนตัวกรองเพื่อดูรายการที่เก็บแล้ว" /> : <div className="setting-list">{visibleMenus.map((menu) => { const archived = Boolean(menu.archivedAt); const hasRecipe = state.recipes.some((recipe) => recipe.menuItemId === menu.id); return <div className={`setting-row ${selectedMenuId === menu.id ? "setting-row-selected" : ""}`} key={menu.id}><button type="button" className="setting-row-main" onClick={() => setSelectedMenuId(menu.id)} disabled={pending}><span><strong>{menu.name}</strong><span>{menu.category} · {menu.price.toLocaleString("th-TH")} บาท · {archived ? "เก็บแล้ว" : menu.active ? "เปิดขาย" : "พักขาย"}</span></span><span className={`recipe-status ${hasRecipe ? "" : "missing"}`}>{hasRecipe ? <><IconCheck size={13} />มีสูตรแล้ว</> : <><IconBook2 size={13} />ตั้งสูตร</>}</span></button><div className="setting-row-actions">{!archived && <button type="button" className="action-button" title={`แก้ไข ${menu.name}`} aria-label={`แก้ไข ${menu.name}`} onClick={() => editMenu(menu.id)} disabled={pending}><IconPencil size={15} /><span className="action-button-label">แก้ไข</span></button>}{archived ? <><button type="button" className="action-button" title={`เลิกเก็บ ${menu.name}`} aria-label={`เลิกเก็บ ${menu.name}`} onClick={() => void restoreMenu(menu.id)} disabled={pending}><IconRestore size={15} /><span className="action-button-label">เลิกเก็บ</span></button><button type="button" className="action-button action-button-danger" title={`ลบ ${menu.name} ถาวร`} aria-label={`ลบ ${menu.name} ถาวร`} onClick={() => void deleteMenu(menu.id, menu.name)} disabled={pending}><IconTrash size={15} /><span className="action-button-label">ลบ</span></button></> : <button type="button" className="action-button action-button-danger" title={`เก็บ ${menu.name} ออกจากรายการ`} aria-label={`เก็บ ${menu.name} ออกจากรายการ`} onClick={() => void archiveMenu(menu.id, menu.name)} disabled={pending}><IconArchive size={15} /><span className="action-button-label">เก็บออก</span></button>}</div></div>; })}</div>}
      </SectionCard>
      <div className="settings-stack">
        <SectionCard className="form-card" title={editingId ? "แก้ไขเมนู" : "เพิ่มเมนู"} description={editingId ? "ราคาใหม่ใช้กับยอดขายครั้งต่อไป ส่วนรายการเดิมยังคง snapshot" : "ข้อมูลขั้นต่ำที่ใช้ใน Quick capture"}>
          <form className="form-grid" onSubmit={submitMenu}>
            <div className="form-field full"><label htmlFor="menu-name">ชื่อเมนู</label><input id="menu-name" className="text-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="เช่น ชามะนาว" maxLength={100} required /></div>
            <CreatableSelect id="menu-category" label="หมวด" value={category} options={categories} onChange={setCategory} onCreate={handleCreateCategory} />
            <div className="form-field"><label htmlFor="menu-price">ราคาขาย</label><input id="menu-price" className="text-input" type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(Number(event.target.value))} /></div>
            {editingId && <label className="check-field"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /><span><strong>เปิดขายใน Quick capture</strong><small>ปิดชั่วคราวได้ โดยไม่ลบประวัติยอดขาย</small></span></label>}
            <div className="form-actions full"><button type="submit" className="button button-primary" disabled={pending || loading}><IconPlus size={15} />{pending ? "กำลังบันทึก…" : editingId ? "บันทึกการแก้ไข" : "เพิ่มเมนู"}</button>{editingId && <button type="button" className="button button-quiet" onClick={resetMenuForm} disabled={pending}><IconX size={15} />ยกเลิก</button>}</div>
          </form>
          {feedback && <div className="capture-feedback" role="status"><IconCheck size={14} />{feedback}</div>}
        </SectionCard>
        <SectionCard className="form-card recipe-editor menu-recipe-section" title={selectedMenu ? `สูตรในเมนู ${selectedMenu.name}` : "สูตรในเมนู"} description={selectedMenu ? "สูตรเป็นส่วนหนึ่งของเมนูนี้ · แก้ไขแล้วระบบจะเก็บ version เดิมไว้" : "เลือกเมนูเพื่อเพิ่มสูตรในรายการเดียวกัน"}>
          {!selectedMenu ? <EmptyState title="เลือกเมนูก่อน" description="สูตรจะผูกกับเมนูที่เลือก" /> : state.ingredients.length === 0 ? <EmptyState title="ยังไม่มีวัตถุดิบ" description="เพิ่มวัตถุดิบก่อนตั้งสูตร" actionHref="/settings/ingredients" actionLabel="ไปเพิ่มวัตถุดิบ" /> : <>
            <CreatableSelect id="recipe-ingredient" label="เพิ่มวัตถุดิบในสูตร" value={recipeIngredientId} options={state.ingredients.filter((ingredient) => ingredient.active !== false && !recipeCounts[ingredient.id]).map((ingredient) => ingredient.name)} onChange={(ingredientName) => { const ingredient = state.ingredients.find((item) => item.active !== false && item.name === ingredientName); if (ingredient) { setRecipeCounts((current) => ({ ...current, [ingredient.id]: 0.001 })); setRecipeIngredientId(""); } }} placeholder="เลือกวัตถุดิบ" />
            <div className="recipe-lines">{recipeIngredients.map((ingredient) => <div className="recipe-line" key={ingredient.id}><label htmlFor={`recipe-${ingredient.id}`}>{ingredient.name}<small>ต่อ 1 แก้ว · {ingredient.unit}</small></label><input id={`recipe-${ingredient.id}`} className="text-input" type="number" min="0" step="0.001" value={recipeCounts[ingredient.id] ?? ""} onChange={(event) => setRecipeCounts((current) => ({ ...current, [ingredient.id]: Number(event.target.value) }))} placeholder="0" /><button type="button" className="action-button action-button-danger recipe-line-delete" aria-label={`ลบ ${ingredient.name} จากสูตร`} onClick={() => setRecipeCounts((current) => { const next = { ...current }; delete next[ingredient.id]; return next; })}><IconTrash size={15} /><span className="action-button-label">ลบ</span></button></div>)}</div>
            {!recipeIngredients.length && <p className="form-hint">ยังไม่มีวัตถุดิบในสูตร เพิ่มจากตัวเลือกด้านบน</p>}
            <div className="form-actions"><button type="button" className="button button-primary" onClick={submitRecipe} disabled={pending || loading}><IconCheck size={15} />บันทึกสูตร version ใหม่</button>{state.recipes.some((recipe) => recipe.menuItemId === selectedMenu.id) && <button type="button" className="button button-quiet button-danger" onClick={() => void archiveSelectedRecipe()} disabled={pending || loading}><IconArchive size={15} />เก็บสูตรล่าสุด</button>}</div>
          </>}
        </SectionCard>
      </div>
    </div>
  </>;
}

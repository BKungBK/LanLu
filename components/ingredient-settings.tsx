"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { IconArchive, IconCheck, IconPackage, IconPencil, IconPlus, IconToolsKitchen2, IconX } from "@tabler/icons-react";
import { useLanlu } from "@/lib/store";
import type { IngredientPurchaseInfo, IngredientUnit } from "@/lib/types";
import { calculatePurchaseUnitCost, DEFAULT_INGREDIENT_UNITS, formatPurchaseCostPreview } from "@/lib/catalog";
import { CreatableSelect, DateField } from "@/components/form-controls";
import { EmptyState, PageHeader, SectionCard } from "@/components/ui";

export function IngredientSettings() {
  const { state, addIngredient, updateIngredient, archiveCatalogItem, loading } = useLanlu();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<IngredientUnit>("ลิตร");
  const [supplier, setSupplier] = useState("");
  const [quantity, setQuantity] = useState(0);
  const [reorderPoint, setReorderPoint] = useState(1);
  const [unitCost, setUnitCost] = useState(0);
  const [packageUnit, setPackageUnit] = useState("");
  const [packageCount, setPackageCount] = useState(1);
  const [contentQuantity, setContentQuantity] = useState(0);
  const [contentUnit, setContentUnit] = useState("");
  const [purchasePrice, setPurchasePrice] = useState(0);
  const [conversionFactor, setConversionFactor] = useState(0);
  const [openingExpiry, setOpeningExpiry] = useState("");
  const [feedback, setFeedback] = useState("");
  const [pending, setPending] = useState(false);
  const units = useMemo(() => Array.from(new Set([...DEFAULT_INGREDIENT_UNITS, ...state.ingredients.map((ingredient) => ingredient.unit), unit])), [state.ingredients, unit]);
  const activeIngredients = useMemo(() => state.ingredients.filter((ingredient) => ingredient.active !== false), [state.ingredients]);

  const resetForm = () => { setEditingId(null); setName(""); setUnit("ลิตร"); setSupplier(""); setQuantity(0); setReorderPoint(1); setUnitCost(0); setPackageUnit(""); setPackageCount(1); setContentQuantity(0); setContentUnit(""); setPurchasePrice(0); setConversionFactor(0); setOpeningExpiry(""); };
  const editIngredient = (id: string) => { const ingredient = state.ingredients.find((item) => item.id === id); if (!ingredient) return; const purchase = ingredient.purchase; setEditingId(id); setName(ingredient.name); setUnit(ingredient.unit); setSupplier(ingredient.supplier ?? ""); setReorderPoint(ingredient.reorderPoint); setUnitCost(ingredient.unitCost); setPackageUnit(purchase?.packageUnit ?? ""); setPackageCount(purchase?.packageCount ?? 1); setContentQuantity(purchase?.contentQuantity ?? 0); setContentUnit(purchase?.contentUnit ?? ingredient.unit); setPurchasePrice(purchase?.purchasePrice ?? 0); setConversionFactor(purchase?.conversionFactor ?? 0); setQuantity(0); setOpeningExpiry(""); setFeedback(""); };

  const purchaseInput = { packageUnit, packageCount, contentQuantity, contentUnit: contentUnit || unit, purchasePrice, conversionFactor: conversionFactor > 0 ? conversionFactor : undefined };
  const calculatedUnitCost = calculatePurchaseUnitCost(purchaseInput, unit);
  const purchase: IngredientPurchaseInfo = { ...purchaseInput, unitCost: calculatedUnitCost ?? unitCost };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || quantity < 0 || reorderPoint < 0 || unitCost < 0) return;
    setPending(true); setFeedback("");
    const hasPurchase = Boolean(packageUnit.trim() && packageCount > 0 && contentQuantity > 0 && purchasePrice >= 0);
    const result = editingId
      ? await updateIngredient({ id: editingId, name: name.trim(), unit, supplier: supplier.trim(), reorderPoint, unitCost: calculatedUnitCost ?? unitCost, purchase })
      : await addIngredient({ name: name.trim(), unit, supplier: supplier.trim(), quantityOnHand: quantity, reorderPoint, unitCost: calculatedUnitCost ?? unitCost, purchase: hasPurchase ? purchase : undefined, openingExpiry });
    setPending(false); setFeedback(result.message);
    if (result.ok) resetForm();
  };
  const archiveIngredient = async (id: string, ingredientName: string) => {
    if (!window.confirm(`เก็บวัตถุดิบ “${ingredientName}” ออกจากรายการ? ประวัติสต๊อกและสูตรเดิมจะยังอยู่`)) return;
    setPending(true); setFeedback("");
    const result = await archiveCatalogItem("ingredient", id);
    setPending(false); setFeedback(result.message);
    if (result.ok && editingId === id) resetForm();
  };

  return <>
    <PageHeader eyebrow="Catalog" title="วัตถุดิบและต้นทุน" description="หน่วย จุดสั่งซื้อ และต้นทุนต่อหน่วย · จุดหลักในการจัดการอยู่ที่หน้า Inventory" action={<Link href="/inventory" className="button button-soft"><IconToolsKitchen2 size={15} />ไปสต๊อก</Link>} />
    <div className="settings-grid">
      <SectionCard className="form-card" title="วัตถุดิบทั้งหมด" description={`${activeIngredients.length} รายการ · ยอดคงเหลือคำนวณจาก ledger จริง`}>
        {activeIngredients.length === 0 ? <EmptyState title="ยังไม่มีวัตถุดิบ" description="เพิ่มวัตถุดิบแรกของร้านที่หน้า Inventory" actionHref="/inventory" actionLabel="ไปสต๊อก" /> : <div className="setting-list">{activeIngredients.map((ingredient) => <div className={`setting-row ${editingId === ingredient.id ? "setting-row-editing" : ""}`} key={ingredient.id}><div><strong>{ingredient.name}</strong><span>คงเหลือ {ingredient.quantityOnHand} {ingredient.unit} · จุดสั่งซื้อ {ingredient.reorderPoint}{ingredient.supplier ? ` · ${ingredient.supplier}` : ""}</span></div><div className="setting-row-actions"><span className={`recipe-status ${ingredient.quantityOnHand <= 0 ? "missing" : ""}`}><IconPackage size={13} />{ingredient.unitCost.toLocaleString("th-TH")} บาท/{ingredient.unit}</span><button type="button" className="action-button" aria-label={`แก้ไข ${ingredient.name}`} onClick={() => editIngredient(ingredient.id)} disabled={pending}><IconPencil size={15} /><span className="action-button-label">แก้ไข</span></button><button type="button" className="action-button action-button-danger" aria-label={`เก็บ ${ingredient.name} ออกจากรายการ`} onClick={() => void archiveIngredient(ingredient.id, ingredient.name)} disabled={pending}><IconArchive size={15} /><span className="action-button-label">เก็บออก</span></button></div></div>)}</div>}
      </SectionCard>
      <SectionCard className="form-card" title={editingId ? "แก้ไขวัตถุดิบ" : "เพิ่มวัตถุดิบ"} description={editingId ? "แก้ master data ได้โดยไม่เขียนทับ movement เดิม" : "ยอดเริ่มต้นจะสร้าง receipt lot พร้อม audit trail"}>
        <form className="form-grid" onSubmit={submit}>
          <div className="form-field full"><label htmlFor="ingredient-name">ชื่อวัตถุดิบ</label><input id="ingredient-name" className="text-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="เช่น น้ำเชื่อม" maxLength={100} required /></div>
          <CreatableSelect id="ingredient-unit" label="หน่วย" value={unit} options={units} onChange={setUnit} onCreate={(value) => setUnit(value)} />
          <div className="form-field"><label htmlFor="ingredient-supplier">Supplier</label><input id="ingredient-supplier" className="text-input" value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="เช่น ร้านวัตถุดิบ A" maxLength={120} /></div>
          <div className="form-field"><label htmlFor="ingredient-cost">ต้นทุน/หน่วย</label><input id="ingredient-cost" className="text-input" type="number" min="0" step="0.000001" value={calculatedUnitCost ?? unitCost} onChange={(event) => setUnitCost(Number(event.target.value))} readOnly={calculatedUnitCost !== null} /><small className="form-hint">คำนวณจากแพ็กซื้อเมื่อข้อมูลครบ</small></div>
          <div className="form-field full package-cost-field"><strong>แพ็กซื้อ (ใช้คำนวณต้นทุนอัตโนมัติ)</strong><span className="form-hint">รองรับ g/kg, ml/L, ชิ้น หรือใส่อัตราแปลงเองเมื่อหน่วยไม่มาตรฐาน</span><div className="package-cost-grid"><div className="form-field"><label htmlFor="package-unit">หน่วยแพ็ก</label><input id="package-unit" className="text-input" value={packageUnit} onChange={(event) => setPackageUnit(event.target.value)} placeholder="ขวด / ถุง / แพ็ค" /></div><div className="form-field"><label htmlFor="package-count">จำนวนแพ็ก</label><input id="package-count" className="text-input" type="number" min="0" step="0.001" value={packageCount} onChange={(event) => setPackageCount(Number(event.target.value))} /></div><div className="form-field"><label htmlFor="content-quantity">ปริมาณต่อแพ็ก</label><input id="content-quantity" className="text-input" type="number" min="0" step="0.001" value={contentQuantity} onChange={(event) => setContentQuantity(Number(event.target.value))} /></div><div className="form-field"><label htmlFor="content-unit">หน่วยในแพ็ก</label><input id="content-unit" className="text-input" value={contentUnit} onChange={(event) => setContentUnit(event.target.value)} placeholder={unit} /></div><div className="form-field"><label htmlFor="purchase-price">ราคารวมแพ็ก</label><input id="purchase-price" className="text-input" type="number" min="0" step="0.01" value={purchasePrice} onChange={(event) => setPurchasePrice(Number(event.target.value))} /></div><div className="form-field"><label htmlFor="conversion-factor">อัตราแปลง (ถ้ามี)</label><input id="conversion-factor" className="text-input" type="number" min="0" step="0.000001" value={conversionFactor} onChange={(event) => setConversionFactor(Number(event.target.value))} placeholder="เช่น 1000" /></div></div>{(packageUnit || contentQuantity > 0 || purchasePrice > 0) && <div className={`purchase-preview ${calculatedUnitCost === null ? "invalid" : ""}`}>{formatPurchaseCostPreview(purchase, unit)} </div>}</div>
          <div className="form-field"><label htmlFor="ingredient-reorder">จุดสั่งซื้อ</label><input id="ingredient-reorder" className="text-input" type="number" min="0" step="0.001" value={reorderPoint} onChange={(event) => setReorderPoint(Number(event.target.value))} /></div>
          {!editingId && <><div className="form-field"><label htmlFor="ingredient-qty">ยอดเริ่มต้น</label><input id="ingredient-qty" className="text-input" type="number" min="0" step="0.001" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></div><DateField id="ingredient-expiry" label="วันหมดอายุยอดเริ่มต้น (ถ้ามี)" value={openingExpiry} onChange={setOpeningExpiry} /></>}
          <div className="form-actions full"><button type="submit" className="button button-primary" disabled={pending || loading}><IconPlus size={15} />{pending ? "กำลังบันทึก…" : editingId ? "บันทึกการแก้ไข" : "เพิ่มวัตถุดิบ"}</button>{editingId && <button type="button" className="button button-quiet" onClick={resetForm} disabled={pending}><IconX size={15} />ยกเลิก</button>}</div>
        </form>
        {feedback && <div className="capture-feedback" role="status"><IconCheck size={14} />{feedback}</div>}
      </SectionCard>
    </div>
  </>;
}

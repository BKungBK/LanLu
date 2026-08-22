"use client";

import Link from "next/link";
import { IconAlertTriangle, IconCalendarDue, IconClipboardCheck, IconPackage, IconPackageImport, IconPlus } from "@tabler/icons-react";
import { DEMO_TODAY } from "@/lib/data";
import { getDaysUntil, getStockStatus } from "@/lib/calculations";
import { useLanlu } from "@/lib/store";
import { DatePill, PageHeader, SectionCard, StatusBadge } from "@/components/ui";

export function InventoryPage() {
  const { state } = useLanlu();
  const sorted = [...state.ingredients].sort((a, b) => {
    const priority = { critical: 0, warning: 1, normal: 2 };
    return priority[getStockStatus(a)] - priority[getStockStatus(b)];
  });
  const expiring = state.ingredients.filter((ingredient) => { const days = getDaysUntil(ingredient.nearestExpiry, new Date(`${DEMO_TODAY}T12:00:00+07:00`)); return days !== undefined && days <= 7; }).sort((a, b) => (getDaysUntil(a.nearestExpiry, new Date(`${DEMO_TODAY}T12:00:00+07:00`)) ?? 99) - (getDaysUntil(b.nearestExpiry, new Date(`${DEMO_TODAY}T12:00:00+07:00`)) ?? 99));

  return <>
    <PageHeader eyebrow="วัตถุดิบ" title="สต๊อกที่ต้องรู้" description="ยอดคงเหลือ, จุดสั่งซื้อ และวันหมดอายุจาก ledger เดียวกัน" action={<><DatePill /><Link href="/capture" className="button button-primary"><IconPlus size={15} />รับวัตถุดิบ</Link></>} />
    <div className="inventory-layout">
      <SectionCard className="inventory-table" title="วัตถุดิบทั้งหมด" description={`${state.ingredients.length} รายการ · สต๊อกติดลบได้เพื่อไม่บล็อกการขาย`}>
        <div>{sorted.map((ingredient) => { const status = getStockStatus(ingredient); const ratio = Math.min(100, Math.max(7, ingredient.quantityOnHand / Math.max(ingredient.reorderPoint * 2, 1) * 100)); return <div className="inventory-item" key={ingredient.id}><div className="inventory-name"><strong>{ingredient.name}</strong><span>{ingredient.supplier ?? "ยังไม่ระบุ supplier"}</span></div><div className="stock-level"><span>คงเหลือ</span><strong>{ingredient.quantityOnHand} {ingredient.unit}</strong><div className="stock-line"><i className={status} style={{ width: `${ratio}%` }} /></div></div><div className="stock-level"><span>จุดสั่งซื้อ</span><strong>{ingredient.reorderPoint} {ingredient.unit}</strong></div><StatusBadge status={status} /></div>; })}</div>
        <div className="inventory-legend"><span className="legend"><i style={{ background: "var(--sage)" }} />ปกติ</span><span className="legend"><i className="warning" />เฝ้าระวัง</span><span className="legend"><i className="critical" />ต้องจัดการ</span></div>
      </SectionCard>
      <div>
        <SectionCard className="expiry-card" title="ใกล้หมดอายุ" description="FEFO: ใช้ล็อตที่หมดอายุก่อนก่อน">
          {expiring.length ? expiring.map((ingredient) => { const days = getDaysUntil(ingredient.nearestExpiry, new Date(`${DEMO_TODAY}T12:00:00+07:00`)) ?? 0; return <div className="expiry-item" key={ingredient.id}><span className="expiry-icon"><IconCalendarDue size={18} stroke={1.8} /></span><div><strong>{ingredient.name}</strong><span>เหลือ {ingredient.quantityOnHand} {ingredient.unit} · {days <= 0 ? "หมดอายุแล้ว" : `หมดอายุใน ${days} วัน`}</span></div></div>; }) : <div className="empty-state"><div className="empty-mark"><IconPackage size={22} /></div><h3>ยังไม่มีรายการเร่งด่วน</h3><p>วัตถุดิบทั้งหมดมีวันหมดอายุห่างพอ</p></div>}
        </SectionCard>
        <SectionCard className="expiry-card" title="ทางลัดการบันทึก" description="ทุก movement เก็บผู้บันทึก เวลา และหมายเหตุใน production">
          <div className="help-list"><div className="expiry-item"><span className="expiry-icon"><IconPackageImport size={18} stroke={1.8} /></span><div><strong>รับของเข้า</strong><span>เพิ่ม lot และวันหมดอายุผ่าน Quick capture</span></div></div><div className="expiry-item"><span className="expiry-icon"><IconClipboardCheck size={18} stroke={1.8} /></span><div><strong>นับสต๊อกจริง</strong><span>ใช้ adjustment เพื่อรักษา audit trail</span></div></div></div>
          <Link href="/capture" className="button button-soft" style={{ width: "100%", marginTop: 14 }}><IconPlus size={15} />เปิด Quick capture</Link>
        </SectionCard>
      </div>
    </div>
  </>;
}

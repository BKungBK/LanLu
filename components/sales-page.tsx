"use client";

import Link from "next/link";
import { IconArrowUpRight, IconChartBar, IconCoins, IconCup, IconReceipt } from "@tabler/icons-react";
import { aggregateSalesByDay, formatCurrency, getDateRange, getGrossProfit, getMenuSales, getRevenue, getSaleUnits, getTodayInTimezone } from "@/lib/calculations";
import { useLanlu } from "@/lib/store";
import { DatePill, KpiCard, MiniLink, PageHeader, SectionCard } from "@/components/ui";

const dayLabel = (date: string) => new Intl.DateTimeFormat("th-TH", { weekday: "short", day: "numeric" }).format(new Date(`${date}T12:00:00+07:00`));

export function SalesPage() {
  const { state, hydrated } = useLanlu();
  const today = hydrated ? getTodayInTimezone(state.shop.timezone) : "2000-01-01";
  const dates = getDateRange(today);
  const chart = aggregateSalesByDay(state.sales, dates);
  const units = getSaleUnits(state.sales);
  const revenue = getRevenue(state.sales);
  const grossProfit = getGrossProfit(state.sales);
  const menuSales = getMenuSales(state.sales, state.menuItems);
  const max = Math.max(...chart.map((item) => item.units), 1);
  const recent = [...state.sales].reverse().slice(0, 6);

  if (!hydrated) return <>
    <PageHeader eyebrow="ยอดขาย" title="กำลังเตรียมยอดขาย" description="กำลังโหลดข้อมูลยอดขายที่ยืนยันแล้ว" />
    <SectionCard title="กำลังโหลดข้อมูล" description="รอสักครู่ ระบบกำลังเตรียมรายงานยอดขายล่าสุด">
      <div className="data-loading" role="status">กำลังโหลดข้อมูลร้าน…</div>
    </SectionCard>
  </>;

  return <>
    <PageHeader eyebrow="ยอดขาย" title="ยอดขายของร้าน" description="ดูยอดขายที่ยืนยันแล้ว พร้อม snapshot ราคาและต้นทุนย้อนหลัง" action={<><DatePill /><Link href="/capture" className="button button-primary"><IconReceipt size={15} />บันทึกยอดขาย</Link></>} />
    <div className="kpi-grid">
      <KpiCard label="ยอดขายสะสม" value={formatCurrency(revenue)} detail="จากข้อมูลที่มีในระบบ" tone="up" icon={<IconCoins size={16} />} />
      <KpiCard label="จำนวนแก้ว" value={`${units} แก้ว`} detail="รวมทุกเมนู" tone="neutral" icon={<IconCup size={16} />} />
      <KpiCard label="กำไรขั้นต้นโดยประมาณ" value={formatCurrency(grossProfit)} detail="ใช้ต้นทุนจาก recipe snapshot" tone="up" icon={<IconChartBar size={16} />} />
      <KpiCard label="เมนูขายดี" value={menuSales[0]?.name ?? "—"} detail={menuSales[0] ? `${menuSales[0].units} แก้ว` : "ยังไม่มีข้อมูล"} tone="neutral" icon={<IconArrowUpRight size={16} />} />
    </div>
    <SectionCard title="แนวโน้มจำนวนแก้ว" description="7 วันล่าสุด · ใช้ยอดจริงที่คุณบันทึก" action={<span className="status-badge status-info">ข้อมูลจริง</span>}>
      <div className="sales-chart sales-chart-large" role="img" aria-label="แนวโน้มจำนวนแก้ว 7 วันล่าสุด">{chart.map((item, index) => <div className="bar-column" key={item.date}><span className="bar-value">{item.units}</span><div className="bar-track"><div className={`bar-fill ${index >= 5 ? "peak" : ""}`} style={{ height: `${Math.max(8, item.units / max * 100)}%` }} /></div><span className="bar-label">{dayLabel(item.date)}</span></div>)}</div>
      <div className="chart-legend"><span className="legend"><i />จำนวนแก้ว</span><span className="legend peak"><i />วันที่สูงกว่าค่าเฉลี่ย</span></div>
    </SectionCard>
    <div className="dashboard-row sales-bottom-row">
      <SectionCard title="เมนูทั้งหมด" description="จัดอันดับตามจำนวนแก้วที่ขาย" action={<MiniLink href="/settings/menu">จัดการเมนู</MiniLink>}>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>#</th><th>เมนู</th><th>จำนวนแก้ว</th><th>ยอดขาย</th></tr></thead><tbody>{menuSales.map((menu, index) => <tr key={menu.id}><td><span className="rank">{index + 1}</span></td><td><span className="menu-name-cell"><span className="menu-mini-icon"><IconCup size={14} /></span><strong>{menu.name}</strong></span></td><td>{menu.units} แก้ว</td><td className="table-total">{formatCurrency(menu.units * menu.price)}</td></tr>)}</tbody></table></div>
      </SectionCard>
      <SectionCard title="รายการล่าสุด" description="แต่ละรายการเก็บราคาและต้นทุน snapshot" action={<MiniLink href="/capture">เพิ่มข้อมูล</MiniLink>}>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>วันที่</th><th>แก้ว</th><th>ยอดขาย</th></tr></thead><tbody>{recent.map((sale) => <tr key={sale.id}><td className="muted">{dayLabel(sale.businessDate)}</td><td>{getSaleUnits([sale])} แก้ว</td><td className="table-total"><strong>{formatCurrency(sale.lines.reduce((sum, line) => sum + line.quantity * line.priceSnapshot, 0))}</strong></td></tr>)}</tbody></table></div>
      </SectionCard>
    </div>
    <div className="data-note"><span><strong>หมายเหตุ</strong> · ยอดขายแก้ย้อนหลังควรใช้ compensating transaction เพื่อรักษา audit trail ใน production</span><Link href="/capture" className="mini-link">บันทึกข้อมูล</Link></div>
  </>;
}

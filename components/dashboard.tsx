"use client";

import Link from "next/link";
import { IconAlertTriangle, IconArrowDownRight, IconArrowUpRight, IconChartDots3, IconCircleCheck, IconCoins, IconCup, IconPackage, IconSparkles } from "@tabler/icons-react";
import { aggregateSalesByDay, formatCurrency, getDashboardMetrics, getDateRange, getMenuSales, getStockStatus, getTodayInTimezone } from "@/lib/calculations";
import { useLanlu } from "@/lib/store";
import { ChevronLink, DatePill, KpiCard, MiniLink, PageHeader, RecommendationIcon, RecommendationTag, SectionCard, StatusBadge } from "@/components/ui";

const shortDay = (value: string) => new Intl.DateTimeFormat("th-TH", { weekday: "short" }).format(new Date(`${value}T12:00:00+07:00`)).replace(".", "");

export function Dashboard() {
  const { state, hydrated } = useLanlu();
  const today = hydrated ? getTodayInTimezone(state.shop.timezone) : "2000-01-01";
  const dates = getDateRange(today);
  const metrics = getDashboardMetrics(state, today);
  const chart = aggregateSalesByDay(state.sales, dates);
  const maxUnits = Math.max(...chart.map((point) => point.units), 1);
  const topMenus = getMenuSales(state.sales.filter((sale) => sale.businessDate === today), state.menuItems);
  const visibleRecommendations = state.recommendations.filter((item) => !item.dismissed).slice(0, 4);
  const alertIngredients = state.ingredients.filter((ingredient) => getStockStatus(ingredient) !== "normal").slice(0, 4);
  const bestSeller = topMenus[0];

  if (!hydrated) return <>
    <PageHeader eyebrow="ภาพรวมร้าน" title="กำลังเตรียมภาพรวมร้าน" description="กำลังโหลดข้อมูลร้านของคุณ" />
    <SectionCard title="กำลังโหลดข้อมูล" description="รอสักครู่ ระบบกำลังเตรียมยอดขายและสต๊อกล่าสุด">
      <div className="data-loading" role="status">กำลังโหลดข้อมูลร้าน…</div>
    </SectionCard>
  </>;

  return <>
    <PageHeader eyebrow="ภาพรวมร้าน" title={`สวัสดี ${state.shop.ownerName}`} description="ร้านรู้เห็นอะไรวันนี้ จากข้อมูลที่คุณบันทึกไว้" action={<><DatePill /><Link href="/assistant" className="button button-soft">ลองให้ผู้ช่วยช่วยจัดข้อมูล</Link></>} />

    <div className="signal-strip" aria-label="ร้านรู้เห็นอะไรวันนี้">
      <Link href="/sales" className="signal-item signal-sage" aria-label="ดูยอดขายวันนี้">
        <span className="signal-icon"><IconArrowUpRight size={17} /></span><div><strong>วันนี้ขายดีอะไร</strong><p>{bestSeller ? `${bestSeller.name} · ${bestSeller.units} แก้ว` : "ยังไม่มีข้อมูลยอดขาย"}</p></div>
      </Link>
      <Link href="/inventory" className="signal-item signal-honey" aria-label="ดูวัตถุดิบที่ต้องระวัง">
        <span className="signal-icon"><IconAlertTriangle size={17} /></span><div><strong>อะไรต้องระวัง</strong><p>{alertIngredients.length ? `${alertIngredients.length} วัตถุดิบต่ำกว่าจุดสั่งซื้อ` : "สต๊อกอยู่ในระดับปกติ"}</p></div>
      </Link>
      <Link href={visibleRecommendations.length ? "/recommendations" : "/capture"} className="signal-item signal-clay" aria-label={visibleRecommendations.length ? "ดูคำแนะนำที่ทำต่อได้" : "ไปบันทึกยอดขาย"}>
        <span className="signal-icon"><IconSparkles size={17} /></span><div><strong>วันนี้ควรทำอะไรต่อ</strong><p>{visibleRecommendations[0]?.title ?? "บันทึกยอดขายรอบถัดไป"}</p></div>
      </Link>
    </div>

    <div className="kpi-grid">
      <KpiCard label="ยอดขายวันนี้" value={formatCurrency(metrics.revenue)} detail="จากยอดขายที่ยืนยันแล้ว" tone="up" icon={<IconCoins size={16} />} />
      <KpiCard label="จำนวนแก้ว" value={`${metrics.units} แก้ว`} detail="เมนูที่บันทึกแล้ววันนี้" tone="neutral" icon={<IconCup size={16} />} />
      <KpiCard label="กำไรขั้นต้นโดยประมาณ" value={formatCurrency(metrics.grossProfit)} detail="ยังไม่รวมค่าแรงและค่าเช่า" tone="up" icon={<IconChartDots3 size={16} />} />
      <KpiCard label="แจ้งเตือนสต๊อก" value={`${metrics.stockAlerts} รายการ`} detail={metrics.stockAlerts ? "มีรายการที่ควรจัดการ" : "ไม่มีรายการเร่งด่วน"} tone={metrics.stockAlerts ? "warning" : "up"} icon={<IconPackage size={16} />} />
    </div>

    <div className="dashboard-row">
      <SectionCard title="ยอดขาย 7 วันล่าสุด" description="จำนวนแก้วจาก Daily close และ Quick capture" action={<MiniLink href="/sales">ดูยอดขายทั้งหมด</MiniLink>}>
        <div className="chart-wrap">
          <div className="chart-summary"><strong>{metrics.units} แก้ว</strong><span><IconArrowUpRight size={12} /> วันนี้</span></div>
          <div className="sales-chart" role="img" aria-label="กราฟจำนวนแก้วขายย้อนหลัง 7 วัน">
            {chart.map((point, index) => <div className="bar-column" key={point.date}><span className="bar-value">{point.units}</span><div className="bar-track"><div className={`bar-fill ${index >= 5 ? "peak" : ""}`} style={{ height: `${Math.max(8, (point.units / maxUnits) * 100)}%` }} /></div><span className="bar-label">{shortDay(point.date)}</span></div>)}
          </div>
          <div className="chart-legend"><span className="legend"><i />ยอดขายปกติ</span><span className="legend peak"><i />วันที่มียอดสูง</span></div>
        </div>
      </SectionCard>
      <SectionCard title="สถานะวัตถุดิบ" description="เช็กจากยอดคงเหลือและจุดสั่งซื้อ" action={<MiniLink href="/inventory">ดูสต๊อก</MiniLink>}>
        <div className="stock-list">
          {alertIngredients.map((ingredient) => { const status = getStockStatus(ingredient); return <div className="stock-row" key={ingredient.id}><span className={`stock-dot ${status}`} /><div className="stock-info"><strong>{ingredient.name}</strong><span>จุดสั่งซื้อ {ingredient.reorderPoint} {ingredient.unit}</span></div><div className="stock-amount"><strong>{ingredient.quantityOnHand} {ingredient.unit}</strong><span><StatusBadge status={status} /></span></div></div>; })}
          {!alertIngredients.length && <div className="empty-state"><div className="empty-mark"><IconCircleCheck size={23} /></div><h3>สต๊อกดูดี</h3><p>ยังไม่มีวัตถุดิบที่ต่ำกว่าจุดสั่งซื้อ</p></div>}
        </div>
      </SectionCard>
    </div>

    <SectionCard className="reco-card" title="คำแนะนำที่ทำต่อได้" description="สรุปจากข้อมูลยอดขายและสต๊อกที่ยืนยันแล้ว" action={<ChevronLink href="/recommendations">ดูทั้งหมด</ChevronLink>}>
      {visibleRecommendations.length ? <div className="reco-grid">{visibleRecommendations.map((item) => <div className="reco-item" key={item.id}><div className="reco-item-top"><RecommendationTag type={item.type} /><span className={`reco-severity ${item.severity}`}><RecommendationIcon severity={item.severity} />{item.severity === "critical" ? "เร่งด่วน" : item.severity === "warning" ? "ควรดูวันนี้" : "ไอเดีย"}</span></div><h3>{item.title}</h3><p>{item.body}</p></div>)}</div> : <div className="empty-state"><div className="empty-mark"><IconCircleCheck size={23} /></div><h3>จัดการครบแล้ว</h3><p>ตอนนี้ยังไม่มีคำแนะนำที่ค้างอยู่</p></div>}
    </SectionCard>

    <div className="data-note"><span><strong>คุณภาพข้อมูลวันนี้</strong> · ยอดขาย {metrics.orders ? "มีจำนวนรายการ" : "ยังไม่มีจำนวนรายการ"} และสูตรเมนู {state.recipes.length}/{state.menuItems.length} รายการ</span><Link href="/capture" className="mini-link">บันทึกเพิ่ม</Link></div>
  </>;
}

"use client";

import { IconChartLine, IconInfoCircle, IconSparkles, IconTrendingUp } from "@tabler/icons-react";
import { DEMO_TODAY } from "@/lib/data";
import { formatCurrency, getForecast, getRevenue, getSaleUnits } from "@/lib/calculations";
import { useLanlu } from "@/lib/store";
import { DatePill, PageHeader, SectionCard } from "@/components/ui";

const labelDate = (date: string) => new Intl.DateTimeFormat("th-TH", { weekday: "short", day: "numeric" }).format(new Date(`${date}T12:00:00+07:00`));

export function ForecastPage() {
  const { state } = useLanlu();
  const points = getForecast(state.sales, 7);
  const average = points.length ? Math.round(points.reduce((sum, point) => sum + point.predictedUnits, 0) / points.length) : 0;
  const max = Math.max(...points.map((point) => point.high ?? point.predictedUnits), 1);
  const observedDays = new Set(state.sales.map((sale) => sale.businessDate)).size;
  const confidence = points[0]?.confidence ?? "low";
  const confidenceLabel = { low: "ต่ำ", medium: "กลาง", high: "สูง" }[confidence];

  return <>
    <PageHeader eyebrow="คาดการณ์" title="พรุ่งนี้ร้านควรเตรียมอะไร" description="Baseline forecast ที่อธิบายได้จากยอดขายจริง ไม่ใช้ ML ใน v1" action={<DatePill>คาดการณ์ 7 วันถัดไป</DatePill>} />
    <div className="forecast-hero">
      <SectionCard className="forecast-chart-card" title="จำนวนแก้วที่คาดการณ์" description="ช่วงคาดการณ์แสดงเป็นแถบต่ำ–สูง" action={<span className="status-badge status-info"><IconChartLine size={13} />baseline</span>}>
        <div className="forecast-chart" role="img" aria-label="กราฟยอดขายที่คาดการณ์ 7 วันถัดไป">{points.map((point) => <div className="forecast-col" key={point.date}><span className="forecast-value">{point.predictedUnits}</span><div className="forecast-bars"><div className="forecast-bar low" style={{ height: `${Math.max(8, (point.low ?? 0) / max * 100)}%` }} /><div className="forecast-bar predicted" style={{ height: `${Math.max(8, point.predictedUnits / max * 100)}%` }} /></div><span className="forecast-label">{labelDate(point.date)}</span></div>)}</div>
        <div className="chart-legend"><span className="legend"><i style={{ background: "var(--clay)" }} />ค่ากลางที่คาดการณ์</span><span className="legend"><i style={{ background: "var(--honey)", opacity: .6 }} />ขอบล่าง</span></div>
      </SectionCard>
      <SectionCard className="confidence-card" title="อ่านความมั่นใจให้ถูก" description="ระบบบอกข้อจำกัดทุกครั้ง">
        <div><div className="confidence-mark"><IconTrendingUp size={21} /></div><h2>ความมั่นใจระดับ{confidenceLabel}</h2><p>ตอนนี้ใช้ข้อมูลยอดขายที่มี {observedDays} วัน ระบบใช้ค่าเฉลี่ยย้อนหลังเป็น baseline และเผื่อช่วงไว้ให้เห็นความไม่แน่นอน</p></div>
        <div className="confidence-stat"><div><span>เฉลี่ยต่อวัน</span><strong>{average} แก้ว</strong></div><div><span>ข้อมูลที่ใช้</span><strong>{observedDays} วัน</strong></div></div>
      </SectionCard>
    </div>
    <SectionCard title="สิ่งที่ระบบใช้คำนวณ" description="เหตุผลที่ตรวจสอบย้อนกลับได้">
      <div className="reco-grid"><div className="reco-item"><div className="reco-item-top"><span className="reco-tag tag-sales">ข้อมูลขาย</span><IconChartLine size={16} color="var(--sage-dark)" /></div><h3>ค่าเฉลี่ยยอดขายที่มี</h3><p>ใช้จำนวนแก้วที่ยืนยันแล้วในแต่ละวัน ไม่เติมข้อมูลวันที่ยังไม่เคยบันทึก</p></div><div className="reco-item"><div className="reco-item-top"><span className="reco-tag tag-promotion">ช่วงคาดการณ์</span><IconSparkles size={16} color="var(--honey-dark)" /></div><h3>เผื่อความไม่แน่นอน</h3><p>ข้อมูลน้อยจะมีช่วงกว้างและ confidence ต่ำ เพื่อไม่ทำให้ตัวเลขดูแม่นเกินจริง</p></div><div className="reco-item"><div className="reco-item-top"><span className="reco-tag tag-stock">การเตรียมของ</span><IconInfoCircle size={16} color="var(--rust-dark)" /></div><h3>ต่อยอดเป็นคำแนะนำ</h3><p>วัตถุดิบที่ใกล้หมดอายุหรือ stock ต่ำจะถูกนำไปประกอบคำแนะนำในหน้าแยก</p></div></div>
    </SectionCard>
    <div className="forecast-note"><IconInfoCircle size={16} />คาดการณ์นี้เป็น baseline เพื่อช่วยวางแผน ไม่ใช่คำรับรองยอดขาย. ยิ่งบันทึก Daily close ต่อเนื่อง ระบบจะเลือกวิธีที่เหมาะกับจำนวนข้อมูลมากขึ้น</div>
  </>;
}

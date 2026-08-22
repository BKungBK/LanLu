"use client";

import { useMemo, useState } from "react";
import { IconAdjustments, IconArrowUpRight, IconCheck, IconPackage, IconSparkles } from "@tabler/icons-react";
import { RecommendationIcon, RecommendationTag, EmptyState, PageHeader, SectionCard, StatusBadge } from "@/components/ui";
import { useLanlu } from "@/lib/store";
import type { RecommendationType } from "@/lib/types";

const filters: Array<{ id: "all" | RecommendationType; label: string }> = [{ id: "all", label: "ทั้งหมด" }, { id: "stock", label: "วัตถุดิบ" }, { id: "expiry", label: "วันหมดอายุ" }, { id: "sales", label: "ยอดขาย" }, { id: "promotion", label: "โอกาสขาย" }];

export function RecommendationsPage() {
  const { state, dismissRecommendation } = useLanlu();
  const [filter, setFilter] = useState<(typeof filters)[number]["id"]>("all");
  const recommendations = useMemo(() => state.recommendations.filter((item) => filter === "all" || item.type === filter), [filter, state.recommendations]);
  const openCount = state.recommendations.filter((item) => !item.dismissed).length;

  return <>
    <PageHeader eyebrow="คำแนะนำ" title="สิ่งที่ร้านควรทำต่อ" description="ทุกคำแนะนำบอกเหตุผลและข้อมูลต้นทาง กดจัดการแล้วปิดรายการได้" action={<span className="status-badge status-warning"><IconSparkles size={13} />{openCount} รายการค้างอยู่</span>} />
    <SectionCard title="Smart recommendations" description="กฎ deterministic จาก stock, expiry และยอดขาย">
      <div className="reco-filter">{filters.map((item) => <button type="button" className={`filter-button ${filter === item.id ? "active" : ""}`} key={item.id} onClick={() => setFilter(item.id)}>{item.label}</button>)}</div>
      <div className="reco-page-grid" style={{ marginTop: 14 }}>{recommendations.length ? recommendations.map((item) => <article className={`reco-page-item ${item.dismissed ? "dismissed" : ""}`} key={item.id}><div className="reco-item-top"><RecommendationTag type={item.type} /><span className={`reco-severity ${item.severity}`}><RecommendationIcon severity={item.severity} />{item.severity === "critical" ? "เร่งด่วน" : item.severity === "warning" ? "ควรดูวันนี้" : "ไอเดีย"}</span></div><h2>{item.title}</h2><p>{item.body}</p><div className="reco-source"><IconAdjustments size={13} />ข้อมูล ณ {new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(item.createdAt))}</div><div className="reco-actions"><span className="status-badge status-info"><IconPackage size={12} />action ต่อได้</span>{item.dismissed ? <span className="status-badge status-normal"><IconCheck size={12} />จัดการแล้ว</span> : <button type="button" className="button button-small button-primary" onClick={() => dismissRecommendation(item.id)}>{item.action === "setup_recipe" ? "ตั้งสูตร" : item.action === "order_ingredient" ? "เตรียมสั่งซื้อ" : item.action === "promote_menu" ? "ดูเมนู" : "รับทราบ"}<IconArrowUpRight size={14} /></button>}</div></article>) : <EmptyState title="ยังไม่มีคำแนะนำหมวดนี้" body="เมื่อมีข้อมูลที่เพียงพอ ระบบจะสร้างคำแนะนำพร้อมเหตุผลให้ที่นี่" action="บันทึกข้อมูลเพิ่ม" />}</div>
    </SectionCard>
    <div className="data-note"><span><strong>หลักการ</strong> · ระบบไม่เรียกสิ่งนี้ว่า AI prediction และไม่สร้าง insight หากข้อมูลไม่พอ</span><span className="status-badge status-info">อธิบายได้</span></div>
  </>;
}

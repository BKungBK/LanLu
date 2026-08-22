"use client";

import Link from "next/link";
import { IconArrowUpRight, IconCheck, IconChevronRight, IconInfoCircle, IconMinus, IconPlus, IconAlertTriangle, IconCircleX } from "@tabler/icons-react";
import type { ReactNode } from "react";
import type { RecommendationSeverity } from "@/lib/types";

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="page-header">
    <div>
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </div>
    {action && <div className="page-header-action">{action}</div>}
  </div>;
}

export function DatePill({ children = "วันนี้" }: { children?: ReactNode }) {
  return <div className="date-pill"><span className="live-dot" />{children}</div>;
}

export function StatusBadge({ status, label }: { status: "normal" | "warning" | "critical" | RecommendationSeverity; label?: string }) {
  const icon = status === "normal" || status === "info" ? <IconCheck size={13} stroke={2.5} /> : status === "warning" ? <IconAlertTriangle size={13} stroke={2.2} /> : <IconCircleX size={13} stroke={2.2} />;
  const text = label ?? ({ normal: "ปกติ", warning: "เฝ้าระวัง", critical: "ต้องจัดการ", info: "ข้อมูล" }[status] ?? status);
  return <span className={`status-badge status-${status}`}>{icon}{text}</span>;
}

export function KpiCard({ label, value, detail, tone = "neutral", icon }: { label: string; value: string; detail: string; tone?: "neutral" | "up" | "warning" | "critical"; icon: ReactNode }) {
  return <div className={`kpi-card kpi-${tone}`}>
    <div className="kpi-top"><span className="kpi-label">{label}</span><span className="kpi-icon">{icon}</span></div>
    <div className="kpi-value">{value}</div>
    <div className={`kpi-detail detail-${tone}`}>{detail}</div>
  </div>;
}

export function SectionCard({ title, description, action, children, className = "" }: { title: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`section-card ${className}`}>
    <div className="section-card-head">
      <div><h2>{title}</h2>{description && <p>{description}</p>}</div>
      {action}
    </div>
    {children}
  </section>;
}

export function MiniLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="mini-link">{children}<IconArrowUpRight size={15} /></Link>;
}

export function EmptyState({ title, body, description, href = "/capture", action = "ไป Quick capture", actionHref, actionLabel }: { title: string; body?: string; description?: string; href?: string; action?: string; actionHref?: string; actionLabel?: string }) {
  return <div className="empty-state">
    <div className="empty-mark"><IconInfoCircle size={23} /></div>
    <h3>{title}</h3>
    <p>{body ?? description}</p>
    <Link href={actionHref ?? href} className="button button-primary"><IconPlus size={16} />{actionLabel ?? action}</Link>
  </div>;
}

export function Stepper({ value, onChange, min = 0, max = 99 }: { value: number; onChange: (value: number) => void; min?: number; max?: number }) {
  return <div className="stepper" aria-label="จำนวน">
    <button type="button" aria-label="ลดจำนวน" onClick={() => onChange(Math.max(min, value - 1))}><IconMinus size={16} /></button>
    <strong>{value}</strong>
    <button type="button" aria-label="เพิ่มจำนวน" onClick={() => onChange(Math.min(max, value + 1))}><IconPlus size={16} /></button>
  </div>;
}

export function formatDateThai(value: string) {
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00+07:00`));
}

export function RecommendationIcon({ severity }: { severity: RecommendationSeverity }) {
  return severity === "critical" ? <IconCircleX size={17} /> : severity === "warning" ? <IconAlertTriangle size={17} /> : <IconInfoCircle size={17} />;
}

export function RecommendationTag({ type }: { type: "stock" | "expiry" | "sales" | "promotion" }) {
  const labels = { stock: "วัตถุดิบ", expiry: "วันหมดอายุ", sales: "ยอดขาย", promotion: "โอกาสขาย" };
  return <span className={`reco-tag tag-${type}`}>{labels[type]}</span>;
}

export function ChevronLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="chevron-link">{children}<IconChevronRight size={16} /></Link>;
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IconCalendarEvent, IconChevronDown, IconChevronLeft, IconChevronRight, IconPlus, IconSearch } from "@tabler/icons-react";
import { formatThaiDateInput, parseIsoDateInput } from "@/lib/catalog";

type CreatableSelectProps = {
  id?: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  onCreate?: (value: string) => void | Promise<void>;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
};

export function CreatableSelect({ id, value, options, onChange, onCreate, placeholder = "เลือก...", label, disabled }: CreatableSelectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = useMemo(() => options.filter((option) => option.toLocaleLowerCase().includes(normalizedQuery)), [normalizedQuery, options]);
  const canCreate = Boolean(normalizedQuery && !options.some((option) => option.toLocaleLowerCase() === normalizedQuery));
  const itemCount = filtered.length + (canCreate ? 1 : 0);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => { if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => { setHighlight(0); }, [query]);
  useEffect(() => {
    if (wasOpen.current && !open) triggerRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  const choose = (next: string, create = false) => {
    if (create && onCreate) void onCreate(next);
    onChange(next);
    setQuery("");
    setOpen(false);
  };

  return <div className="creatable-select" ref={rootRef}>
    {label && <label htmlFor={id}>{label}</label>}
    <button ref={triggerRef} id={id} type="button" className="select-trigger" aria-haspopup="listbox" aria-controls={id ? `${id}-options` : undefined} aria-expanded={open} disabled={disabled} onClick={() => setOpen((current) => !current)}>
      <span className={value ? "" : "select-placeholder"}>{value || placeholder}</span><IconChevronDown size={16} aria-hidden="true" />
    </button>
    {open && <div className="select-popover" id={id ? `${id}-options` : undefined}>
      <div className="select-search"><IconSearch size={15} aria-hidden="true" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setHighlight((current) => Math.min(current + 1, Math.max(itemCount - 1, 0))); } else if (event.key === "ArrowUp") { event.preventDefault(); setHighlight((current) => Math.max(current - 1, 0)); } else if (event.key === "Enter" && itemCount) { event.preventDefault(); if (canCreate && highlight === filtered.length) choose(query.trim(), true); else choose(filtered[highlight]); } else if (event.key === "Escape") setOpen(false); }} placeholder="ค้นหา หรือพิมพ์เพื่อเพิ่ม" aria-label="ค้นหาตัวเลือก" />
      </div>
      <div className="select-options" role="listbox" aria-label={label ?? placeholder}>
        {filtered.map((option, index) => <button type="button" role="option" aria-selected={option === value} className={`select-option ${index === highlight ? "highlighted" : ""}`} key={option} onMouseEnter={() => setHighlight(index)} onClick={() => choose(option)}>{option}{option === value && <span aria-hidden="true">✓</span>}</button>)}
        {canCreate && <button type="button" role="option" className={`select-option select-create ${highlight === filtered.length ? "highlighted" : ""}`} onMouseEnter={() => setHighlight(filtered.length)} onClick={() => choose(query.trim(), true)}><IconPlus size={15} />เพิ่มใหม่ “{query.trim()}”</button>}
        {!itemCount && <div className="select-empty">ไม่พบตัวเลือก</div>}
      </div>
    </div>}
  </div>;
}

type DateFieldProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
};

function isoFromParts(year: number, month: number, day: number) {
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

export function DateField({ id, value, onChange, label, placeholder = "วว/ดด/ปปปป", disabled }: DateFieldProps) {
  const initial = value ? new Date(`${value}T12:00:00Z`) : new Date();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value ? formatThaiDateInput(value) : "");
  const [monthCursor, setMonthCursor] = useState(() => new Date(Date.UTC(initial.getUTCFullYear(), initial.getUTCMonth(), 1)));
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => { setDraft(value ? formatThaiDateInput(value) : ""); if (value) { const date = new Date(`${value}T12:00:00Z`); setMonthCursor(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))); } }, [value]);
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => { if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);
  useEffect(() => {
    if (wasOpen.current && !open) triggerRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  const commit = (text: string) => { const next = parseIsoDateInput(text); setDraft(text); if (next) onChange(next); };
  const year = monthCursor.getUTCFullYear();
  const month = monthCursor.getUTCMonth();
  const firstDay = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((firstDay + daysInMonth) / 7) * 7 }, (_, index) => {
    const day = index - firstDay + 1;
    return day > 0 && day <= daysInMonth ? isoFromParts(year, month + 1, day) : "";
  });
  const monthLabel = new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric" }).format(new Date(Date.UTC(year, month, 1)));

  return <div className="date-field-control" ref={rootRef}>
    {label && <label htmlFor={id}>{label}</label>}
    <div className="date-input-shell"><input id={id} className="date-text-input" inputMode="numeric" value={draft} placeholder={placeholder} disabled={disabled} onChange={(event) => setDraft(event.target.value)} onBlur={() => commit(draft)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commit(draft); setOpen(true); } }} /><button ref={triggerRef} id={`${id}-calendar`} type="button" className="date-calendar-button" aria-label="เปิดปฏิทิน" aria-controls={`${id}-calendar-popover`} aria-expanded={open} onClick={() => setOpen((current) => !current)} disabled={disabled}><IconCalendarEvent size={17} /></button></div>
    {open && <div className="date-popover" id={`${id}-calendar-popover`} role="dialog" aria-label="เลือกวันที่">
      <div className="date-popover-head"><button type="button" aria-label="เดือนก่อนหน้า" onClick={() => setMonthCursor(new Date(Date.UTC(year, month - 1, 1)))}><IconChevronLeft size={16} /></button><strong>{monthLabel}</strong><button type="button" aria-label="เดือนถัดไป" onClick={() => setMonthCursor(new Date(Date.UTC(year, month + 1, 1)))}><IconChevronRight size={16} /></button></div>
      <div className="calendar-weekdays">{["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="calendar-grid">{cells.map((cell, index) => cell ? <button type="button" key={cell} className={cell === value ? "selected" : ""} onClick={() => { onChange(cell); setDraft(formatThaiDateInput(cell)); setOpen(false); }}>{cell.slice(-2)}</button> : <span key={`empty-${index}`} />)}</div>
      <button type="button" className="calendar-today" onClick={() => { const today = new Date(); const next = isoFromParts(today.getFullYear(), today.getMonth() + 1, today.getDate()); onChange(next); setDraft(formatThaiDateInput(next)); setMonthCursor(new Date(Date.UTC(today.getFullYear(), today.getMonth(), 1))); setOpen(false); }}>วันนี้</button>
    </div>}
  </div>;
}

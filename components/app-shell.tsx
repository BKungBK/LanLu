"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { IconChartBar, IconClipboardData, IconCoffee, IconLayoutDashboard, IconLogout2, IconPackage, IconPlus, IconSparkles, IconToolsKitchen2, IconMenu2, IconX, IconChevronDown } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useLanlu } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";

const navItems = [
  { href: "/", label: "ภาพรวมร้าน", icon: IconLayoutDashboard },
  { href: "/sales", label: "ยอดขาย", icon: IconChartBar },
  { href: "/forecast", label: "คาดการณ์", icon: IconClipboardData },
  { href: "/inventory", label: "วัตถุดิบ", icon: IconPackage },
  { href: "/recommendations", label: "คำแนะนำ", icon: IconSparkles },
  { href: "/settings/menu", label: "เมนูและสูตร", icon: IconToolsKitchen2 },
  { href: "/assistant", label: "ผู้ช่วย", icon: IconSparkles },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const { state } = useLanlu();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileCloseRef = useRef<HTMLButtonElement>(null);
  const isPlain = pathname === "/login" || pathname === "/onboarding" || pathname === "/auth/reset-password";

  useEffect(() => {
    if (!mobileNavOpen) return;
    mobileCloseRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNavOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      mobileMenuButtonRef.current?.focus();
    };
  }, [mobileNavOpen]);

  if (isPlain) return <>{children}</>;

  return <div className="app-frame">
    <aside id="lanlu-sidebar" className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
      <div className="brand-block">
        <div className="brand-mark">LL</div>
        <div><div className="brand-name">LanLu</div><div className="brand-sub">LANLU DASHBOARD</div></div>
        <button ref={mobileCloseRef} type="button" className="mobile-close" aria-label="ปิดเมนู" onClick={() => setMobileNavOpen(false)}><IconX size={20} /></button>
      </div>
      <div className="side-kicker"><IconCoffee size={14} /> ร้านรู้เห็นอะไรวันนี้</div>
      <nav className="main-nav" aria-label="เมนูหลัก">
        {navItems.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return <Link key={item.href} href={item.href} onClick={() => setMobileNavOpen(false)} className={`nav-item ${active ? "nav-active" : ""}`} aria-current={active ? "page" : undefined}><span className="nav-icon"><Icon size={17} stroke={active ? 2.2 : 1.8} /></span>{item.label}</Link>;
        })}
      </nav>
      <div className="side-divider" />
      <Link href="/capture" className={`capture-nav ${pathname === "/capture" ? "capture-nav-active" : ""}`} aria-current={pathname === "/capture" ? "page" : undefined} onClick={() => setMobileNavOpen(false)}><span className="capture-nav-icon"><IconPlus size={18} /></span><span><strong>Quick capture</strong><small>บันทึกข้อมูลวันนี้</small></span></Link>
      <div className="side-spacer" />
      <div className="shop-switcher"><div className="shop-avatar">{state.shop.name.slice(0, 1)}</div><div className="shop-meta"><strong>{state.shop.name}</strong><span>อัปเดตล่าสุดวันนี้</span></div><IconChevronDown size={15} /></div>
      <button type="button" className="logout-link logout-button" onClick={async () => { await supabase.auth.signOut(); router.replace("/login"); }}><IconLogout2 size={16} /> ออกจากระบบ</button>
    </aside>
    {mobileNavOpen && <button type="button" className="mobile-backdrop" aria-label="ปิดเมนู" onClick={() => setMobileNavOpen(false)} />}
    <main className={`main-content ${pathname === "/" ? "main-content-dashboard" : ""}`}>
      <div className="mobile-topbar"><button ref={mobileMenuButtonRef} type="button" className="mobile-menu-button" aria-label="เปิดเมนู" aria-expanded={mobileNavOpen} aria-controls="lanlu-sidebar" onClick={() => setMobileNavOpen(true)}><IconMenu2 size={22} /></button><div className="mobile-brand"><span className="brand-mark small">LL</span><strong>LanLu</strong></div><Link href="/capture" className="mobile-capture" aria-label="เปิด Quick capture"><IconPlus size={21} /></Link></div>
      <div className="content-wrap"><div className="page-transition" key={pathname}>{children}</div></div>
    </main>
  </div>;
}

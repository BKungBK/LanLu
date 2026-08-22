"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { IconChartBar, IconClipboardData, IconCoffee, IconLayoutDashboard, IconLogout2, IconPackage, IconSparkles, IconToolsKitchen2, IconMenu2, IconX, IconSettings, IconChevronDown } from "@tabler/icons-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { useLanlu } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";

const navItems = [
  { href: "/", label: "ภาพรวมร้าน", icon: IconLayoutDashboard },
  { href: "/sales", label: "ยอดขาย", icon: IconChartBar },
  { href: "/forecast", label: "คาดการณ์", icon: IconClipboardData },
  { href: "/inventory", label: "วัตถุดิบ", icon: IconPackage },
  { href: "/recommendations", label: "คำแนะนำ", icon: IconSparkles },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const { state } = useLanlu();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isPlain = pathname === "/login" || pathname === "/onboarding" || pathname === "/auth/reset-password";

  if (isPlain) return <>{children}</>;

  return <div className="app-frame">
    <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
      <div className="brand-block">
        <div className="brand-mark">LL</div>
        <div><div className="brand-name">LanLu</div><div className="brand-sub">LANLU DASHBOARD</div></div>
        <button type="button" className="mobile-close" aria-label="ปิดเมนู" onClick={() => setMobileNavOpen(false)}><IconX size={20} /></button>
      </div>
      <div className="side-kicker"><IconCoffee size={14} /> ร้านรู้เห็นอะไรวันนี้</div>
      <nav className="main-nav" aria-label="เมนูหลัก">
        {navItems.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return <Link key={item.href} href={item.href} onClick={() => setMobileNavOpen(false)} className={`nav-item ${active ? "nav-active" : ""}`}><span className="nav-icon"><Icon size={17} stroke={active ? 2.2 : 1.8} /></span>{item.label}</Link>;
        })}
      </nav>
      <div className="side-divider" />
      <Link href="/capture" className={`capture-nav ${pathname === "/capture" ? "capture-nav-active" : ""}`} onClick={() => setMobileNavOpen(false)}><span className="capture-nav-icon">+</span><span><strong>Quick capture</strong><small>บันทึกข้อมูลวันนี้</small></span></Link>
      <div className="side-spacer" />
      <div className="shop-switcher"><div className="shop-avatar">{state.shop.name.slice(0, 1)}</div><div className="shop-meta"><strong>{state.shop.name}</strong><span>อัปเดตล่าสุดวันนี้</span></div><IconChevronDown size={15} /></div>
      <Link href="/settings/menu" className="settings-link"><IconSettings size={16} /> ตั้งค่าร้าน</Link>
      <button type="button" className="logout-link logout-button" onClick={async () => { await supabase.auth.signOut(); router.replace("/login"); }}><IconLogout2 size={16} /> ออกจากระบบ</button>
    </aside>
    {mobileNavOpen && <button className="mobile-backdrop" aria-label="ปิดเมนู" onClick={() => setMobileNavOpen(false)} />}
    <main className="main-content">
      <div className="mobile-topbar"><button type="button" className="mobile-menu-button" aria-label="เปิดเมนู" onClick={() => setMobileNavOpen(true)}><IconMenu2 size={22} /></button><div className="mobile-brand"><span className="brand-mark small">LL</span><strong>LanLu</strong></div><Link href="/capture" className="mobile-capture">+</Link></div>
      <div className="content-wrap">{children}</div>
    </main>
  </div>;
}

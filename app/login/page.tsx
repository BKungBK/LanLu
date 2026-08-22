import { Suspense } from "react";
import { LoginPage } from "@/components/auth-page";

export default function Page() {
  return <Suspense fallback={<div className="auth-loading">กำลังเตรียมหน้าเข้าสู่ระบบ…</div>}><LoginPage /></Suspense>;
}

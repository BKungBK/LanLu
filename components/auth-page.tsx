"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { IconArrowRight, IconKey, IconLock, IconMail, IconSparkles } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";

type AuthMode = "login" | "signup";

function humanAuthError(message: string, mode: AuthMode) {
  const normalized = message.toLocaleLowerCase();
  if (normalized.includes("invalid login") || normalized.includes("invalid credentials")) return "email หรือ password ไม่ถูกต้อง";
  if (normalized.includes("already registered") || normalized.includes("user already exists")) return "email นี้มีบัญชีแล้ว ลองเข้าสู่ระบบแทน";
  if (normalized.includes("email") && normalized.includes("confirm")) return "ต้องยืนยัน email ก่อนเข้าใช้งาน ตรวจกล่องจดหมายอีกครั้ง";
  if (mode === "signup") return "สร้างบัญชีไม่สำเร็จ ตรวจข้อมูลแล้วลองใหม่อีกครั้ง";
  return "เข้าสู่ระบบไม่สำเร็จ ตรวจ email และ password แล้วลองใหม่อีกครั้ง";
}

export function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = createClient();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!email.trim() || password.length < 8) {
      setError("กรอก email และ password อย่างน้อย 8 ตัวอักษร");
      return;
    }
    setPending(true);
    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
      : await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding` } });
    setPending(false);
    if (result.error) {
      setError(humanAuthError(result.error.message, mode));
      return;
    }
    if (mode === "signup" && !result.data.session) {
      setMessage("สร้างบัญชีแล้ว ตรวจ email เพื่อยืนยันก่อนเข้าใช้งาน");
      return;
    }
    router.replace(params.get("next") || (mode === "signup" ? "/onboarding" : "/"));
    router.refresh();
  };

  const resetPassword = async () => {
    setError("");
    setMessage("");
    if (!email.trim()) { setError("ใส่ email ก่อนขอ reset password"); return; }
    setPending(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password` });
    setPending(false);
    if (resetError) setError("ส่งลิงก์ reset password ไม่สำเร็จ ตรวจ email แล้วลองใหม่อีกครั้ง");
    else setMessage("ส่งลิงก์ reset password ไปที่ email แล้ว");
  };

  return <main className="auth-page">
    <section className="auth-intro">
      <div className="auth-brand"><span className="brand-mark">LL</span><div><div className="brand-name">LanLu</div><div className="brand-sub">ร้านรู้</div></div></div>
      <div className="auth-lead"><div className="eyebrow"><IconSparkles size={14} />ระบบวิเคราะห์ร้านสำหรับเจ้าของร้าน</div><h1>ร้านรู้<br /><em>เห็นอะไรวันนี้</em></h1><p>บันทึกยอดขายไม่กี่แตะ แล้วเห็นภาพสต๊อก ต้นทุน และสิ่งที่ควรทำต่อในหน้าเดียว</p></div>
      <div className="auth-signal"><i />Online-first · ข้อมูลร้านแยกด้วย Supabase RLS</div>
    </section>
    <section className="auth-card" aria-labelledby="auth-title">
      <h2 id="auth-title">{mode === "login" ? "เข้าสู่ LanLu" : "สร้างบัญชีเจ้าของร้าน"}</h2>
      <p>{mode === "login" ? "ใช้ email และ password เพื่อดูภาพรวมร้าน" : "เริ่มร้านใหม่ แล้วตั้งค่าเมนูและวัตถุดิบในขั้นถัดไป"}</p>
      <form className="auth-form" onSubmit={submit} noValidate aria-busy={pending}>
        <div className="form-field"><label htmlFor="email"><IconMail size={14} /> Email</label><input suppressHydrationWarning id="email" className="text-input" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></div>
        <div className="form-field"><label htmlFor="password"><IconLock size={14} /> Password</label><input suppressHydrationWarning id="password" className="text-input" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="อย่างน้อย 8 ตัวอักษร" minLength={8} required /></div>
        {error && <div className="auth-error" role="alert">{error}</div>}
        {message && <div className="auth-demo" role="status">{message}</div>}
        <button type="submit" className="button button-primary" disabled={pending} aria-busy={pending}>{pending ? "กำลังตรวจสอบ…" : mode === "login" ? <>เข้าสู่ Dashboard <IconArrowRight size={16} /></> : <>สร้างบัญชี <IconArrowRight size={16} /></>}</button>
      </form>
      {mode === "login" && <button type="button" className="text-action" onClick={resetPassword} disabled={pending}><IconKey size={14} />ลืม password?</button>}
      <div className="auth-footer"><span>{mode === "login" ? "ยังไม่มีบัญชี?" : "มีบัญชีแล้ว?"}</span><button type="button" className="text-action" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); setMessage(""); }}>{mode === "login" ? "สร้างบัญชี" : "เข้าสู่ระบบ"}</button></div>
    </section>
  </main>;
}

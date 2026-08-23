"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconCheck, IconLock } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";

export function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (password.length < 8 || password !== confirm) { setError(password !== confirm ? "password ไม่ตรงกัน" : "password ต้องยาวอย่างน้อย 8 ตัวอักษร"); return; }
    setPending(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setPending(false);
    if (updateError) { setError("บันทึก password ใหม่ไม่สำเร็จ ลองขอลิงก์ reset อีกครั้ง"); return; }
    router.replace("/");
  };

  return <main className="auth-page auth-page-centered"><section className="auth-card"><div className="auth-brand"><span className="brand-mark">LL</span><div><div className="brand-name">LanLu</div><div className="brand-sub">ร้านรู้</div></div></div><h1>ตั้ง password ใหม่</h1><p>ตั้งรหัสใหม่เพื่อกลับเข้าใช้งานร้าน</p><form className="auth-form" onSubmit={submit} aria-busy={pending}><div className="form-field"><label htmlFor="new-password"><IconLock size={14} /> Password ใหม่</label><input suppressHydrationWarning id="new-password" className="text-input" type="password" minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></div><div className="form-field"><label htmlFor="confirm-password"><IconLock size={14} /> ยืนยัน password</label><input suppressHydrationWarning id="confirm-password" className="text-input" type="password" minLength={8} autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required /></div>{error && <div className="auth-error" role="alert">{error}</div>}<button type="submit" className="button button-primary" disabled={pending} aria-busy={pending}>{pending ? "กำลังบันทึก…" : <><IconCheck size={16} />บันทึก password ใหม่</>}</button></form></section></main>;
}

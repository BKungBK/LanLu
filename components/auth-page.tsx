"use client";

import Link from "next/link";
import { useState } from "react";
import { IconArrowRight, IconLock, IconMail, IconSparkles } from "@tabler/icons-react";

export function LoginPage() {
  const [email, setEmail] = useState("owner@lanlu.demo");
  const [password, setPassword] = useState("lanlu-demo");
  return <div className="auth-page"><section className="auth-intro"><div className="auth-brand"><span className="brand-mark">LL</span><div><div className="brand-name">LanLu</div><div className="brand-sub">ร้านรู้</div></div></div><div className="auth-lead"><div className="eyebrow"><IconSparkles size={14} />ระบบวิเคราะห์ร้านสำหรับเจ้าของร้าน</div><h1>ร้านรู้<br /><em>เห็นอะไรวันนี้</em></h1><p>บันทึกยอดขายไม่กี่แตะ แล้วเห็นภาพสต๊อก ต้นทุน และสิ่งที่ควรทำต่อในหน้าเดียว</p></div><div className="auth-signal"><i />Online-first · พร้อมบันทึก Draft ในเครื่อง</div></section><section className="auth-card"><h2>เข้าสู่ LanLu</h2><p>ใช้ email และ password ของร้านเพื่อดูภาพรวมวันนี้</p><div className="auth-demo">Demo mode เปิดอยู่ · ข้อมูลตัวอย่างนี้เก็บใน browser เครื่องนี้เท่านั้น</div><form className="auth-form" onSubmit={(event) => event.preventDefault()}><div className="form-field"><label htmlFor="email"><IconMail size={14} /> Email</label><input id="email" className="text-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div><div className="form-field"><label htmlFor="password"><IconLock size={14} /> Password</label><input id="password" className="text-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></div><Link href="/" className="button button-primary">เข้าสู่ Dashboard <IconArrowRight size={16} /></Link></form><div className="auth-footer"><span>ยังไม่มีร้าน?</span><Link href="/onboarding">เริ่มตั้งค่าร้าน</Link></div></section></div>;
}

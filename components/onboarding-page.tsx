"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconArrowRight, IconCheck, IconCoffee, IconHome, IconMapPin } from "@tabler/icons-react";
import { useLanlu } from "@/lib/store";

export function OnboardingPage() {
  const router = useRouter();
  const { state, createShop, loading, needsOnboarding } = useLanlu();
  const [step, setStep] = useState(1);
  const [shopName, setShopName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [city, setCity] = useState("กรุงเทพฯ");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !needsOnboarding && state.shop.id) router.replace("/");
  }, [loading, needsOnboarding, router, state.shop.id]);

  const complete = async () => {
    if (!shopName.trim() || !ownerName.trim()) { setError("ใส่ชื่อร้านและชื่อเจ้าของร้านก่อน"); return; }
    setPending(true); setError("");
    const result = await createShop({ name: shopName.trim(), ownerName: ownerName.trim() });
    setPending(false);
    if (!result.ok) { setError(result.message); return; }
    router.replace("/");
    router.refresh();
  };

  return <div className="onboarding-page"><div className="onboarding-head"><div className="onboarding-brand"><span className="brand-mark">LL</span><strong>LanLu</strong></div><div className="onboarding-progress"><span>ตั้งค่าร้าน</span><div className="progress-dots"><i className={step >= 1 ? "active" : ""} /><i className={step >= 2 ? "active" : ""} /></div></div></div>
    <div className="onboarding-card">
      {step === 1 && <><h1>เริ่มจากร้านของคุณ</h1><p>ใส่ข้อมูลสั้น ๆ เพื่อให้ Dashboard เรียกชื่อร้านและสรุปข้อมูลได้ถูกบริบท</p><div className="onboarding-step"><div className="form-field"><label htmlFor="shop-name"><IconHome size={14} />ชื่อร้าน</label><input id="shop-name" className="text-input" value={shopName} onChange={(event) => setShopName(event.target.value)} placeholder="เช่น บ้านชงกาแฟ" maxLength={120} required /></div><div className="form-field"><label htmlFor="owner-name"><IconCoffee size={14} />ชื่อเจ้าของร้าน</label><input id="owner-name" className="text-input" value={ownerName} onChange={(event) => setOwnerName(event.target.value)} placeholder="เช่น คุณมิน" maxLength={80} required /></div><div className="form-field"><label htmlFor="city"><IconMapPin size={14} />พื้นที่ร้าน</label><input id="city" className="text-input" value={city} onChange={(event) => setCity(event.target.value)} maxLength={80} /></div></div><div className="onboarding-footer"><span className="skip-link">ใช้เวลาไม่ถึง 2 นาที</span><button type="button" className="button button-primary" onClick={() => { if (!shopName.trim() || !ownerName.trim()) { setError("ใส่ชื่อร้านและชื่อเจ้าของร้านก่อน"); return; } setError(""); setStep(2); }}>ต่อไป <IconArrowRight size={16} /></button></div></>}
      {step === 2 && <><h1>พร้อมเริ่มบันทึก</h1><p>ร้านถูกสร้างใน Supabase แล้ว ข้อมูลหลังจากนี้จะเป็นของร้านนี้เท่านั้น</p><div className="onboarding-step"><div className="auth-demo"><IconCheck size={16} />ภาษาไทย · บาท · Asia/Bangkok</div><div className="auth-demo"><IconCheck size={16} />ยอดขายไม่ต้องมีสูตรก็เริ่มบันทึกได้</div><div className="auth-demo"><IconCheck size={16} />ทุกการบันทึกมี audit trail และ idempotency key</div></div>{error && <div className="auth-error" role="alert">{error}</div>}<div className="onboarding-footer"><button type="button" className="button button-quiet" onClick={() => setStep(1)} disabled={pending}>ย้อนกลับ</button><button type="button" className="button button-primary" onClick={complete} disabled={pending}>{pending ? "กำลังสร้างร้าน…" : <>เข้า Dashboard <IconArrowRight size={16} /></>}</button></div></>}
    </div><p className="onboarding-aside">LanLu จะใช้ข้อมูลของร้านคุณเพื่อคำนวณยอดขาย สต๊อก ต้นทุนโดยประมาณ และ forecast แบบอธิบายได้. ถ้าข้อมูลยังไม่พอ ระบบจะแสดงข้อจำกัดแทน insight ปลอม</p></div>;
}

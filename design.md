# ร้านรู้ (LanLu) — Design Spec

อ้างอิงจากไฟล์ `lanlu-ui-mockup.html` หน้า "ภาพรวมร้าน" (Dashboard)

---

## 1. Typography

**ฟอนต์หลัก:** `Prompt` (Google Fonts) — ใช้ทั้งหน้า ทั้งหัวข้อและเนื้อหา
```
https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700&display=swap
```

| Element | Weight | Size | Color |
|---|---|---|---|
| Brand name (โลโก้) | 700 | 18px | `--clay-dark` |
| Brand sub (LANLU DASHBOARD) | 400 | 10.5px | `--coffee-2` |
| Nav item | 400 (active: 500) | 14px | `--coffee-2` (active: `--paper`) |
| Page title | 700 | 24px | `--coffee` |
| Page sub | 400 | 13px | `--coffee-2` |
| Date pill | 500 | 12.5px | `--clay-dark` |
| KPI label | 400 | 12px | `--coffee-2` |
| KPI value | 700 | 22px (เมนูขายดี: 18px) | `--coffee` |
| KPI delta | 500 | 11.5px | ตามสถานะ (`up` / `warn-text` / `down-text`) |
| Card title | 500 | 14.5px | `--coffee` |
| Bar day label | 400 | 11px | `--coffee-2` |
| Time chip | 400 (hot: 500) | 11px | `--coffee-2` (hot: `#5C420E`) |
| Stock name | 500 | 13px | `--coffee` |
| Stock sub | 400 | 11px | `--coffee-2` |
| Stock status pill | 500 | 11px | ตามสถานะ |
| Reco tag | 500 | 10.5px | ตามหมวด |
| Reco text | 400 | 12.5px, line-height 1.6 | `--coffee` |

---

## 2. Color tokens

```css
--cream:     #FFF6EA   /* ไม่ได้ใช้เป็น bg หลักแล้ว แต่เก็บไว้ */
--cream-2:   #FBE9CF   /* bg รอง เช่น time-chip, reco-item */
--page:      #FCEFDD   /* พื้นหลังทั้งหน้า (body) */
--coffee:    #5B4030   /* ข้อความหลัก */
--coffee-2:  #8A6F58   /* ข้อความรอง/คำอธิบาย */
--clay:      #EC9760   /* สีเน้นหลัก (ปุ่ม active, กราฟแท่ง) */
--clay-dark: #C8703C   /* ข้อความ/ไอคอนบนพื้น clay-soft */
--clay-soft: #FBDFC4   /* พื้นหลัง sidebar */
--sage:      #9DBE8B   /* สถานะปกติ (จุด) */
--sage-dark: #5D7C4C   /* ข้อความสถานะปกติ */
--honey:     #F6C766   /* สถานะเฝ้าระวัง / กราฟแท่งพีค */
--honey-dark:#A67819   /* ข้อความสถานะเฝ้าระวัง */
--rust:      #EA8F79   /* สถานะใกล้หมด/ด่วน (จุด) */
--rust-dark: #C2664F   /* ข้อความสถานะด่วน */
--paper:     #FFFEFB   /* พื้นหลังการ์ด/พื้นผิวขาว */
--line:      #F1DFC2   /* เส้นขอบการ์ด/เส้นแบ่ง */
```

**Semantic mapping (สถานะ):**
| สถานะ | จุด (dot) | พื้นหลังป้าย | ข้อความป้าย |
|---|---|---|---|
| ปกติ (เขียว) | `--sage` #9DBE8B | `#EAF2E3` | `--sage-dark` #5D7C4C |
| เฝ้าระวัง (เหลือง) | `--honey` #F6C766 | `#FDF0D4` | `--honey-dark` #A67819 |
| ใกล้หมด/ด่วน (แดง) | `--rust` #EA8F79 | `#FBE5DD` | `--rust-dark` #C2664F |

**Reco tag colors:**
- วัตถุดิบ (`tag-stock`): bg `#FBE5DD` / text `--rust-dark`
- โปรโมชัน (`tag-promo`): bg `#FDF0D4` / text `--honey-dark`
- ยอดขาย (`tag-sale`): bg `#EAF2E3` / text `--sage-dark`

---

## 3. Layout & spacing

- โครงหน้า: `.app` เป็น `display:flex` มี `padding:16px; gap:16px` ครอบทั้ง sidebar + main
- พื้นหลังหน้าเว็บ: `--page` (#FCEFDD)
- Sidebar กว้าง `224px` ลอยเป็นการ์ดมุมมน `border-radius:26px` พื้นหลัง `--clay-soft` ขอบ `1.5px solid #F5CFA0` padding `22px 16px`
- Main content: `flex:1; max-width:1180px; padding:6px 8px`
- Card ทั่วไป (`.card`, `.reco-card`): bg `--paper`, border `1.5px solid var(--line)`, `border-radius:20px`, padding `17–18px`
- KPI grid: `grid-template-columns: repeat(4, 1fr); gap:14px`
- แถวกราฟ + สถานะวัตถุดิบ (`.row`): `grid-template-columns: 1.4fr 1fr; gap:14px`
- Reco grid: `grid-template-columns: repeat(2, 1fr); gap:12px`

---

## 4. Sidebar (nav)

- โลโก้: badge วงกลมย่อยขนาด `42x42px` bg `--clay` border `2px solid --paper` มุมมนไม่เท่ากันเล็กน้อย (organic blob) ตัวอักษร "LL" สีขาว น้ำหนัก 700
- Nav item: padding `10px 13px`, `border-radius:16px`, ไอคอนอยู่ในวงกลมขนาด `30x30px` bg `--paper`
- Nav item **active**: bg `--clay`, ข้อความสีขาว (`--paper`), น้ำหนัก 500, มีเงานุ่ม `box-shadow: 0 4px 10px rgba(200,112,60,.28)`, ไอคอนวงกลมด้านในเปลี่ยนเป็น `rgba(255,255,255,.28)`
- ไอคอน: SVG outline, `stroke-width:2`, ขนาด `16x16px`
- รายการเมนู 5 อัน: ภาพรวมร้าน (active) / ยอดขาย / คาดการณ์ / วัตถุดิบ / คำแนะนำ
- ท้าย sidebar: กล่องเล็ก bg `--paper` border-radius `16px` padding `14px` แสดงชื่อร้าน + เวลาที่อัปเดตล่าสุด

---

## 5. Components

### KPI card
- Label เล็กสีรอง → Value ตัวใหญ่ตัวหนา → Delta text สีตามสถานะ (เขียว = ดีขึ้น / เหลือง = เฝ้าระวัง / แดง = ต้องรีบจัดการ)

### กราฟยอดขายรายวัน (bar chart)
- แท่งกราฟ: `border-radius:10px 10px 4px 4px`, กว้างสูงสุด `28px`, สี `--clay` ปกติ, สี `--honey` สำหรับวันพีค (class `.bar.peak`)
- ใต้กราฟ: time chip แสดงช่วงเวลา ปกติ bg `--cream-2`, ช่วงพีค (`.hot`) bg `--honey` ข้อความสีน้ำตาลเข้ม `#5C420E`

### รายการสถานะวัตถุดิบ
- แต่ละแถวคั่นด้วยเส้นประ `1px dashed var(--line)`
- จุดสี (dot) 9x9px วงกลม + ชื่อ/รายละเอียดย่อย + ป้ายสถานะชิดขวา (pill, border-radius 12px)

### การ์ดคำแนะนำ (Smart Recommendations)
- แต่ละ item: bg `--cream-2`, `border-radius:16px`, padding `13px 14px`
- แท็กหมวดหมู่ด้านบน (pill, border-radius 10px) ตามสี semantic ด้านบน
- เนื้อหาแนะนำเป็นประโยคสั้น อ่านจบในบรรทัดเดียว–สองบรรทัด

---

## 6. หน้าอื่นที่ยังไม่ได้ขึ้นดีไซน์ (คงโครง sidebar/สไตล์เดียวกัน)
1. ยอดขาย (Sales Analytics)
2. คาดการณ์ (Sales Forecast)
3. วัตถุดิบ (Inventory & Alerts)
4. คำแนะนำ (Smart Recommendations — เต็มหน้า)

ทุกหน้าใช้ sidebar, การ์ดมุมมน, สี และฟอนต์ชุดเดียวกันตามสเปกด้านบน เพื่อความต่อเนื่องของแบรนด์

# DSP Production Planner

เครื่องคำนวณสายการผลิตสำหรับเกม **Dyson Sphere Program** — ใส่ไอเทมและอัตราที่ต้องการ แล้วได้จำนวนเครื่องจักร วัตถุดิบดิบ การใช้ Proliferator และไฟฟ้าทั้งหมด

## เริ่มใช้งาน

```bash
npm install
npm run dev        # เปิด http://localhost:5173
npm test           # รัน unit test ของตัวคำนวณ
npm run build      # build ไฟล์เว็บไว้ที่ dist/
```

ต้องใช้ Node.js 20 ขึ้นไป

## ความสามารถ

- **จำนวนเครื่องจักรตามอัตราที่ต้องการ** — แสดงทั้งค่าทศนิยมและจำนวนที่ต้องสร้างจริง (ปัดขึ้น)
- **วัตถุดิบดิบทั้งหมด** — ไล่ต้นไม้สูตรจนถึงแร่/น้ำมัน/น้ำ
- **เลือกระดับเครื่อง** ทั้งโปรเจกต์ (เตาหลอม, เครื่องประกอบ, โรงงานเคมี, แล็บ) หรือรายสูตร
- **Proliferator Mk.I–III** ทั้งโหมด Extra Products และ Speedup ทั้งโปรเจกต์หรือรายสูตร
  - สูตรที่เกมไม่อนุญาต Extra Products จะเปลี่ยนเป็น Speedup อัตโนมัติ
  - คำนวณจำนวน Proliferator ที่ใช้พ่น และ (เลือกได้) นับการผลิต Proliferator เข้าไปในสายการผลิต
- **ไฟฟ้า** — ไฟขณะทำงาน (รวมโบนัสไฟจาก Proliferator) + ไฟว่างของเครื่องส่วนที่ปัดขึ้น
- **เลือกสูตรทางเลือก** เช่น Graphene จาก Fire Ice, Energetic Graphite จาก X-ray Cracking หรือกำหนดไอเทมใดๆ เป็นวัตถุดิบนำเข้า (เช่น Hydrogen จากก๊าซยักษ์)
- **ผลพลอยได้** (เช่น Hydrogen จาก Plasma Refining) ถูกนำไปหักลบความต้องการอัตโนมัติ ส่วนที่เหลือแสดงเป็น "ของเหลือ"
- สลับหน่วย ต่อนาที/ต่อวินาที, บันทึกการตั้งค่าไว้ในเบราว์เซอร์

## โครงสร้างโปรเจกต์

```
scripts/build-data.mjs     แปลงข้อมูลเกมจาก FactorioLab -> src/data/dsp-data.json
src/data/dsp-data.json     ข้อมูลไอเทม สูตร เครื่องจักร Proliferator (สร้างจากสคริปต์)
src/data/types.ts          type ของข้อมูลเกม
src/core/calculator.ts     ตัวคำนวณ (ไม่ผูกกับ React ใช้ใน CLI/backend ได้)
src/core/calculator.test.ts  unit test
src/core/gameData.ts       โหลดข้อมูล + กลุ่มเครื่องจักรที่ใช้ใน UI
src/ui/                    คอมโพเนนต์ React
src/App.tsx                หน้าหลักและการเก็บสถานะ
```

### ใช้ตัวคำนวณโดยตรง

```ts
import { Calculator, DEFAULT_SETTINGS } from './src/core/calculator';
import data from './src/data/dsp-data.json';

const calc = new Calculator(data as any);
const res = calc.calculate({
  ...DEFAULT_SETTINGS,
  targets: [{ itemId: 'universe-matrix', perMinute: 60 }],
  preferredMachines: ['plane-smelter', 'assembling-machine-3', 'quantum-chemical-plant', 'matrix-lab'],
  proliferator: { level: 3, mode: 'productivity' },
});
console.log(res.raw, res.totalPowerKW, res.machineTotals);
```

หน่วยภายในตัวคำนวณเป็น **ต่อวินาที** และกำลังไฟเป็น **kW** (ยกเว้น `targets[].perMinute`)

### วิธีคำนวณ

ไอเทมแต่ละตัวผูกกับสูตรที่เลือก 1 สูตร จากนั้นตัวคำนวณวนปรับอัตราการรันของทุกสูตร (fixed-point iteration) จนความต้องการสมดุล วิธีนี้รองรับสูตรที่ให้ผลผลิตหลายอย่างและวงจรวนกลับ ถ้าไม่สมดุลภายใน 5,000 รอบ `converged` จะเป็น `false`

สูตรคำนวณหลัก:

- จำนวนเครื่อง = รอบการผลิตต่อวินาที × เวลาสูตร ÷ (ความเร็วเครื่อง × โบนัส Speedup)
- Extra Products: ผลผลิตต่อรอบ × (1 + โบนัส) ความเร็วเท่าเดิม
- Proliferator ที่ใช้ = จำนวนไอเทมขาเข้าที่ถูกพ่น ÷ จำนวนครั้งที่พ่นได้ (12 / 24 / 60)

## อัปเดตข้อมูลเมื่อเกมอัปเดต

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/factoriolab/factoriolab.git /tmp/fl
(cd /tmp/fl && git sparse-checkout set public/data/dsp)
npm run build-data -- /tmp/fl/public/data/dsp
npm test
```

ค่าสูตรเริ่มต้นของแต่ละไอเทมเลือกใน `scripts/build-data.mjs` (สูตรที่ชื่อตรงกับไอเทม > สูตรผลิตปกติ > สูตรขุด)

## ข้อจำกัดที่รู้อยู่

- ไม่คำนวณจำนวนเครื่องขุดแร่ (ขึ้นกับจำนวนสายแร่และ Mining Productivity) แสดงเป็นอัตราวัตถุดิบดิบแทน
- ไม่คำนวณสายพาน/Sorter และไม่คิดผลของ Proliferator Mk.III ที่พ่นตัวเอง (75 ครั้ง)
- Fractionator คิดตามข้อมูลเวลาสูตรใน dataset ซึ่งจริงๆ ขึ้นกับความเร็วสายพาน
- ชื่อไอเทมเป็นภาษาอังกฤษตามเกม (มีชื่อจีนในข้อมูล `nameZh`)

## แนวทางพัฒนาต่อ

- แชร์ลิงก์การตั้งค่าผ่าน URL
- คำนวณสายพานและ Sorter
- ตัวแก้สมการเชิงเส้น (LP) เพื่อเลือกสูตรที่ใช้ทรัพยากรน้อยที่สุดอัตโนมัติ
- ไอคอนไอเทมและชื่อภาษาไทย

## ที่มาข้อมูล

ข้อมูลเกมแปลงจาก [FactorioLab](https://github.com/factoriolab/factoriolab) (MIT License, © Doug Broad) ดูรายละเอียดที่ `NOTICE.md` ชื่อ Dyson Sphere Program เป็นของ Youthcat Studio โปรเจกต์นี้ไม่ได้เกี่ยวข้องกับผู้พัฒนาเกม

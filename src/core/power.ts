/**
 * คำนวณเครื่องปั่นไฟที่ต้องใช้เพื่อจ่ายไฟให้สายการผลิต
 *
 * กำลังผลิตของเครื่องที่ใช้ไฟฟ้า (Wind / Solar / Geothermal) อ่านจากข้อมูลเกม
 * ส่วนเครื่องที่เผาเชื้อเพลิงและ Ray Receiver ข้อมูล FactorioLab ไม่มีค่ากำลังผลิต จึงกำหนดค่าจากในเกมไว้ที่นี่
 */
import type { GameData, ItemId, MachineId } from '../data/types';

export interface GeneratorSpec {
  id: MachineId;
  /** กำลังผลิตสูงสุดต่อเครื่อง (kW) — undefined = อ่านจากข้อมูลเกม (usage ติดลบ) */
  outputKW?: number;
  /** ชนิดเชื้อเพลิงที่รับได้ (ไม่มี = ไม่ใช้เชื้อเพลิง) */
  fuelType?: string;
  defaultFuel?: ItemId;
  /** เงื่อนไขที่ทำให้ได้กำลังเต็ม */
  note?: string;
}

export const GENERATORS: GeneratorSpec[] = [
  { id: 'thermal-power-plant', outputKW: 2160, fuelType: 'chemical', defaultFuel: 'coal' },
  { id: 'mini-fusion-power-plant', outputKW: 9000, fuelType: 'nuclear', defaultFuel: 'deuteron-fuel-rod' },
  { id: 'artificial-star', outputKW: 72000, fuelType: 'antimatter', defaultFuel: 'antimatter-fuel-rod' },
  { id: 'wind-turbine', note: 'ค่าที่ความแรงลม 100% ดาวแต่ละดวงไม่เท่ากัน' },
  { id: 'solar-panel', note: 'ค่าที่แสงอาทิตย์ 100% และรับแสงตลอด กลางคืนไม่ได้ไฟ' },
  { id: 'geothermal-power-station', note: 'ค่าพื้นฐาน ขึ้นกับความแรงความร้อนใต้ดินของดาว' },
  { id: 'ray-receiver', outputKW: 15000, note: 'เมื่อ Dyson Sphere ส่งพลังงานให้เต็มกำลัง' },
];

export interface GeneratorPlan {
  generator: GeneratorSpec;
  outputKW: number;
  /** จำนวนเครื่องแบบทศนิยม */
  exact: number;
  /** จำนวนเครื่องที่ต้องสร้างจริง (ปัดขึ้น) */
  count: number;
  fuel?: ItemId;
  /** เชื้อเพลิงที่ใช้ (ชิ้น/วินาที) เมื่อทุกเครื่องเดินรวมกันเท่ากับไฟที่ต้องใช้ */
  fuelPerSecond?: number;
}

export function generatorOutputKW(data: GameData, g: GeneratorSpec): number {
  return g.outputKW ?? -(data.machines[g.id]?.usage ?? 0);
}

/** เชื้อเพลิงที่เครื่องนี้ใช้ได้ เรียงจากพลังงานมากไปน้อย */
export function fuelsFor(data: GameData, g: GeneratorSpec): ItemId[] {
  if (!g.fuelType) return [];
  return Object.entries(data.fuels)
    .filter(([, f]) => f.types.includes(g.fuelType!))
    .sort((a, b) => b[1].value - a[1].value)
    .map(([id]) => id);
}

export function planGenerators(data: GameData, powerKW: number, g: GeneratorSpec, fuel?: ItemId): GeneratorPlan {
  const outputKW = generatorOutputKW(data, g);
  const exact = outputKW > 0 ? powerKW / outputKW : 0;
  const plan: GeneratorPlan = { generator: g, outputKW, exact, count: Math.max(0, Math.ceil(exact - 1e-9)) };
  if (g.fuelType) {
    const usable = fuelsFor(data, g);
    plan.fuel = fuel && usable.includes(fuel) ? fuel : (g.defaultFuel ?? usable[0]);
    const mj = plan.fuel ? data.fuels[plan.fuel]?.value : undefined;
    // kW = kJ/s -> MJ/s หารด้วย MJ ต่อชิ้น
    if (mj) plan.fuelPerSecond = powerKW / 1000 / mj;
  }
  return plan;
}

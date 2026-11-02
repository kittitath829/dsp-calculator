import { describe, expect, it } from 'vitest';
import raw from '../data/dsp-data.json';
import type { GameData } from '../data/types';
import { GENERATORS, fuelsFor, planGenerators } from './power';

const data = raw as unknown as GameData;
const gen = (id: string) => GENERATORS.find((g) => g.id === id)!;

describe('planGenerators', () => {
  it('Thermal Power Plant + Coal: 3264 kW ต้องใช้ 2 เครื่อง, ถ่านหิน ~72.5/นาที', () => {
    const p = planGenerators(data, 3264, gen('thermal-power-plant'));
    expect(p.exact).toBeCloseTo(3264 / 2160);
    expect(p.count).toBe(2);
    expect(p.fuel).toBe('coal');
    expect(p.fuelPerSecond! * 60).toBeCloseTo((3.264 / 2.7) * 60);
  });

  it('เปลี่ยนเชื้อเพลิงเป็น Hydrogen Fuel Rod (54 MJ)', () => {
    const p = planGenerators(data, 2160, gen('thermal-power-plant'), 'hydrogen-fuel-rod');
    expect(p.count).toBe(1);
    expect(p.fuelPerSecond).toBeCloseTo(2.16 / 54);
  });

  it('เชื้อเพลิงที่ใช้ไม่ได้กับเครื่องนี้ ถูกแทนด้วยค่าเริ่มต้น', () => {
    const p = planGenerators(data, 9000, gen('mini-fusion-power-plant'), 'coal');
    expect(p.fuel).toBe('deuteron-fuel-rod');
    expect(p.count).toBe(1);
  });

  it('Wind Turbine อ่านกำลังจากข้อมูลเกม (300 kW) และไม่ใช้เชื้อเพลิง', () => {
    const p = planGenerators(data, 3264, gen('wind-turbine'));
    expect(p.outputKW).toBe(300);
    expect(p.count).toBe(11);
    expect(p.fuelPerSecond).toBeUndefined();
  });

  it('ไม่ใช้ไฟ = ไม่ต้องสร้างเครื่อง', () => {
    expect(planGenerators(data, 0, gen('solar-panel')).count).toBe(0);
  });

  it('เชื้อเพลิงของ Artificial Star เรียงจากพลังงานมากไปน้อย', () => {
    expect(fuelsFor(data, gen('artificial-star'))).toEqual(['df-strange-annihilation-fuel-rod', 'antimatter-fuel-rod']);
  });
});

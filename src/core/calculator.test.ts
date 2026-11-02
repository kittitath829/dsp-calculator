import { describe, expect, it } from 'vitest';
import data from '../data/dsp-data.json';
import type { GameData } from '../data/types';
import { Calculator, DEFAULT_SETTINGS, type CalcSettings } from './calculator';

const calc = new Calculator(data as unknown as GameData);
const settings = (patch: Partial<CalcSettings>): CalcSettings => ({ ...DEFAULT_SETTINGS, ...patch });
const byId = (res: ReturnType<Calculator['calculate']>, id: string) =>
  res.recipes.find((r) => r.recipe.id === id)!;

describe('Calculator', () => {
  it('Iron Ingot 60/นาที ใช้ Arc Smelter 1 เครื่อง, Iron Ore 60/นาที, 360 kW', () => {
    const res = calc.calculate(settings({ targets: [{ itemId: 'iron-ingot', perMinute: 60 }] }));
    const r = byId(res, 'iron-ingot');
    expect(r.machineId).toBe('arc-smelter');
    expect(r.machines).toBeCloseTo(1);
    expect(res.raw['iron-ore'] * 60).toBeCloseTo(60);
    expect(res.totalPowerKW).toBeCloseTo(360);
    expect(res.converged).toBe(true);
  });

  it('Electromagnetic Matrix 60/นาที — ไล่ต้นไม้ถึงแร่ดิบและไฟฟ้าถูกต้อง', () => {
    const res = calc.calculate(settings({ targets: [{ itemId: 'electromagnetic-matrix', perMinute: 60 }] }));
    expect(byId(res, 'electromagnetic-matrix').machines).toBeCloseTo(3);
    expect(byId(res, 'circuit-board').machines).toBeCloseTo(0.5);
    expect(byId(res, 'magnetic-coil').machines).toBeCloseTo(0.5);
    expect(byId(res, 'magnet').machines).toBeCloseTo(1.5);
    expect(res.raw['iron-ore'] * 60).toBeCloseTo(120);
    expect(res.raw['copper-ore'] * 60).toBeCloseTo(60);
    // labs 1440 + circuit (270+9) + coil (270+9) + magnet (540+6) + iron 360 + copper 360
    expect(res.totalPowerKW).toBeCloseTo(3264);
    expect(res.machineTotals['matrix-lab']).toBe(3);
  });

  it('Proliferator Mk.III แบบ Extra Products: ผลผลิต +25%, ไฟ +150%', () => {
    const res = calc.calculate(
      settings({
        targets: [{ itemId: 'electromagnetic-matrix', perMinute: 60 }],
        proliferator: { level: 3, mode: 'productivity' },
        includeProliferatorProduction: false,
      }),
    );
    const lab = byId(res, 'electromagnetic-matrix');
    expect(lab.machines).toBeCloseTo(2.4);
    expect(lab.inputs['circuit-board']).toBeCloseTo(0.8);
    expect(lab.powerKW).toBeCloseTo(2.4 * 480 * 2.5 + 0.6 * 12);
    expect(res.proliferatorUsage['proliferator-3']).toBeGreaterThan(0);
  });

  it('Proliferator แบบ Speedup: เครื่องลดลงครึ่งหนึ่งที่ Mk.III (+100%)', () => {
    const res = calc.calculate(
      settings({
        targets: [{ itemId: 'electromagnetic-matrix', perMinute: 60 }],
        proliferator: { level: 3, mode: 'speed' },
        includeProliferatorProduction: false,
      }),
    );
    expect(byId(res, 'electromagnetic-matrix').machines).toBeCloseTo(1.5);
    // พ่น 2 ชิ้น/วินาที, Mk.III พ่นได้ 60 ครั้ง
    const sprayedLab = 2;
    expect(res.proliferatorUsage['proliferator-3']).toBeGreaterThan(sprayedLab / 60);
  });

  it('สูตรที่ไม่รองรับ Extra Products จะเปลี่ยนเป็น Speedup อัตโนมัติ', () => {
    const res = calc.calculate(
      settings({
        targets: [{ itemId: 'deuterium', perMinute: 60 }],
        proliferator: { level: 1, mode: 'productivity' },
        includeProliferatorProduction: false,
      }),
    );
    const r = byId(res, 'deuterium');
    expect(r.proliferator.mode).toBe('speed');
    expect(r.proliferatorFallback).toBe(true);
  });

  it('ผลพลอยได้: Plasma Refining ผลิต Refined Oil แล้ว Hydrogen เหลือเป็น surplus', () => {
    const res = calc.calculate(settings({ targets: [{ itemId: 'refined-oil', perMinute: 120 }] }));
    const r = byId(res, 'plasma-refining');
    expect(r.craftsPerSecond).toBeCloseTo(1);
    expect(r.machines).toBeCloseTo(4);
    expect(res.surplus['hydrogen'] * 60).toBeCloseTo(60);
    expect(res.raw['crude-oil'] * 60).toBeCloseTo(120);
  });

  it('ผลพลอยได้ถูกนำไปใช้แทนการผลิตเพิ่ม: ต้องการทั้ง Refined Oil และ Hydrogen', () => {
    const res = calc.calculate(
      settings({
        targets: [
          { itemId: 'refined-oil', perMinute: 120 },
          { itemId: 'hydrogen', perMinute: 60 },
        ],
      }),
    );
    expect(byId(res, 'plasma-refining').craftsPerSecond).toBeCloseTo(1);
    expect(res.surplus['hydrogen'] ?? 0).toBeCloseTo(0);
  });

  it('วงจรวนกลับ (X-ray Cracking) คำนวณจนสมดุล', () => {
    const res = calc.calculate(
      settings({
        targets: [{ itemId: 'energetic-graphite', perMinute: 60 }],
        recipeOverride: { 'energetic-graphite': 'x-ray-cracking' },
      }),
    );
    expect(res.converged).toBe(true);
    const xr = byId(res, 'x-ray-cracking');
    expect(xr.craftsPerSecond).toBeCloseTo(1);
    // X-ray: ใช้ H 2 ได้ H 3 -> เหลือ 1/s, Plasma refining (0.5/s) ให้ H อีก 0.5/s
    expect(res.surplus['hydrogen']).toBeCloseTo(1.5);
    expect(res.raw['crude-oil']).toBeCloseTo(1);
  });

  it('forceRaw: ถือ Hydrogen เป็นวัตถุดิบดิบ', () => {
    const res = calc.calculate(
      settings({ targets: [{ itemId: 'deuterium', perMinute: 30 }], forceRaw: ['hydrogen'] }),
    );
    expect(res.raw['hydrogen']).toBeCloseTo(1);
    expect(res.recipes.find((r) => r.recipe.id === 'plasma-refining')).toBeUndefined();
  });

  it('เลือกเครื่องรายสูตรได้', () => {
    const res = calc.calculate(
      settings({
        targets: [{ itemId: 'iron-ingot', perMinute: 120 }],
        recipeSettings: { 'iron-ingot': { machine: 'plane-smelter' } },
      }),
    );
    const r = byId(res, 'iron-ingot');
    expect(r.machineId).toBe('plane-smelter');
    expect(r.machines).toBeCloseTo(1);
  });

  it('นับการผลิต Proliferator ที่ใช้ด้วย (ต้องใช้ถ่านหินเพิ่ม)', () => {
    const res = calc.calculate(
      settings({
        targets: [{ itemId: 'iron-ingot', perMinute: 60 }],
        proliferator: { level: 1, mode: 'speed' },
        includeProliferatorProduction: true,
      }),
    );
    expect(res.converged).toBe(true);
    expect(res.recipes.some((r) => r.recipe.id === 'proliferator-1')).toBe(true);
    expect(res.raw['coal']).toBeGreaterThan(0);
  });
  it('เป้าหมายแบบจำนวนเครื่อง: Matrix Lab 5 เครื่องทำงานต่อเนื่อง = 100/นาที', () => {
    const res = calc.calculate(settings({ targets: [{ itemId: 'electromagnetic-matrix', perMinute: 0, machines: 5 }] }));
    expect(byId(res, 'electromagnetic-matrix').machines).toBeCloseTo(5);
    expect(res.items['electromagnetic-matrix'].target * 60).toBeCloseTo(100);
    expect(res.raw['iron-ore'] * 60).toBeCloseTo(200);
  });

  it('เป้าหมายแบบจำนวนเครื่องคิดตามเครื่องที่เลือก (Plane Smelter เร็ว 2 เท่า)', () => {
    const s = settings({ targets: [{ itemId: 'iron-ingot', perMinute: 0, machines: 2 }] });
    expect(calc.targetRate(s.targets[0], s) * 60).toBeCloseTo(120);
    const fast = { ...s, preferredMachines: ['plane-smelter', 'assembling-machine-2', 'chemical-plant', 'matrix-lab'] };
    expect(calc.targetRate(fast.targets[0], fast) * 60).toBeCloseTo(240);
    expect(byId(calc.calculate(fast), 'iron-ingot').machines).toBeCloseTo(2);
  });

  it('วัตถุดิบดิบไม่มีเครื่องผลิต: ratePerMachine เป็น undefined', () => {
    expect(calc.ratePerMachine('iron-ore', DEFAULT_SETTINGS)).toBeUndefined();
  });
});

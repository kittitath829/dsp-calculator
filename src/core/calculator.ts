/**
 * ตัวคำนวณสายการผลิต Dyson Sphere Program
 *
 * ไม่ผูกกับ React — นำไปใช้ใน CLI, backend หรือเทสต์ได้โดยตรง
 * หน่วยภายในทั้งหมดเป็น "ต่อวินาที" และกำลังไฟเป็น kW
 *
 * วิธีคำนวณ: ไอเทมแต่ละตัวมีสูตรที่ถูกเลือก 1 สูตร แล้ววนคำนวณ (fixed-point iteration)
 * อัตราการรันของแต่ละสูตร จนความต้องการทั้งหมดสมดุล วิธีนี้รองรับ
 *  - ผลพลอยได้ (เช่น Plasma Refining ได้ทั้ง Refined Oil และ Hydrogen) — นำไปหักลบความต้องการให้อัตโนมัติ
 *  - วงจรวนกลับ (เช่น X-ray Cracking ใช้ Hydrogen แล้วได้ Hydrogen คืน)
 */
import type { GameData, ItemId, MachineId, Recipe, RecipeId } from '../data/types';

export type ProliferatorMode = 'speed' | 'productivity';

export interface ProliferatorSetting {
  /** 0 = ไม่ใช้ */
  level: 0 | 1 | 2 | 3;
  mode: ProliferatorMode;
}

export interface RecipeSetting {
  machine?: MachineId;
  proliferator?: ProliferatorSetting;
}

export interface Target {
  itemId: ItemId;
  /** ชิ้นต่อนาที */
  perMinute: number;
}

export interface CalcSettings {
  targets: Target[];
  /** เครื่องจักรที่ต้องการใช้ (เลือกตัวแรกที่สูตรรองรับ) เช่น ['plane-smelter','assembling-machine-2'] */
  preferredMachines: MachineId[];
  proliferator: ProliferatorSetting;
  /** เลือกสูตรเองสำหรับไอเทมบางตัว */
  recipeOverride: Record<ItemId, RecipeId>;
  /** บังคับให้ถือเป็นวัตถุดิบดิบ (ไม่คำนวณย้อนต่อ) เช่น hydrogen จากก๊าซยักษ์ */
  forceRaw: ItemId[];
  /** ตั้งค่าเครื่อง/Proliferator รายสูตร */
  recipeSettings: Record<RecipeId, RecipeSetting>;
  /** นับการผลิต Proliferator ที่ใช้พ่นเข้าไปในสายการผลิตด้วย */
  includeProliferatorProduction: boolean;
}

export interface RecipeResult {
  recipe: Recipe;
  /** จำนวนรอบการผลิตต่อวินาที (รวมทุกเครื่อง) */
  craftsPerSecond: number;
  machineId: MachineId;
  /** จำนวนเครื่องแบบทศนิยม */
  machines: number;
  /** จำนวนเครื่องที่ต้องสร้างจริง (ปัดขึ้น) */
  machinesCeil: number;
  /** กำลังไฟรวม (kW) = ขณะทำงาน + ไฟว่างของเครื่องที่ปัดขึ้น */
  powerKW: number;
  /** Proliferator ที่ใช้จริง (อาจถูกปรับจาก productivity -> speed ถ้าสูตรไม่รองรับ) */
  proliferator: ProliferatorSetting;
  proliferatorFallback: boolean;
  inputs: Record<ItemId, number>;
  outputs: Record<ItemId, number>;
  /** ระดับความลึกจากเป้าหมาย (0 = สูตรของเป้าหมาย) */
  depth: number;
}

export interface ItemFlow {
  itemId: ItemId;
  produced: number;
  consumed: number;
  target: number;
  surplus: number;
  raw: boolean;
  recipeId?: RecipeId;
}

export interface CalcResult {
  recipes: RecipeResult[];
  items: Record<ItemId, ItemFlow>;
  /** วัตถุดิบดิบที่ต้องป้อนเข้า (ต่อวินาที) */
  raw: Record<ItemId, number>;
  /** ผลพลอยได้ที่เหลือใช้ (ต่อวินาที) */
  surplus: Record<ItemId, number>;
  /** Proliferator ที่ต้องใช้พ่น (ชิ้นต่อวินาที) */
  proliferatorUsage: Record<ItemId, number>;
  totalPowerKW: number;
  machineTotals: Record<MachineId, number>;
  converged: boolean;
  iterations: number;
}

export const DEFAULT_SETTINGS: CalcSettings = {
  targets: [],
  preferredMachines: ['arc-smelter', 'assembling-machine-2', 'chemical-plant', 'matrix-lab'],
  proliferator: { level: 0, mode: 'productivity' },
  recipeOverride: {},
  forceRaw: [],
  recipeSettings: {},
  includeProliferatorProduction: true,
};

const EPS = 1e-12;
const MAX_ITER = 5000;

export class Calculator {
  readonly recipesById = new Map<RecipeId, Recipe>();
  readonly recipesByOutput = new Map<ItemId, Recipe[]>();

  constructor(readonly data: GameData) {
    for (const r of data.recipes) {
      this.recipesById.set(r.id, r);
      for (const o of Object.keys(r.out)) {
        const list = this.recipesByOutput.get(o) ?? [];
        list.push(r);
        this.recipesByOutput.set(o, list);
      }
    }
  }

  /** สูตรทั้งหมดที่ผลิตไอเทมนี้ได้ */
  recipesFor(itemId: ItemId): Recipe[] {
    return this.recipesByOutput.get(itemId) ?? [];
  }

  /** สูตรที่จะใช้กับไอเทมนี้ หรือ undefined ถ้าเป็นวัตถุดิบดิบ */
  chosenRecipe(itemId: ItemId, s: CalcSettings): Recipe | undefined {
    if (s.forceRaw.includes(itemId)) return undefined;
    const id = s.recipeOverride[itemId] ?? this.data.defaultRecipe[itemId];
    const r = id ? this.recipesById.get(id) : undefined;
    if (!r || r.mining || !r.out[itemId]) return undefined;
    return r;
  }

  machineFor(recipe: Recipe, s: CalcSettings): MachineId {
    const override = s.recipeSettings[recipe.id]?.machine;
    if (override && recipe.producers.includes(override)) return override;
    return recipe.producers.find((p) => s.preferredMachines.includes(p)) ?? recipe.producers[0];
  }

  /** คืนค่าตัวคูณของสูตร: ผลผลิตต่อรอบ, ความเร็ว, ไฟ, proliferator ที่ใช้จริง */
  private effects(recipe: Recipe, machineId: MachineId, s: CalcSettings) {
    const machine = this.data.machines[machineId];
    const wanted = s.recipeSettings[recipe.id]?.proliferator ?? s.proliferator;
    const canSpray =
      wanted.level > 0 && machine?.acceptsProliferator && Object.keys(recipe.in).length > 0;
    if (!canSpray) {
      return { outMult: 1, speedMult: 1, powerMult: 1, prolif: { level: 0, mode: wanted.mode } as ProliferatorSetting, fallback: false };
    }
    const p = this.data.proliferators.find((x) => x.level === wanted.level)!;
    let mode = wanted.mode;
    let fallback = false;
    if (mode === 'productivity' && !recipe.allowProductivity) {
      mode = 'speed';
      fallback = true;
    }
    return {
      outMult: mode === 'productivity' ? 1 + p.productivityBonus : 1,
      speedMult: mode === 'speed' ? 1 + p.speedBonus : 1,
      powerMult: 1 + p.powerBonus,
      prolif: { level: wanted.level, mode } as ProliferatorSetting,
      fallback,
    };
  }

  calculate(s: CalcSettings): CalcResult {
    const targets: Record<ItemId, number> = {};
    for (const t of s.targets) {
      if (t.perMinute > 0) targets[t.itemId] = (targets[t.itemId] ?? 0) + t.perMinute / 60;
    }

    // --- เตรียมสูตรที่เกี่ยวข้องทั้งหมด (BFS จากเป้าหมาย) ---
    const active = new Map<RecipeId, { recipe: Recipe; machineId: MachineId; fx: ReturnType<Calculator['effects']> }>();
    const owner = new Map<ItemId, RecipeId>(); // ไอเทม -> สูตรที่รับผิดชอบผลิต
    const depth = new Map<RecipeId, number>();
    const rawItems = new Set<ItemId>();
    const queue: Array<[ItemId, number]> = Object.keys(targets).map((i) => [i, 0]);
    const seenItems = new Set<ItemId>();

    const visit = (itemId: ItemId, d: number) => queue.push([itemId, d]);

    while (queue.length) {
      const [itemId, d] = queue.shift()!;
      if (seenItems.has(itemId)) continue;
      seenItems.add(itemId);
      const recipe = this.chosenRecipe(itemId, s);
      if (!recipe) {
        rawItems.add(itemId);
        continue;
      }
      owner.set(itemId, recipe.id);
      if (!active.has(recipe.id)) {
        const machineId = this.machineFor(recipe, s);
        const fx = this.effects(recipe, machineId, s);
        active.set(recipe.id, { recipe, machineId, fx });
        depth.set(recipe.id, d);
        for (const inp of Object.keys(recipe.in)) visit(inp, d + 1);
        if (s.includeProliferatorProduction && fx.prolif.level > 0) {
          visit(`proliferator-${fx.prolif.level}`, d + 1);
        }
      }
    }

    // --- วนคำนวณอัตรา ---
    const rate = new Map<RecipeId, number>();
    for (const id of active.keys()) rate.set(id, 0);

    const computeFlows = () => {
      const produced: Record<ItemId, number> = {};
      const consumed: Record<ItemId, number> = {};
      const prolifUse: Record<ItemId, number> = {};
      for (const [id, a] of active) {
        const x = rate.get(id)!;
        if (x <= 0) continue;
        for (const [o, n] of Object.entries(a.recipe.out)) produced[o] = (produced[o] ?? 0) + x * n * a.fx.outMult;
        let sprayed = 0;
        for (const [i, n] of Object.entries(a.recipe.in)) {
          consumed[i] = (consumed[i] ?? 0) + x * n;
          sprayed += x * n;
        }
        if (a.fx.prolif.level > 0) {
          const p = this.data.proliferators.find((q) => q.level === a.fx.prolif.level)!;
          prolifUse[p.itemId] = (prolifUse[p.itemId] ?? 0) + sprayed / p.sprays;
        }
      }
      if (s.includeProliferatorProduction) {
        for (const [i, n] of Object.entries(prolifUse)) consumed[i] = (consumed[i] ?? 0) + n;
      }
      return { produced, consumed, prolifUse };
    };

    let converged = false;
    let iterations = 0;
    for (; iterations < MAX_ITER; iterations++) {
      const { produced, consumed } = computeFlows();
      const next = new Map<RecipeId, number>();
      for (const id of active.keys()) next.set(id, 0);

      for (const [itemId, recipeId] of owner) {
        const a = active.get(recipeId)!;
        const perCraft = a.recipe.out[itemId] * a.fx.outMult;
        const own = rate.get(recipeId)! * perCraft;
        const fromOthers = (produced[itemId] ?? 0) - own;
        const need = (targets[itemId] ?? 0) + (consumed[itemId] ?? 0) - fromOthers;
        const x = Math.max(0, need / perCraft);
        // สูตรที่ผลิตหลายไอเทม (เช่น plasma-refining) ใช้อัตราที่มากที่สุด
        if (x > next.get(recipeId)!) next.set(recipeId, x);
      }

      let delta = 0;
      for (const [id, x] of next) {
        delta = Math.max(delta, Math.abs(x - rate.get(id)!) / Math.max(1, x));
        rate.set(id, x);
      }
      if (delta < EPS) {
        converged = true;
        iterations++;
        break;
      }
    }

    // --- สรุปผล ---
    const { produced, consumed, prolifUse } = computeFlows();
    const recipes: RecipeResult[] = [];
    const machineTotals: Record<MachineId, number> = {};
    let totalPowerKW = 0;

    for (const [id, a] of active) {
      const x = rate.get(id)!;
      if (x <= EPS) continue;
      const m = this.data.machines[a.machineId];
      const machines = (x * a.recipe.time) / ((m?.speed ?? 1) * a.fx.speedMult);
      const machinesCeil = Math.ceil(machines - 1e-9);
      const powerKW = m?.electric
        ? machines * m.usage * a.fx.powerMult + (machinesCeil - machines) * m.drain
        : 0;
      totalPowerKW += powerKW;
      machineTotals[a.machineId] = (machineTotals[a.machineId] ?? 0) + machinesCeil;
      const inputs: Record<ItemId, number> = {};
      const outputs: Record<ItemId, number> = {};
      for (const [i, n] of Object.entries(a.recipe.in)) inputs[i] = x * n;
      for (const [o, n] of Object.entries(a.recipe.out)) outputs[o] = x * n * a.fx.outMult;
      recipes.push({
        recipe: a.recipe,
        craftsPerSecond: x,
        machineId: a.machineId,
        machines,
        machinesCeil,
        powerKW,
        proliferator: a.fx.prolif,
        proliferatorFallback: a.fx.fallback,
        inputs,
        outputs,
        depth: depth.get(id) ?? 0,
      });
    }
    recipes.sort((p, q) => p.depth - q.depth || q.machines - p.machines);

    const items: Record<ItemId, ItemFlow> = {};
    const raw: Record<ItemId, number> = {};
    const surplus: Record<ItemId, number> = {};
    const allItems = new Set([...Object.keys(produced), ...Object.keys(consumed), ...Object.keys(targets)]);
    for (const itemId of allItems) {
      const isRaw = rawItems.has(itemId);
      const p = produced[itemId] ?? 0;
      const c = consumed[itemId] ?? 0;
      const t = targets[itemId] ?? 0;
      const sur = p - c - t;
      items[itemId] = { itemId, produced: p, consumed: c, target: t, surplus: sur, raw: isRaw, recipeId: owner.get(itemId) };
      if (isRaw && c + t - p > 1e-9) raw[itemId] = c + t - p;
      else if (sur > 1e-9) surplus[itemId] = sur;
    }

    return { recipes, items, raw, surplus, proliferatorUsage: prolifUse, totalPowerKW, machineTotals, converged, iterations };
  }
}

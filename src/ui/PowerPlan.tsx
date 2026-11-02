import { useEffect, useState } from 'react';
import { gameData, itemName, machineName } from '../core/gameData';
import { GENERATORS, fuelsFor, generatorOutputKW, planGenerators } from '../core/power';
import type { ItemId, MachineId } from '../data/types';
import { fmt, fmtPower, toUnit, unitLabel, type RateUnit } from './format';
import { Icon } from './Icon';

const STORAGE_KEY = 'dsp-calculator:power';

interface Choice {
  generator: MachineId;
  /** เชื้อเพลิงที่เลือกไว้ของแต่ละเครื่อง */
  fuels: Record<MachineId, ItemId>;
}

function load(): Choice {
  const fallback: Choice = { generator: GENERATORS[0].id, fuels: {} };
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Choice | null;
    return s && GENERATORS.some((g) => g.id === s.generator) ? { ...fallback, ...s } : fallback;
  } catch {
    return fallback;
  }
}

/** เครื่องปั่นไฟที่ต้องสร้างเพื่อจ่ายไฟให้สายการผลิต และเชื้อเพลิงที่ต้องป้อน */
export function PowerPlan({ powerKW, unit }: { powerKW: number; unit: RateUnit }) {
  const [choice, setChoice] = useState<Choice>(load);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(choice));
    } catch {
      /* storage ไม่พร้อมใช้ — ไม่เป็นไร */
    }
  }, [choice]);

  const gen = GENERATORS.find((g) => g.id === choice.generator)!;
  const plan = planGenerators(gameData, powerKW, gen, choice.fuels[gen.id]);
  const fuels = fuelsFor(gameData, gen);

  return (
    <div className="power-plan">
      <div className="pp-pick">
        <h3>เครื่องปั่นไฟ</h3>
        <div className="pp-gens" role="radiogroup" aria-label="ชนิดเครื่องปั่นไฟ">
          {GENERATORS.map((g) => (
            <button
              key={g.id}
              type="button"
              role="radio"
              aria-checked={g.id === gen.id}
              className={g.id === gen.id ? 'active' : undefined}
              title={`${machineName(g.id)} — ${fmtPower(generatorOutputKW(gameData, g))} ต่อเครื่อง`}
              aria-label={machineName(g.id)}
              onClick={() => setChoice({ ...choice, generator: g.id })}
            >
              <Icon id={g.id} px={36} />
            </button>
          ))}
        </div>
      </div>

      <div className="pp-result">
        <div className="pp-count">
          <Icon id={gen.id} px={52} />
          <div>
            <strong>{machineName(gen.id)}</strong>
            <span className="pp-big num">
              {plan.count} <small>เครื่อง</small>
            </span>
            <small className="muted">
              ใช้จริง {fmt(plan.exact)} เครื่อง · {fmtPower(plan.outputKW)} ต่อเครื่อง
            </small>
          </div>
        </div>

        {gen.fuelType && plan.fuel && (
          <div className="pp-fuel">
            <label className="field">
              <span>เชื้อเพลิง</span>
              <select
                className="compact"
                value={plan.fuel}
                onChange={(e) => setChoice({ ...choice, fuels: { ...choice.fuels, [gen.id]: e.target.value } })}
              >
                {fuels.map((f) => (
                  <option key={f} value={f}>
                    {itemName(f)} ({fmt(gameData.fuels[f].value)} MJ)
                  </option>
                ))}
              </select>
            </label>
            <span className="named">
              <Icon id={plan.fuel} px={24} />
              <span className="num">
                {fmt(toUnit(plan.fuelPerSecond ?? 0, unit))}
                {unitLabel(unit)}
              </span>
            </span>
          </div>
        )}

        {gen.note && <p className="pp-note">{gen.note}</p>}
      </div>
    </div>
  );
}

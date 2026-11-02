import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_SETTINGS, type CalcSettings, type Target } from './core/calculator';
import { calculator, gameData, itemName, machineName } from './core/gameData';
import { Icon } from './ui/Icon';
import { ItemPicker } from './ui/ItemPicker';
import { Results } from './ui/Results';
import { SettingsPanel } from './ui/SettingsPanel';
import { fmt, toUnit, unitLabel, type RateUnit } from './ui/format';

const STORAGE_KEY = 'dsp-calculator:v1';

interface Saved {
  settings: CalcSettings;
  unit: RateUnit;
}

function load(): Saved {
  const fallback: Saved = {
    settings: { ...DEFAULT_SETTINGS, targets: [{ itemId: 'electromagnetic-matrix', perMinute: 60 }] },
    unit: 'min',
  };
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Saved | null;
    return s ? { unit: s.unit ?? 'min', settings: { ...DEFAULT_SETTINGS, ...s.settings } } : fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [{ settings, unit }, setState] = useState<Saved>(load);
  const setSettings = (s: CalcSettings) => setState((p) => ({ ...p, settings: s }));
  const setUnit = (u: RateUnit) => setState((p) => ({ ...p, unit: u }));

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings, unit }));
    } catch {
      /* storage ไม่พร้อมใช้ — ไม่เป็นไร */
    }
  }, [settings, unit]);

  const result = useMemo(() => calculator.calculate(settings), [settings]);
  const factor = unit === 'min' ? 1 : 60;

  const updateTarget = (idx: number, patch: Partial<Target>) =>
    setSettings({ ...settings, targets: settings.targets.map((t, i) => (i === idx ? { ...t, ...patch } : t)) });

  /** สลับเป้าหมายระหว่าง "อัตรา" กับ "จำนวนเครื่อง" โดยคงกำลังผลิตใกล้เคียงเดิม */
  const setTargetMode = (idx: number, byMachines: boolean) => {
    const t = settings.targets[idx];
    const perSec = calculator.targetRate(t, settings);
    if (byMachines) {
      const perMachine = calculator.ratePerMachine(t.itemId, settings) ?? 0;
      updateTarget(idx, { machines: perMachine > 0 ? Math.max(1, Math.ceil(perSec / perMachine - 1e-9)) : 1 });
    } else {
      setSettings({
        ...settings,
        targets: settings.targets.map((x, i) => (i === idx ? { itemId: x.itemId, perMinute: perSec * 60 } : x)),
      });
    }
  };

  return (
    <div className="app">
      <header className="masthead">
        <h1>
          DSP <span>Production Planner</span>
        </h1>
        <p>คำนวณเครื่องจักร วัตถุดิบ และไฟฟ้าสำหรับ Dyson Sphere Program</p>
      </header>

      <aside className="side">
        <section className="panel" aria-labelledby="targets-h">
          <h2 id="targets-h">อยากผลิตอะไร</h2>
          <ul className="targets">
            {settings.targets.map((t, idx) => (
              <li key={t.itemId}>
                <span className="t-name named">
                  <Icon id={t.itemId} px={44} title={itemName(t.itemId)} />
                  <span className="t-text">
                    {itemName(t.itemId)}
                    {(() => {
                      const r = result.recipes.find((x) => x.recipe.id === result.items[t.itemId]?.recipeId);
                      return (
                        r && (
                          <small className="t-machine">
                            <Icon id={r.machineId} px={20} />
                            {machineName(r.machineId)} ×{r.machinesCeil}
                          </small>
                        )
                      );
                    })()}
                  </span>
                </span>
                <div className="t-rate">
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={t.machines !== undefined ? t.machines : +(t.perMinute / factor).toFixed(4)}
                    aria-label={
                      t.machines !== undefined
                        ? `จำนวนเครื่องที่ผลิต ${itemName(t.itemId)}`
                        : `อัตราของ ${itemName(t.itemId)}`
                    }
                    onChange={(e) => {
                      const v = Math.max(0, Number(e.target.value));
                      updateTarget(idx, t.machines !== undefined ? { machines: v } : { perMinute: v * factor });
                    }}
                  />
                  <select
                    className="compact"
                    value={t.machines !== undefined ? 'machines' : 'rate'}
                    aria-label={`รูปแบบเป้าหมายของ ${itemName(t.itemId)}`}
                    onChange={(e) => setTargetMode(idx, e.target.value === 'machines')}
                  >
                    <option value="rate">{unit === 'min' ? '/นาที' : '/วิ'}</option>
                    {calculator.ratePerMachine(t.itemId, settings) !== undefined && (
                      <option value="machines">เครื่อง</option>
                    )}
                  </select>
                </div>
                {t.machines !== undefined && (
                  <small className="t-derived">
                    ทำงานต่อเนื่อง ≈ {fmt(toUnit(calculator.targetRate(t, settings), unit))}
                    {unitLabel(unit)}
                  </small>
                )}
                <button
                  className="icon-btn"
                  aria-label={`ลบ ${itemName(t.itemId)}`}
                  onClick={() => setSettings({ ...settings, targets: settings.targets.filter((_, i) => i !== idx) })}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <ItemPicker
            onPick={(id) =>
              settings.targets.some((t) => t.itemId === id) ||
              setSettings({ ...settings, targets: [...settings.targets, { itemId: id, perMinute: 60 }] })
            }
          />
        </section>

        <SettingsPanel settings={settings} onChange={setSettings} unit={unit} onUnit={setUnit} />

        <button
          className="reset"
          onClick={() => setSettings({ ...DEFAULT_SETTINGS, targets: settings.targets })}
        >
          ล้างการตั้งค่ารายสูตร
        </button>

        <p className="credit">
          ข้อมูลเกมเวอร์ชัน {gameData.gameVersion} จาก FactorioLab (MIT)
        </p>
      </aside>

      <main className="main">
        {settings.targets.length === 0 ? (
          <div className="empty">
            <p>เพิ่มไอเทมที่ต้องการผลิตจากช่องค้นหาด้านซ้าย แล้วระบบจะคำนวณสายการผลิตให้ทันที</p>
          </div>
        ) : (
          <Results result={result} settings={settings} onChange={setSettings} unit={unit} />
        )}
      </main>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_SETTINGS, type CalcSettings } from './core/calculator';
import { calculator, gameData, itemName } from './core/gameData';
import { ItemPicker } from './ui/ItemPicker';
import { Results } from './ui/Results';
import { SettingsPanel } from './ui/SettingsPanel';
import type { RateUnit } from './ui/format';

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

  const updateTarget = (idx: number, perMinute: number) =>
    setSettings({ ...settings, targets: settings.targets.map((t, i) => (i === idx ? { ...t, perMinute } : t)) });

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
                <span className="t-name">{itemName(t.itemId)}</span>
                <label className="t-rate">
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={+(t.perMinute / factor).toFixed(4)}
                    aria-label={`อัตราของ ${itemName(t.itemId)}`}
                    onChange={(e) => updateTarget(idx, Math.max(0, Number(e.target.value)) * factor)}
                  />
                  <span>{unit === 'min' ? '/นาที' : '/วิ'}</span>
                </label>
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

import type { CalcSettings, ProliferatorMode } from '../core/calculator';
import type { RateUnit } from './format';

interface Props {
  settings: CalcSettings;
  onChange: (s: CalcSettings) => void;
  unit: RateUnit;
  onUnit: (u: RateUnit) => void;
}

export function SettingsPanel({ settings, onChange, unit, onUnit }: Props) {
  return (
    <section className="panel" aria-labelledby="settings-h">
      <h2 id="settings-h">ตั้งค่า</h2>

      <div className="field-grid">
        <label className="field">
          <span>Proliferator</span>
          <select
            value={settings.proliferator.level}
            onChange={(e) =>
              onChange({
                ...settings,
                proliferator: { ...settings.proliferator, level: Number(e.target.value) as 0 | 1 | 2 | 3 },
              })
            }
          >
            <option value={0}>ไม่ใช้</option>
            <option value={1}>Mk.I</option>
            <option value={2}>Mk.II</option>
            <option value={3}>Mk.III</option>
          </select>
        </label>

        <label className="field">
          <span>โหมด Proliferator</span>
          <select
            value={settings.proliferator.mode}
            onChange={(e) =>
              onChange({
                ...settings,
                proliferator: { ...settings.proliferator, mode: e.target.value as ProliferatorMode },
              })
            }
          >
            <option value="productivity">Extra Products (ได้ของเพิ่ม)</option>
            <option value="speed">Production Speedup (เร็วขึ้น)</option>
          </select>
          {settings.proliferator.level === 0 && <small className="field-hint">มีผลเมื่อเลือกระดับ Proliferator</small>}
        </label>
      </div>

      <label className="check">
        <input
          type="checkbox"
          checked={settings.includeProliferatorProduction}
          onChange={(e) => onChange({ ...settings, includeProliferatorProduction: e.target.checked })}
        />
        คำนวณการผลิต Proliferator ที่ใช้พ่นด้วย
      </label>

      <div className="seg" role="group" aria-label="หน่วยอัตรา">
        <button aria-pressed={unit === 'min'} onClick={() => onUnit('min')}>
          ต่อนาที
        </button>
        <button aria-pressed={unit === 'sec'} onClick={() => onUnit('sec')}>
          ต่อวินาที
        </button>
      </div>
    </section>
  );
}

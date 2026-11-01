import type { CalcResult, CalcSettings, ProliferatorSetting, RecipeResult } from '../core/calculator';
import { calculator, itemName, machineName } from '../core/gameData';
import type { ItemId } from '../data/types';
import { fmt, fmtPower, toUnit, unitLabel, type RateUnit } from './format';

interface Props {
  result: CalcResult;
  settings: CalcSettings;
  onChange: (s: CalcSettings) => void;
  unit: RateUnit;
}

const RAW_VALUE = '__raw__';

/** เปลี่ยนสูตรของไอเทม หรือ "ถือเป็นวัตถุดิบ" */
function setItemRecipe(s: CalcSettings, itemId: ItemId, value: string): CalcSettings {
  const forceRaw = s.forceRaw.filter((i) => i !== itemId);
  const recipeOverride = { ...s.recipeOverride };
  if (value === RAW_VALUE) return { ...s, forceRaw: [...forceRaw, itemId] };
  recipeOverride[itemId] = value;
  return { ...s, forceRaw, recipeOverride };
}

function RecipeSelect({ itemId, settings, onChange }: { itemId: ItemId; settings: CalcSettings; onChange: Props['onChange'] }) {
  const options = calculator.recipesFor(itemId);
  const current = settings.forceRaw.includes(itemId)
    ? RAW_VALUE
    : settings.recipeOverride[itemId] ?? calculator.data.defaultRecipe[itemId];
  const hasMining = options.some((r) => r.mining);
  return (
    <select
      className="compact"
      aria-label={`สูตรของ ${itemName(itemId)}`}
      value={options.find((r) => r.id === current)?.mining ? RAW_VALUE : current}
      onChange={(e) => onChange(setItemRecipe(settings, itemId, e.target.value))}
    >
      {options
        .filter((r) => !r.mining)
        .map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      <option value={RAW_VALUE}>{hasMining ? 'ขุด/นำเข้า (วัตถุดิบ)' : 'นำเข้า (วัตถุดิบ)'}</option>
    </select>
  );
}

const prolifValue = (p?: ProliferatorSetting) => (p ? `${p.level}${p.mode[0]}` : 'default');
const parseProlif = (v: string): ProliferatorSetting | undefined =>
  v === 'default' ? undefined : { level: Number(v[0]) as 0 | 1 | 2 | 3, mode: v[1] === 'p' ? 'productivity' : 'speed' };

function Row({ r, result, settings, onChange, unit }: Props & { r: RecipeResult }) {
  const owned = Object.keys(r.recipe.out).filter((i) => result.items[i]?.recipeId === r.recipe.id);
  const primary = owned[0] ?? Object.keys(r.recipe.out)[0];
  const rs = settings.recipeSettings[r.recipe.id] ?? {};
  const machine = calculator.data.machines[r.machineId];
  const setRs = (patch: Partial<typeof rs>) =>
    onChange({ ...settings, recipeSettings: { ...settings.recipeSettings, [r.recipe.id]: { ...rs, ...patch } } });

  return (
    <tr style={{ ['--depth' as string]: Math.min(r.depth, 8) }}>
      <td className="c-item">
        <div className="item-cell">
          {Object.entries(r.outputs)
            .sort(([a], [b]) => Number(owned.includes(b)) - Number(owned.includes(a)))
            .map(([i, n]) => (
            <div key={i} className={owned.includes(i) ? 'out main' : 'out by'}>
              <strong>{itemName(i)}</strong>
              <span className="num">
                {fmt(toUnit(n, unit))}
                {unitLabel(unit)}
              </span>
              {!owned.includes(i) && <em>ผลพลอยได้</em>}
            </div>
          ))}
          {calculator.recipesFor(primary).length > 1 && (
            <RecipeSelect itemId={primary} settings={settings} onChange={onChange} />
          )}
        </div>
      </td>
      <td>
        {r.recipe.producers.length > 1 ? (
          <select className="compact" value={r.machineId} aria-label="เครื่องจักร" onChange={(e) => setRs({ machine: e.target.value })}>
            {r.recipe.producers.map((m) => (
              <option key={m} value={m}>
                {machineName(m)}
              </option>
            ))}
          </select>
        ) : (
          machineName(r.machineId)
        )}
      </td>
      <td className="num big">
        {r.machinesCeil}
        <small>{fmt(r.machines)}</small>
      </td>
      <td>
        {machine?.acceptsProliferator && Object.keys(r.recipe.in).length > 0 ? (
          <select
            className="compact"
            aria-label="Proliferator ของสูตรนี้"
            value={prolifValue(rs.proliferator)}
            onChange={(e) => setRs({ proliferator: parseProlif(e.target.value) })}
          >
            <option value="default">ตามค่าหลัก</option>
            <option value="0s">ไม่ใช้</option>
            {[1, 2, 3].flatMap((l) => [
              <option key={`${l}p`} value={`${l}p`} disabled={!r.recipe.allowProductivity}>
                Mk.{'I'.repeat(l)} ได้ของเพิ่ม
              </option>,
              <option key={`${l}s`} value={`${l}s`}>
                Mk.{'I'.repeat(l)} เร็วขึ้น
              </option>,
            ])}
          </select>
        ) : (
          <span className="muted">—</span>
        )}
        {r.proliferatorFallback && <div className="note">สูตรนี้ใช้ได้แค่โหมดเร็วขึ้น</div>}
      </td>
      <td className="c-in">
        {Object.entries(r.inputs).map(([i, n]) => (
          <div key={i}>
            {itemName(i)}{' '}
            <span className="num">
              {fmt(toUnit(n, unit))}
            </span>
          </div>
        ))}
      </td>
      <td className="num">{fmtPower(r.powerKW)}</td>
    </tr>
  );
}

export function Results(props: Props) {
  const { result, unit, settings, onChange } = props;
  const raw = Object.entries(result.raw).sort((a, b) => b[1] - a[1]);
  const surplus = Object.entries(result.surplus);
  const prolif = Object.entries(result.proliferatorUsage).filter(([, n]) => n > 1e-9);
  const machines = Object.entries(result.machineTotals).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <section className="summary" aria-label="สรุป">
        <div className="power">
          <span className="power-label">ไฟฟ้าที่ต้องใช้</span>
          <span className="power-value">{fmtPower(result.totalPowerKW)}</span>
        </div>

        <div className="sum-block">
          <h3>วัตถุดิบดิบ {unitLabel(unit)}</h3>
          {raw.length === 0 && <p className="muted">ไม่มี</p>}
          <ul>
            {raw.map(([i, n]) => (
              <li key={i}>
                <span>{itemName(i)}</span>
                <span className="num">{fmt(toUnit(n, unit))}</span>
                {calculator.recipesFor(i).some((r) => !r.mining) && (
                  <RecipeSelect itemId={i} settings={settings} onChange={onChange} />
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="sum-block">
          <h3>เครื่องจักรที่ต้องสร้าง</h3>
          <ul>
            {machines.map(([m, n]) => (
              <li key={m}>
                <span>{machineName(m)}</span>
                <span className="num">{n}</span>
              </li>
            ))}
          </ul>
        </div>

        {(surplus.length > 0 || prolif.length > 0) && (
          <div className="sum-block">
            {surplus.length > 0 && (
              <>
                <h3>ของเหลือ {unitLabel(unit)}</h3>
                <ul>
                  {surplus.map(([i, n]) => (
                    <li key={i}>
                      <span>{itemName(i)}</span>
                      <span className="num">{fmt(toUnit(n, unit))}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {prolif.length > 0 && (
              <>
                <h3>Proliferator ที่ใช้พ่น {unitLabel(unit)}</h3>
                <ul>
                  {prolif.map(([i, n]) => (
                    <li key={i}>
                      <span>{itemName(i)}</span>
                      <span className="num">{fmt(toUnit(n, unit))}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </section>

      {!result.converged && (
        <p className="warn" role="alert">
          การคำนวณยังไม่สมดุล (อาจมีวงจรที่ผลิตไม่พอ) ลองเปลี่ยนสูตรหรือกำหนดไอเทมบางตัวเป็นวัตถุดิบ
        </p>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ผลผลิต</th>
              <th>เครื่องจักร</th>
              <th className="num">จำนวน</th>
              <th>Proliferator</th>
              <th>วัตถุดิบเข้า {unitLabel(unit)}</th>
              <th className="num">ไฟฟ้า</th>
            </tr>
          </thead>
          <tbody>
            {result.recipes.map((r) => (
              <Row key={r.recipe.id} r={r} {...props} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

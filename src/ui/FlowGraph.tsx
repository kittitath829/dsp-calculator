import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CalcResult, CalcSettings } from '../core/calculator';
import { calculator, itemName, machineName } from '../core/gameData';
import type { ItemId } from '../data/types';
import { fmt, fmtPower, toUnit, unitLabel, type RateUnit } from './format';
import { Icon } from './Icon';

/** โหนดในกราฟ: วัตถุดิบดิบ (ซ้ายสุด) -> สูตรผลิต -> เป้าหมาย (ขวาสุด) */
type GNode =
  | { key: string; kind: 'raw'; itemId: ItemId; rate: number }
  | {
      key: string;
      kind: 'recipe';
      itemId: ItemId;
      rate: number;
      recipeId: string;
      producers: string[];
      machineId: string;
      machines: number;
      machinesCeil: number;
    }
  | { key: string; kind: 'target'; itemId: ItemId; rate: number };

interface GEdge {
  from: string;
  to: string;
  itemId: ItemId;
  rate: number;
}

const NODE_W = 150;
const NODE_H = 96;
const COL_GAP = 130;
const ROW_GAP = 28;
const PAD = 24;

function buildGraph(result: CalcResult, settings: CalcSettings) {
  const nodes = new Map<string, GNode>();
  const edges: GEdge[] = [];

  const producerKey = (itemId: ItemId) => {
    const flow = result.items[itemId];
    if (flow?.recipeId && !flow.raw) return `r:${flow.recipeId}`;
    return `raw:${itemId}`;
  };

  for (const [itemId, rate] of Object.entries(result.raw)) {
    nodes.set(`raw:${itemId}`, { key: `raw:${itemId}`, kind: 'raw', itemId, rate });
  }
  for (const r of result.recipes) {
    const owned = Object.keys(r.recipe.out).filter((i) => result.items[i]?.recipeId === r.recipe.id);
    const itemId = owned[0] ?? Object.keys(r.recipe.out)[0];
    nodes.set(`r:${r.recipe.id}`, {
      key: `r:${r.recipe.id}`,
      kind: 'recipe',
      itemId,
      rate: r.outputs[itemId] ?? 0,
      recipeId: r.recipe.id,
      producers: r.recipe.producers,
      machineId: r.machineId,
      machines: r.machines,
      machinesCeil: r.machinesCeil,
    });
    for (const [i, rate] of Object.entries(r.inputs)) {
      if (rate <= 1e-9) continue;
      edges.push({ from: producerKey(i), to: `r:${r.recipe.id}`, itemId: i, rate });
    }
  }
  for (const t of settings.targets) {
    const rate = calculator.targetRate(t, settings);
    if (rate <= 0) continue;
    const key = `t:${t.itemId}`;
    nodes.set(key, { key, kind: 'target', itemId: t.itemId, rate });
    edges.push({ from: producerKey(t.itemId), to: key, itemId: t.itemId, rate });
  }
  // ตัดเส้นที่ชี้ไปโหนดที่ไม่มีอยู่ (เช่น วัตถุดิบที่ถูกผลิตพอดีจากผลพลอยได้)
  const valid = edges.filter((e) => nodes.has(e.from) && nodes.has(e.to) && e.from !== e.to);

  // ---- จัดคอลัมน์: ระยะไกลสุดจากเป้าหมาย (ขวา = เป้าหมาย) ----
  const outEdges = new Map<string, GEdge[]>();
  for (const e of valid) outEdges.set(e.from, [...(outEdges.get(e.from) ?? []), e]);
  const dist = new Map<string, number>();
  const visiting = new Set<string>();
  const distToSink = (k: string): number => {
    if (dist.has(k)) return dist.get(k)!;
    if (visiting.has(k)) return 0; // วงจร: ไม่นับเส้นย้อนกลับ
    visiting.add(k);
    let d = 0;
    for (const e of outEdges.get(k) ?? []) d = Math.max(d, distToSink(e.to) + 1);
    visiting.delete(k);
    dist.set(k, d);
    return d;
  };
  for (const k of nodes.keys()) distToSink(k);
  const maxDist = Math.max(0, ...dist.values());

  const col = new Map<string, number>();
  for (const n of nodes.values()) {
    // วัตถุดิบดิบอยู่ซ้ายสุดเสมอ, เป้าหมายอยู่ขวาสุดเสมอ
    col.set(n.key, n.kind === 'raw' ? 0 : n.kind === 'target' ? maxDist + 1 : maxDist + 1 - dist.get(n.key)!);
  }
  const nCols = Math.max(...col.values()) + 1;

  // ---- เรียงในคอลัมน์ด้วย barycenter เพื่อลดเส้นตัดกัน ----
  const columns: string[][] = Array.from({ length: nCols }, () => []);
  for (const [k, c] of col) columns[c].push(k);
  const inEdges = new Map<string, GEdge[]>();
  for (const e of valid) inEdges.set(e.to, [...(inEdges.get(e.to) ?? []), e]);
  const order = new Map<string, number>();
  const reindex = () => columns.forEach((c) => c.forEach((k, i) => order.set(k, i)));
  reindex();
  const bary = (k: string, list: GEdge[] | undefined, pick: (e: GEdge) => string) => {
    if (!list?.length) return order.get(k)!;
    return list.reduce((s, e) => s + order.get(pick(e))!, 0) / list.length;
  };
  for (let pass = 0; pass < 6; pass++) {
    const rightToLeft = pass % 2 === 0;
    const seq = rightToLeft ? [...columns.keys()].reverse() : [...columns.keys()];
    for (const c of seq) {
      const score = new Map(
        columns[c].map((k) => [k, rightToLeft ? bary(k, outEdges.get(k), (e) => e.to) : bary(k, inEdges.get(k), (e) => e.from)]),
      );
      columns[c].sort((a, b) => score.get(a)! - score.get(b)!);
      reindex();
    }
  }

  // ---- ตำแหน่งจริง: จัดแต่ละคอลัมน์ให้อยู่กึ่งกลางแนวตั้ง ----
  const maxRows = Math.max(...columns.map((c) => c.length));
  const height = PAD * 2 + maxRows * NODE_H + (maxRows - 1) * ROW_GAP;
  const pos = new Map<string, { x: number; y: number }>();
  columns.forEach((c, ci) => {
    const colH = c.length * NODE_H + (c.length - 1) * ROW_GAP;
    const top = (height - colH) / 2;
    c.forEach((k, ri) => pos.set(k, { x: PAD + ci * (NODE_W + COL_GAP), y: top + ri * (NODE_H + ROW_GAP) }));
  });
  const width = PAD * 2 + nCols * NODE_W + (nCols - 1) * COL_GAP;

  return { nodes: [...nodes.values()], edges: valid, pos, width, height };
}

interface Props {
  result: CalcResult;
  settings: CalcSettings;
  onChange: (s: CalcSettings) => void;
  unit: RateUnit;
}

const INFO_W = 280;

export function FlowGraph({ result, settings, onChange, unit }: Props) {
  const g = useMemo(() => buildGraph(result, settings), [result, settings]);
  const [hover, setHover] = useState<string | null>(null);
  /** โหนดที่กำลังเปิดเมนูเลือกเครื่อง */
  const [menu, setMenu] = useState<string | null>(null);
  /** โหนดที่กำลังเปิดรายละเอียดการผลิต */
  const [info, setInfo] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const infoRef = useRef<HTMLDivElement>(null);
  // ปิด popup เมื่อกด Esc หรือคลิกนอก popup
  useEffect(() => {
    if (!menu && !info) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      const outside = (el: HTMLElement | null) => !el?.contains(e.target as Node);
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : outside(menuRef.current) && outside(infoRef.current)) {
        setMenu(null);
        setInfo(null);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [menu, info]);

  // วางรายละเอียดแบบ fixed ข้างกล่อง (ไม่ถูกตัดโดยกรอบกราฟ) ขวาก่อน ไม่พอวางซ้าย และดันให้อยู่ในจอ
  useLayoutEffect(() => {
    const el = infoRef.current;
    const box = document.querySelector<HTMLElement>(`[data-node="${CSS.escape(info ?? '')}"]`);
    if (!el || !box) return;
    const r = box.getBoundingClientRect();
    const gap = 10;
    const left = r.right + gap + INFO_W <= innerWidth - 8 ? r.right + gap : Math.max(8, r.left - gap - INFO_W);
    const top = Math.min(Math.max(8, r.top - 8), Math.max(8, innerHeight - el.offsetHeight - 8));
    Object.assign(el.style, { left: `${left}px`, top: `${top}px`, visibility: 'visible' });
  }, [info, result]);
  // เมนูเลือกเครื่องแบบ fixed ใต้กล่อง ถ้าไม่พอให้เปิดขึ้นบน และดันให้อยู่ในจอ
  useLayoutEffect(() => {
    const el = menuRef.current;
    const box = document.querySelector<HTMLElement>(`[data-node="${CSS.escape(menu ?? '')}"]`);
    if (!el || !box) return;
    const r = box.getBoundingClientRect();
    const gap = 6;
    const h = el.offsetHeight;
    const below = r.bottom + gap + h <= innerHeight - 8;
    const above = r.top - gap - h >= 8;
    const top = below || !above ? Math.min(r.bottom + gap, Math.max(8, innerHeight - h - 8)) : r.top - gap - h;
    const left = Math.min(Math.max(8, r.left), Math.max(8, innerWidth - el.offsetWidth - 8));
    Object.assign(el.style, { left: `${left}px`, top: `${top}px`, visibility: 'visible' });
  }, [menu, result]);
  // เลื่อนกราฟหรือหน้า = ปิด popup (ตำแหน่งจะไม่ตรงกล่องแล้ว)
  useEffect(() => {
    if (!info && !menu) return;
    const close = (e: Event) => {
      const t = e.target as Node;
      if (infoRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setInfo(null);
      setMenu(null);
    };
    addEventListener('scroll', close, true);
    return () => removeEventListener('scroll', close, true);
  }, [info, menu]);

  const setMachine = (recipeId: string, machine: string) => {
    const rs = settings.recipeSettings[recipeId] ?? {};
    onChange({ ...settings, recipeSettings: { ...settings.recipeSettings, [recipeId]: { ...rs, machine } } });
    setMenu(null);
  };
  const wrapRef = useRef<HTMLDivElement>(null);
  // เปิดมาให้เห็นเป้าหมาย (ขวาสุด) ก่อน
  useEffect(() => {
    const id = setTimeout(() => {
      if (wrapRef.current) wrapRef.current.scrollLeft = wrapRef.current.scrollWidth;
    });
    return () => clearTimeout(id);
  }, []);
  const maxRate = Math.max(1e-9, ...g.edges.map((e) => e.rate));

  // เส้นที่ออก/เข้าโหนดเดียวกัน กระจายจุดต่อไม่ให้ทับกัน
  const slot = (list: GEdge[], e: GEdge) => (list.indexOf(e) + 1) / (list.length + 1);
  const outs = new Map<string, GEdge[]>();
  const ins = new Map<string, GEdge[]>();
  for (const e of g.edges) {
    outs.set(e.from, [...(outs.get(e.from) ?? []), e]);
    ins.set(e.to, [...(ins.get(e.to) ?? []), e]);
  }
  const sortByY = (list: GEdge[], end: 'from' | 'to') => list.sort((a, b) => g.pos.get(a[end])!.y - g.pos.get(b[end])!.y);
  outs.forEach((l) => sortByY(l, 'to'));
  ins.forEach((l) => sortByY(l, 'from'));

  const related = (e: GEdge) => !hover || e.from === hover || e.to === hover;

  return (
    <div className="graph-wrap" ref={wrapRef}>
      <div className="graph" style={{ width: g.width, height: g.height }}>
        <svg width={g.width} height={g.height} className="graph-edges" aria-hidden="true">
          {g.edges.map((e, idx) => {
            const a = g.pos.get(e.from)!;
            const b = g.pos.get(e.to)!;
            const x1 = a.x + NODE_W;
            const y1 = a.y + NODE_H * slot(outs.get(e.from)!, e);
            const x2 = b.x;
            const y2 = b.y + NODE_H * slot(ins.get(e.to)!, e);
            const dx = Math.max(40, (x2 - x1) / 2);
            const w = 1.5 + 7 * Math.sqrt(e.rate / maxRate);
            const back = x2 <= x1;
            const d = back
              ? `M${x1},${y1} C${x1 + 60},${y1} ${x1 + 60},${y1 - 80} ${(x1 + x2) / 2},${Math.min(y1, y2) - 60} S${x2 - 60},${y2} ${x2},${y2}`
              : `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
            return (
              <path
                key={idx}
                d={d}
                className={`edge${back ? ' back' : ''}${related(e) ? '' : ' dim'}${hover && related(e) ? ' hot' : ''}`}
                strokeWidth={w}
              />
            );
          })}
        </svg>

        {/* ป้ายบนเส้น: ไอคอนไอเทม + อัตรา วางใกล้ปลายทางของเส้น */}
        {g.edges.map((e, idx) => {
          const b = g.pos.get(e.to)!;
          const y = b.y + NODE_H * slot(ins.get(e.to)!, e);
          return (
            <div
              key={idx}
              className={`edge-label${related(e) ? '' : ' dim'}`}
              style={{ left: b.x - 8, top: y }}
              title={`${itemName(e.itemId)} ${fmt(toUnit(e.rate, unit))}${unitLabel(unit)}`}
            >
              <Icon id={e.itemId} px={18} />
              <span className="num">{fmt(toUnit(e.rate, unit))}</span>
            </div>
          );
        })}

        {g.nodes.map((n) => {
          const p = g.pos.get(n.key)!;
          return (
            <div
              key={n.key}
              data-node={n.key}
              className={`gnode ${n.kind}`}
              style={{ left: p.x, top: p.y, width: NODE_W, height: NODE_H }}
              onMouseEnter={() => setHover(n.key)}
              onMouseLeave={() => setHover(null)}
              title={itemName(n.itemId)}
            >
              <div className="gnode-main">
                <button
                  type="button"
                  className={`gnode-item${info === n.key ? ' open' : ''}`}
                  title={`${itemName(n.itemId)} — คลิกเพื่อดูรายละเอียดการผลิต`}
                  aria-label={`ดูรายละเอียดการผลิต ${itemName(n.itemId)}`}
                  aria-haspopup="dialog"
                  aria-expanded={info === n.key}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => {
                    setMenu(null);
                    setInfo(info === n.key ? null : n.key);
                  }}
                >
                  <Icon id={n.itemId} px={44} />
                </button>
                {n.kind === 'recipe' &&
                  (n.producers.length > 1 ? (
                    <button
                      type="button"
                      className={`gnode-machine pickable${menu === n.key ? ' open' : ''}`}
                      title={`${machineName(n.machineId)} × ${fmt(n.machines)} — คลิกเพื่อเปลี่ยนเครื่อง`}
                      aria-label={`เปลี่ยนเครื่องผลิต ${itemName(n.itemId)} (ตอนนี้ ${machineName(n.machineId)})`}
                      aria-haspopup="menu"
                      aria-expanded={menu === n.key}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => {
                        setInfo(null);
                        setMenu(menu === n.key ? null : n.key);
                      }}
                    >
                      <Icon id={n.machineId} px={30} />
                      <span className="count num">×{n.machinesCeil}</span>
                      <span className="caret" aria-hidden="true">▾</span>
                    </button>
                  ) : (
                    <div className="gnode-machine" title={`${machineName(n.machineId)} × ${fmt(n.machines)}`}>
                      <Icon id={n.machineId} px={30} />
                      <span className="count num">×{n.machinesCeil}</span>
                    </div>
                  ))}
                {n.kind === 'raw' && <span className="gnode-tag">วัตถุดิบ</span>}
                {n.kind === 'target' && <span className="gnode-tag star">เป้าหมาย</span>}
              </div>
              <div className="gnode-rate num">
                {fmt(toUnit(n.rate, unit))}
                <small>{unitLabel(unit)}</small>
              </div>
              <div className="gnode-name">{itemName(n.itemId)}</div>
            </div>
          );
        })}

        {(() => {
          const n = g.nodes.find((x) => x.key === menu);
          if (!n || n.kind !== 'recipe') return null;
          return (
            <div
              className="gnode-menu"
              role="menu"
              ref={menuRef}
              style={{ minWidth: NODE_W + 40, visibility: 'hidden' }}
            >
              {n.producers.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="menuitemradio"
                  aria-checked={m === n.machineId}
                  className={m === n.machineId ? 'active' : undefined}
                  onClick={() => setMachine(n.recipeId, m)}
                >
                  <Icon id={m} px={28} />
                  <span>{machineName(m)}</span>
                </button>
              ))}
            </div>
          );
        })()}

        {(() => {
          const n = g.nodes.find((x) => x.key === info);
          if (!n) return null;
          return (
            <NodeInfo
              ref={infoRef}
              node={n}
              graph={g}
              result={result}
              unit={unit}
              style={{ width: INFO_W, visibility: 'hidden' }}
              isTarget={settings.targets.some((t) => t.itemId === n.itemId)}
              onAddTarget={() => {
                onChange({ ...settings, targets: [...settings.targets, { itemId: n.itemId, perMinute: 60 }] });
                setInfo(null);
              }}
              onClose={() => setInfo(null)}
            />
          );
        })()}
      </div>
    </div>
  );
}

interface NodeInfoProps {
  ref: React.Ref<HTMLDivElement>;
  node: GNode;
  graph: ReturnType<typeof buildGraph>;
  result: CalcResult;
  unit: RateUnit;
  style: React.CSSProperties;
  isTarget: boolean;
  onAddTarget: () => void;
  onClose: () => void;
}

/** รายละเอียดการผลิตของโหนด: เครื่อง, เวลา, ไฟ, วัตถุดิบเข้า/ออก และปลายทาง */
function NodeInfo({ ref, node: n, graph: g, result, unit, style, isTarget, onAddTarget, onClose }: NodeInfoProps) {
  const r = n.kind === 'recipe' ? result.recipes.find((x) => x.recipe.id === n.recipeId) : undefined;
  const ins = g.edges.filter((e) => e.to === n.key);
  const outs = g.edges.filter((e) => e.from === n.key);
  const rate = (perSec: number) => `${fmt(toUnit(perSec, unit))}${unitLabel(unit)}`;
  const nodeOf = (key: string) => g.nodes.find((m) => m.key === key);
  const nodeLabel = (key: string) => {
    const x = nodeOf(key);
    if (!x) return key;
    return x.kind === 'target' ? `${itemName(x.itemId)} (เป้าหมาย)` : itemName(x.itemId);
  };
  const subtitle =
    n.kind === 'raw'
      ? 'วัตถุดิบดิบ'
      : n.kind === 'target'
        ? 'เป้าหมาย'
        : r && r.recipe.name !== itemName(n.itemId)
          ? `สูตร ${r.recipe.name}`
          : 'สูตรผลิต';

  const flowList = (title: string, list: GEdge[], end: 'from' | 'to') =>
    list.length > 0 && (
      <>
        <h4>{title}</h4>
        <ul className="info-list">
          {list.map((e, idx) => (
            <li key={idx}>
              <Icon id={nodeOf(e[end])?.itemId ?? e.itemId} px={20} />
              <span className="info-name">{nodeLabel(e[end])}</span>
              <span className="num">{rate(e.rate)}</span>
            </li>
          ))}
        </ul>
      </>
    );

  return (
    <div className="gnode-info" role="dialog" aria-label={`รายละเอียดการผลิต ${itemName(n.itemId)}`} ref={ref} style={style}>
      <div className="info-head">
        <Icon id={n.itemId} px={36} />
        <div>
          <strong>{itemName(n.itemId)}</strong>
          <small>{subtitle}</small>
        </div>
        <button type="button" className="icon-btn" aria-label="ปิด" onClick={onClose}>
          ×
        </button>
      </div>

      <dl className="info-stats">
        <dt>{n.kind === 'raw' ? 'ต้องป้อนเข้า' : n.kind === 'target' ? 'ต้องการ' : 'ผลิตได้'}</dt>
        <dd className="num">{rate(n.rate)}</dd>
        {r && (
          <>
            <dt>เครื่อง</dt>
            <dd>
              <span className="named">
                <Icon id={r.machineId} px={20} />
                {machineName(r.machineId)}
              </span>
            </dd>
            <dt>จำนวน</dt>
            <dd className="num">
              {fmt(r.machines)} <span className="muted">(สร้าง {r.machinesCeil})</span>
            </dd>
            <dt>ต่อเครื่อง</dt>
            <dd className="num">{rate(n.rate / r.machines)}</dd>
            <dt>เวลาต่อรอบ</dt>
            <dd className="num">{fmt(r.machines / r.craftsPerSecond)} วิ</dd>
            <dt>ไฟฟ้า</dt>
            <dd className="num">{fmtPower(r.powerKW)}</dd>
            {r.proliferator.level > 0 && (
              <>
                <dt>Proliferator</dt>
                <dd>
                  Mk.{r.proliferator.level} {r.proliferator.mode === 'speed' ? 'เร็วขึ้น' : 'ได้ของเพิ่ม'}
                </dd>
              </>
            )}
          </>
        )}
      </dl>

      {r && (
        <>
          <h4>ใช้วัตถุดิบ</h4>
          <ul className="info-list">
            {Object.entries(r.inputs).map(([i, v]) => (
              <li key={i}>
                <Icon id={i} px={20} />
                <span className="info-name">{itemName(i)}</span>
                <span className="num">{rate(v)}</span>
              </li>
            ))}
          </ul>
          {Object.keys(r.outputs).length > 1 && (
            <>
              <h4>ผลผลิตทั้งหมด</h4>
              <ul className="info-list">
                {Object.entries(r.outputs).map(([i, v]) => (
                  <li key={i}>
                    <Icon id={i} px={20} />
                    <span className="info-name">
                      {itemName(i)}
                      {i !== n.itemId && <small className="muted"> ผลพลอยได้</small>}
                    </span>
                    <span className="num">{rate(v)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {n.kind !== 'recipe' && flowList('รับจาก', ins, 'from')}
      {flowList('ส่งต่อไปที่', outs, 'to')}

      <button type="button" className="info-add" disabled={isTarget} onClick={onAddTarget}>
        {isTarget ? 'อยู่ในรายการ "อยากผลิตอะไร" แล้ว' : '+ เพิ่มในรายการ "อยากผลิตอะไร"'}
      </button>
    </div>
  );
}

export type RateUnit = 'min' | 'sec';

/** แปลงจาก ต่อวินาที เป็นหน่วยที่เลือก */
export const toUnit = (perSec: number, unit: RateUnit) => (unit === 'min' ? perSec * 60 : perSec);

export function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs !== 0 && abs < 0.01) return n.toExponential(1);
  return n.toLocaleString('en-US', { maximumFractionDigits: abs >= 100 ? 1 : digits });
}

export function fmtPower(kW: number): string {
  if (kW >= 1e6) return `${fmt(kW / 1e6)} GW`;
  if (kW >= 1e3) return `${fmt(kW / 1e3)} MW`;
  return `${fmt(kW)} kW`;
}

export const unitLabel = (unit: RateUnit) => (unit === 'min' ? '/นาที' : '/วินาที');

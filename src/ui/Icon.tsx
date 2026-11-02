import iconData from '../data/icons.json';
import spriteUrl from '../data/icons.webp';

const { size, sheetSize, icons } = iconData as { size: number; sheetSize: number; icons: Record<string, number[]> };

/** ไอคอนไอเทม/เครื่องจักรจาก sprite sheet (ไม่มีไอคอน = ไม่แสดงอะไร) */
export function Icon({ id, px = 28, title }: { id: string; px?: number; title?: string }) {
  const pos = icons[id];
  if (!pos) return null;
  const k = px / size;
  return (
    <span
      className="icon"
      title={title}
      aria-hidden="true"
      style={{
        width: px,
        height: px,
        backgroundImage: `url(${spriteUrl})`,
        backgroundSize: `${sheetSize * k}px`,
        backgroundPosition: `${-pos[0] * k}px ${-pos[1] * k}px`,
      }}
    />
  );
}

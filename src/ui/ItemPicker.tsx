import { useId, useMemo, useRef, useState } from 'react';
import { selectableItems } from '../core/gameData';
import type { ItemId } from '../data/types';
import { Icon } from './Icon';

const SearchGlyph = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

/** ปุ่มเพิ่มไอเทม: กดแล้วเปิด popup ตารางไอคอนให้คลิกเลือก พิมพ์เพื่อกรองได้ */
export function ItemPicker({ onPick }: { onPick: (id: ItemId) => void }) {
  const gridId = useId();
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return selectableItems;
    return selectableItems.filter(
      (i) => i.name.toLowerCase().includes(q) || i.nameZh.includes(text.trim()) || i.id.includes(q),
    );
  }, [text]);

  const openPopup = () => {
    setText('');
    setActive(0);
    dialogRef.current?.showModal();
  };

  const close = () => dialogRef.current?.close();

  const pick = (id: ItemId) => {
    onPick(id);
    close();
  };

  /** จำนวนคอลัมน์จริงของตาราง ใช้เลื่อนขึ้น/ลงทีละแถว */
  const columns = () => {
    const el = gridRef.current;
    if (!el) return 1;
    return getComputedStyle(el).gridTemplateColumns.split(' ').length || 1;
  };

  const move = (delta: number) => {
    if (!matches.length) return;
    const next = Math.min(Math.max(active + delta, 0), matches.length - 1);
    setActive(next);
    gridRef.current?.children[next]?.scrollIntoView({ block: 'nearest' });
  };

  return (
    <div className="picker">
      <button type="button" className="picker-trigger" onClick={openPopup}>
        <SearchGlyph />
        <span>ค้นหาไอเทม เช่น Electromagnetic Matrix</span>
      </button>

      <dialog
        ref={dialogRef}
        className="picker-dialog"
        aria-label="เลือกไอเทมเป้าหมาย"
        onClick={(e) => e.target === e.currentTarget && close()}
      >
        <div className="picker-head">
          <div className="picker-field">
            <SearchGlyph />
            <input
              autoFocus
              role="combobox"
              aria-expanded="true"
              aria-controls={gridId}
              aria-autocomplete="list"
              aria-activedescendant={matches.length ? `${gridId}-${active}` : undefined}
              value={text}
              placeholder="พิมพ์เพื่อกรอง เช่น Gear"
              aria-label="ค้นหาไอเทม"
              onChange={(e) => {
                setText(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  move(columns());
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  move(-columns());
                } else if (e.key === 'ArrowRight' && !text) {
                  e.preventDefault();
                  move(1);
                } else if (e.key === 'ArrowLeft' && !text) {
                  e.preventDefault();
                  move(-1);
                } else if (e.key === 'Enter' && matches[active]) {
                  e.preventDefault();
                  pick(matches[active].id);
                }
              }}
            />
          </div>
          <button type="button" className="icon-btn" aria-label="ปิด" onClick={close}>
            ×
          </button>
        </div>

        {matches.length > 0 ? (
          <div className="picker-grid" id={gridId} role="listbox" ref={gridRef}>
            {matches.map((i, idx) => (
              <div
                key={i.id}
                id={`${gridId}-${idx}`}
                role="option"
                aria-selected={idx === active}
                title={i.name}
                className={idx === active ? 'picker-cell active' : 'picker-cell'}
                onClick={() => pick(i.id)}
                onMouseEnter={() => setActive(idx)}
              >
                <Icon id={i.id} px={52} />
                <span className="picker-label">{i.name}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="picker-empty">ไม่พบไอเทม</p>
        )}
      </dialog>
    </div>
  );
}

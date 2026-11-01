import { useId, useState } from 'react';
import { selectableItems } from '../core/gameData';
import type { ItemId } from '../data/types';

/** ช่องค้นหาไอเทม (พิมพ์ชื่ออังกฤษหรือจีน) */
export function ItemPicker({ onPick }: { onPick: (id: ItemId) => void }) {
  const listId = useId();
  const [text, setText] = useState('');

  const commit = (value: string) => {
    const v = value.trim().toLowerCase();
    const found = selectableItems.find(
      (i) => i.name.toLowerCase() === v || i.nameZh === value.trim() || i.id === v,
    );
    if (found) {
      onPick(found.id);
      setText('');
    }
  };

  return (
    <div className="picker">
      <input
        list={listId}
        value={text}
        placeholder="ค้นหาไอเทม เช่น Electromagnetic Matrix"
        aria-label="เพิ่มไอเทมเป้าหมาย"
        onChange={(e) => {
          setText(e.target.value);
          commit(e.target.value);
        }}
        onKeyDown={(e) => e.key === 'Enter' && commit(text)}
      />
      <datalist id={listId}>
        {selectableItems.map((i) => (
          <option key={i.id} value={i.name}>
            {i.nameZh}
          </option>
        ))}
      </datalist>
    </div>
  );
}

import raw from '../data/dsp-data.json';
import type { GameData, Item, ItemId, MachineId } from '../data/types';
import { Calculator } from './calculator';

export const gameData = raw as unknown as GameData;
export const calculator = new Calculator(gameData);

export const itemsById = new Map<ItemId, Item>(gameData.items.map((i) => [i.id, i]));

export const itemName = (id: ItemId) => itemsById.get(id)?.name ?? id;
export const machineName = (id: MachineId) => gameData.machines[id]?.name ?? id;

/** กลุ่มเครื่องจักรที่มีหลายระดับ ใช้กับการตั้งค่า "เครื่องที่ใช้" ทั้งโปรเจกต์ */
export const MACHINE_GROUPS: { label: string; machines: MachineId[] }[] = [
  { label: 'เตาหลอม', machines: ['arc-smelter', 'plane-smelter', 'df-negentropy-smelter'] },
  {
    label: 'เครื่องประกอบ',
    machines: ['assembling-machine-1', 'assembling-machine-2', 'assembling-machine-3', 'df-recomposing-assembler'],
  },
  { label: 'โรงงานเคมี', machines: ['chemical-plant', 'quantum-chemical-plant'] },
  { label: 'แล็บวิจัย', machines: ['matrix-lab', 'df-self-evolution-lab'] },
];

/** ไอเทมที่เลือกเป็นเป้าหมายได้ (มีสูตรผลิตหรือเป็นวัตถุดิบ) เรียงตามหมวด */
export const selectableItems = gameData.items
  .filter((i) => calculator.recipesFor(i.id).length > 0)
  .sort((a, b) => (a.category === b.category ? 0 : a.category === 'components' ? -1 : 1));

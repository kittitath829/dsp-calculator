import raw from '../data/dsp-data.json';
import type { GameData, Item, ItemId, MachineId } from '../data/types';
import { Calculator } from './calculator';

export const gameData = raw as unknown as GameData;
export const calculator = new Calculator(gameData);

export const itemsById = new Map<ItemId, Item>(gameData.items.map((i) => [i.id, i]));

export const itemName = (id: ItemId) => itemsById.get(id)?.name ?? id;
export const machineName = (id: MachineId) => gameData.machines[id]?.name ?? id;

/** ไอเทมที่เลือกเป็นเป้าหมายได้ (มีสูตรผลิตหรือเป็นวัตถุดิบ) เรียงตามหมวด */
export const selectableItems = gameData.items
  .filter((i) => calculator.recipesFor(i.id).length > 0)
  .sort((a, b) => (a.category === b.category ? 0 : a.category === 'components' ? -1 : 1));

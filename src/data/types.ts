// โครงสร้างข้อมูลเกมที่สร้างจาก scripts/build-data.mjs

export type ItemId = string;
export type RecipeId = string;
export type MachineId = string;

export interface Item {
  id: ItemId;
  name: string;
  nameZh: string;
  category: 'components' | 'buildings';
  row: number;
  stack: number;
}

export interface Recipe {
  id: RecipeId;
  name: string;
  nameZh: string;
  /** เวลาต่อการผลิต 1 รอบ (วินาที) ที่ความเร็วเครื่อง 1.0 */
  time: number;
  in: Record<ItemId, number>;
  out: Record<ItemId, number>;
  producers: MachineId[];
  /** สูตรขุดทรัพยากร (แร่, น้ำมัน, ก๊าซยักษ์) — ถือเป็นวัตถุดิบดิบ */
  mining: boolean;
  /** ใช้ Proliferator แบบ Extra Products ได้หรือไม่ */
  allowProductivity: boolean;
  excludedByDefault: boolean;
}

export interface Machine {
  id: MachineId;
  name: string;
  speed: number;
  /** กำลังไฟขณะทำงาน (kW) */
  usage: number;
  /** กำลังไฟขณะว่าง (kW) */
  drain: number;
  electric: boolean;
  acceptsProliferator: boolean;
}

export interface Proliferator {
  level: 1 | 2 | 3;
  itemId: ItemId;
  /** จำนวนไอเทมที่พ่นได้ต่อ Proliferator 1 ชิ้น */
  sprays: number;
  speedBonus: number;
  productivityBonus: number;
  powerBonus: number;
}

export interface GameData {
  source: string;
  gameVersion: string;
  generatedAt: string;
  items: Item[];
  recipes: Recipe[];
  machines: Record<MachineId, Machine>;
  proliferators: Proliferator[];
  defaultRecipe: Record<ItemId, RecipeId>;
}

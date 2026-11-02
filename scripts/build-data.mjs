#!/usr/bin/env node
/**
 * แปลงข้อมูลเกม Dyson Sphere Program จาก FactorioLab (MIT License)
 * ให้อยู่ในรูปแบบที่โปรเจกต์นี้ใช้ -> src/data/dsp-data.json
 *
 * วิธีใช้ (เมื่อเกมอัปเดตและ FactorioLab อัปเดตข้อมูลแล้ว):
 *   git clone --depth 1 --filter=blob:none --sparse https://github.com/factoriolab/factoriolab.git /tmp/fl
 *   (cd /tmp/fl && git sparse-checkout set public/data/dsp)
 *   node scripts/build-data.mjs /tmp/fl/public/data/dsp
 *
 * ได้ไฟล์ src/data/dsp-data.json, src/data/icons.json (ตำแหน่งไอคอนใน sprite)
 * และ src/data/icons.webp (sprite sheet ไอคอน 64px)
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const srcDir = process.argv[2];
if (!srcDir) {
  console.error('usage: node scripts/build-data.mjs <path-to-factoriolab/public/data/dsp>');
  process.exit(1);
}

const raw = JSON.parse(readFileSync(join(srcDir, 'data.json'), 'utf8'));
let zh = { items: {}, recipes: {} };
try {
  zh = JSON.parse(readFileSync(join(srcDir, 'i18n', 'zh.json'), 'utf8'));
} catch {
  console.warn('zh.json not found, Chinese names will be empty');
}

const KEEP_CATEGORIES = new Set(['components', 'buildings']);
const productivityAllowed = new Set(raw.limitations?.productivity ?? []);
const excluded = new Set(raw.defaults?.excludedRecipes ?? []);

// ---- items ----
const items = raw.items
  .filter((i) => KEEP_CATEGORIES.has(i.category))
  .map((i) => ({
    id: i.id,
    name: i.name,
    nameZh: zh.items?.[i.id] ?? '',
    category: i.category,
    row: i.row ?? 0,
    stack: i.stack ?? 0,
  }));
const itemIds = new Set(items.map((i) => i.id));

// ---- machines ----
const machines = {};
for (const i of raw.items) {
  if (!i.machine) continue;
  const m = i.machine;
  machines[i.id] = {
    id: i.id,
    name: i.name,
    speed: m.speed ?? 1,
    // หน่วย kW
    usage: m.type === 'electric' ? (m.usage ?? 0) : 0,
    drain: m.type === 'electric' ? (m.drain ?? 0) : 0,
    electric: m.type === 'electric',
    acceptsProliferator: (m.modules ?? 0) > 0,
  };
}

// ---- recipes ----
const recipes = raw.recipes
  .filter((r) => KEEP_CATEGORIES.has(r.category))
  .filter((r) => Object.keys(r.out).every((o) => itemIds.has(o)))
  .map((r) => ({
    id: r.id,
    name: r.name,
    nameZh: zh.recipes?.[r.id] ?? '',
    time: r.time,
    in: r.in,
    out: r.out,
    producers: r.producers.filter((p) => machines[p]),
    mining: (r.flags ?? []).includes('mining'),
    allowProductivity: productivityAllowed.has(r.id),
    excludedByDefault: excluded.has(r.id),
  }));

// ---- proliferators ----
const proliferators = [1, 2, 3].map((level) => {
  const speed = raw.items.find((i) => i.id === `proliferator-${level}-speed`).module;
  const prod = raw.items.find((i) => i.id === `proliferator-${level}-products`).module;
  return {
    level,
    itemId: `proliferator-${level}`,
    sprays: speed.sprays,
    speedBonus: speed.speed,
    productivityBonus: prod.productivity,
    powerBonus: speed.consumption,
  };
});

// ---- default recipe per item ----
// ลำดับความสำคัญ: สูตรที่ id ตรงกับไอเทม > สูตรผลิตปกติ > สูตรขุด (mining)
const defaultRecipe = {};
for (const item of items) {
  const candidates = recipes.filter((r) => r.out[item.id] && !r.excludedByDefault);
  if (candidates.length === 0) continue;
  const exact = candidates.find((r) => r.id === item.id && !r.mining);
  const normal = candidates.find((r) => !r.mining);
  defaultRecipe[item.id] = (exact ?? normal ?? candidates[0]).id;
}

const out = {
  source: 'FactorioLab (https://github.com/factoriolab/factoriolab) - MIT License',
  gameVersion: raw.version?.DSP ?? 'unknown',
  generatedAt: new Date().toISOString().slice(0, 10),
  items,
  recipes,
  machines,
  proliferators,
  defaultRecipe,
};

const here = dirname(fileURLToPath(import.meta.url));
const dest = join(here, '..', 'src', 'data', 'dsp-data.json');
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, JSON.stringify(out, null, 1));

// ---- icons ----
// เก็บเฉพาะไอคอนของไอเทม/เครื่องจักรที่ใช้ -> { id: [x, y] }
const iconPos = new Map(raw.icons.map((i) => [i.id, [i.x, i.y]]));
const icons = {};
for (const i of raw.items) {
  if (!itemIds.has(i.id) && !machines[i.id]) continue;
  const pos = iconPos.get(i.icon ?? i.id);
  if (pos) icons[i.id] = pos;
}
const sheetSize = Math.max(...raw.icons.flatMap((i) => [i.x, i.y])) + 64;
writeFileSync(join(dirname(dest), 'icons.json'), JSON.stringify({ size: 64, sheetSize, icons }));
copyFileSync(join(srcDir, 'icons.webp'), join(dirname(dest), 'icons.webp'));
console.log(
  `wrote ${dest}: ${items.length} items, ${recipes.length} recipes, ${Object.keys(machines).length} machines (game ${out.gameVersion})`,
);

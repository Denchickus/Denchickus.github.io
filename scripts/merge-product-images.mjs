/**
 * merge-product-images.mjs
 * ------------------------
 * Слияние манифеста изображений: существующие записи + добранные скриптом
 * fetch-product-content.mjs. Сети не требует, запускается повторно безопасно.
 *
 * Правила слияния (важны, потому что от них зависит провенанс):
 *  1. Существующие записи НЕ трогаются. У 8 товаров Homepage роль card и hero
 *     выбрана визуальным просмотром каждого кадра — это решение сохраняется.
 *  2. Новые записи добавляются как есть (role: gallery, fit: contain).
 *  3. Если у товара нет ни одной записи role:"card", карточной назначается
 *     ПЕРВАЯ фотография галереи источника — то есть тот кадр, который сам сайт
 *     показывает первым. Это явное задокументированное правило, а не «самое
 *     большое изображение» и не визуальный выбор: в манифесте такая запись
 *     помечена pickMethod:"source-gallery-order", чтобы её нельзя было спутать
 *     с проверенной глазами.
 *  4. fit для таких карточек — "contain": он никогда не обрезает и не искажает
 *     кадр. Медиа-контейнер карточки при contain белый, поэтому серых боковых
 *     полос не возникает (см. ProductCard.astro).
 *
 * Запуск: npm run merge:images
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));

const manifestPath = 'data/catalog/product-images.json';
const fetchedPath = 'data/catalog/fetched-images.json';

if (!existsSync(resolve(ROOT, fetchedPath))) {
  console.error(`Нет ${fetchedPath} — сначала запусти fetch-product-content.mjs`);
  process.exit(1);
}

const manifest = read(manifestPath);
const fetched = read(fetchedPath);

const existing = manifest.images;
const knownUrls = new Set(existing.map((im) => im.sourceUrl));
const added = fetched.images.filter((im) => !knownUrls.has(im.sourceUrl));

const merged = [...existing, ...added];

/* --- назначение карточного изображения ------------------------------------ */

const bySlug = new Map();
for (const im of merged) {
  if (!im.productSlug || !im.localPath) continue;
  if (!bySlug.has(im.productSlug)) bySlug.set(im.productSlug, []);
  bySlug.get(im.productSlug).push(im);
}

let promoted = 0;
for (const [slug, images] of bySlug) {
  if (images.some((im) => im.role === 'card')) continue;
  const usable = images
    .filter((im) => im.verificationStatus === 'VERIFIED' && im.role === 'gallery')
    .sort((a, b) => (a.galleryIndex ?? 0) - (b.galleryIndex ?? 0));
  if (usable.length === 0) {
    console.log(`  ! ${slug}: нет пригодных изображений — карточка останется на заглушке`);
    continue;
  }
  const card = usable[0];
  card.role = 'card';
  card.fit = 'contain';
  card.objectPosition = 'center';
  card.pickMethod = 'source-gallery-order';
  card.pickReason =
    'Первый кадр галереи источника. Выбор по правилу, не визуальной проверкой.';
  promoted++;
}

/* --- запись --------------------------------------------------------------- */

const out = {
  ...manifest,
  _mergedBy: 'scripts/merge-product-images.mjs',
  _mergedAt: new Date().toISOString().slice(0, 10),
  _cardPickNote:
    'role:"card" с pickMethod:"visual" выбрана визуальным просмотром кадра; ' +
    'с pickMethod:"source-gallery-order" — по правилу «первый кадр галереи источника».',
  images: merged,
};
writeFileSync(resolve(ROOT, manifestPath), JSON.stringify(out, null, 2) + '\n');

/* --- отчёт ---------------------------------------------------------------- */

const cards = merged.filter((im) => im.role === 'card');
const visualCards = cards.filter((im) => im.pickMethod !== 'source-gallery-order');
console.log(`  было записей      : ${existing.length}`);
console.log(`  добавлено         : ${added.length}`);
console.log(`  всего             : ${merged.length}`);
console.log(`  товаров с фото    : ${bySlug.size}`);
console.log(`  карточек назначено: ${promoted} по правилу, ${visualCards.length} визуально`);
console.log(`  карточек всего    : ${cards.length}`);

/**
 * validate-catalog.mjs
 * --------------------
 * Обязательные проверки слоя данных каталога (.claude/rules/testing.md,
 * docs/DATA_MODEL.md §9). Запускается перед `astro build` (см. package.json).
 *
 * Отчёт по каждой проверке: PASS / FAIL / NOT VERIFIED.
 * Ненулевой exit -> сборка не идёт.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));

const { products } = read('data/catalog/products.json');
const { categories } = read('data/catalog/categories.json');
const { machineTypes } = read('data/catalog/machine-types.json');
const { variants } = read('data/catalog/variants.json');
const inventory = read('data/content-inventory.json');

/**
 * Ожидаемые количества. Зашиты константами намеренно (решение №16): «мягкая»
 * проверка целостности не поймает ситуацию, когда при регенерации тихо исчезает
 * блок товаров — JSON останется валидным, ссылки целыми, а каталог похудеет.
 *
 * Откуда числа: inventory.counts.flatProductPages = 50 страниц-товаров источника,
 * из них 1 — дубль «Крюкового подвеса» (DR-01) -> 49 canonical visible.
 * Маршрутов товара 50: 49 в каталоге + скрытый дубль по прямому URL.
 */
const EXPECT = {
  inventoryFlat: 50,
  visibleProducts: 49,
  hiddenDuplicates: 1,
  productRoutes: 50,
  categories: 8,
  machineTypes: 8,
  confirmedMachineTypes: 7,
  variants: 27,
  variantProducts: 8,
  hiddenVariants: 3,
};

let failures = 0;
const results = [];
/** @param {string} name @param {boolean|null} ok @param {string} [detail] */
function check(name, ok, detail = '') {
  const status = ok === null ? 'NOT VERIFIED' : ok ? 'PASS' : 'FAIL';
  if (ok === false) failures++;
  results.push({ name, status, detail });
}

const visible = products.filter((p) => p.visible);
const catIds = new Set(categories.map((c) => c.id));
const mtIds = new Set(machineTypes.map((m) => m.id));
const confirmedMtIds = new Set(machineTypes.filter((m) => m.confirmed).map((m) => m.id));

/* --- дубли id / slug ----------------------------------------------------- */
const dupIds = pickDuplicates(products.map((p) => p.id));
check('Дубли Product.id', dupIds.length === 0, dupIds.join(', '));

const dupSlugs = pickDuplicates(products.map((p) => p.slug));
check('Дубли Product.slug', dupSlugs.length === 0, dupSlugs.join(', '));

check('Дубли Category.id', pickDuplicates(categories.map((c) => c.id)).length === 0);
check('Дубли Category.slug', pickDuplicates(categories.map((c) => c.slug)).length === 0);
check('Дубли MachineType.id', pickDuplicates(machineTypes.map((m) => m.id)).length === 0);

/* --- обязательные поля ------------------------------------------------- */
const missingRequired = products.filter(
  (p) => !p.id || !p.slug || !p.name || typeof p.visible !== 'boolean',
);
check('Обязательные поля id/slug/name/visible', missingRequired.length === 0,
  missingRequired.map((p) => p.id).join(', '));

const missingSourceUrl = products.filter((p) => !p.sourceUrl);
check('sourceUrl у каждого Product', missingSourceUrl.length === 0,
  missingSourceUrl.map((p) => p.id).join(', '));

/* --- валидность связей ------------------------------------------------- */
const badCat = visible.filter((p) => !catIds.has(p.categoryId));
check('Product.categoryId ссылается на существующую категорию', badCat.length === 0,
  badCat.map((p) => `${p.id}->${p.categoryId}`).join(', '));

const noCat = visible.filter((p) => !p.categoryId);
check('Видимых товаров без категории — 0', noCat.length === 0,
  noCat.map((p) => p.id).join(', '));

const badMt = products.filter((p) => p.machineTypeIds.some((id) => !mtIds.has(id)));
check('Product.machineTypeIds ссылаются на существующие типы', badMt.length === 0,
  badMt.map((p) => p.id).join(', '));

/* --- confirmed:false не течёт в пользовательские данные --------------- */
// В products.json неподтверждённый тип допустим (модель хранит всё), но UI обязан
// фильтровать через getVisibleMachineTypes. Здесь проверяем, что хотя бы один
// товар действительно завязан на скрытый тип (иначе фильтр нечего проверять),
// и что счётчики видимых типов не учитывают скрытый.
const hiddenMt = machineTypes.find((m) => !m.confirmed);
check('Скрытый тип техники присутствует в модели', !!hiddenMt,
  hiddenMt ? `${hiddenMt.id} (${hiddenMt.productCount} товаров-связей)` : 'нет');

/* --- счётчики совпадают с задокументированными (DATA_MODEL.md §6) ----- */
const DOC_MT_COUNTS = {
  'mt-minipogruzchik': 35, 'mt-ehkskavator-pogruzchik': 25,
  'mt-frontalnyj-pogruzchik': 23, 'mt-teleskopicheskij-pogruzchik': 19,
  'mt-traktor': 16, 'mt-vilochnyj-pogruzchik': 13, 'mt-mini-ehkskavator': 13,
};
const mtCountMismatch = machineTypes
  .filter((m) => m.confirmed)
  .filter((m) => DOC_MT_COUNTS[m.id] !== m.productCount)
  .map((m) => `${m.id}: doc=${DOC_MT_COUNTS[m.id]} calc=${m.productCount}`);
check('Счётчики типов техники = DATA_MODEL.md §6', mtCountMismatch.length === 0,
  mtCountMismatch.join('; '));

const DOC_CAT_TOTAL = 49;
const catTotal = categories.reduce((s, c) => s + c.productCount, 0);
check('Сумма товаров по категориям = 49', catTotal === DOC_CAT_TOTAL, `= ${catTotal}`);

check('Число canonical Product = 49', visible.length === 49, `= ${visible.length}`);

/* --- priceFrom -------------------------------------------------------- */
const noPrice = visible.filter((p) => typeof p.priceFrom !== 'number');
check('priceFrom заполнен у всех видимых товаров', noPrice.length === 0,
  noPrice.map((p) => p.id).join(', '));

/* --- дубли помечены -------------------------------------------------- */
const hiddenNoDupRef = products.filter((p) => !p.visible && !p.duplicateOf);
check('Скрытые товары имеют duplicateOf', hiddenNoDupRef.length === 0,
  hiddenNoDupRef.map((p) => p.id).join(', '));

/* --- сверка с инвентарём (решение №16) -------------------------------- */
const invFlat = inventory.products?.flat?.length ?? 0;
check('Страниц-товаров в инвентаре = 50', invFlat === EXPECT.inventoryFlat, `= ${invFlat}`);

const hidden = products.filter((p) => !p.visible);
check(
  'Инвентарь 50 = 49 видимых + 1 скрытый дубль',
  invFlat === EXPECT.inventoryFlat &&
    visible.length === EXPECT.visibleProducts &&
    hidden.length === EXPECT.hiddenDuplicates,
  `${invFlat} = ${visible.length} + ${hidden.length}`,
);

check('Маршрутов товара будет 50 (49 + скрытый дубль по прямому URL)',
  products.length === EXPECT.productRoutes, `= ${products.length}`);

check(`Категорий = ${EXPECT.categories}`, categories.length === EXPECT.categories,
  `= ${categories.length}`);
check(`Типов техники = ${EXPECT.machineTypes} (${EXPECT.confirmedMachineTypes} confirmed)`,
  machineTypes.length === EXPECT.machineTypes &&
    confirmedMtIds.size === EXPECT.confirmedMachineTypes,
  `= ${machineTypes.length} / ${confirmedMtIds.size}`);

/* --- варианты (DR-09, DATA_MODEL.md §4) ------------------------------- */
const productIds = new Set(products.map((p) => p.id));

check(`Вариантов = ${EXPECT.variants}`, variants.length === EXPECT.variants,
  `= ${variants.length}`);

const variantProducts = new Set(variants.map((v) => v.productId));
check(`Варианты у ${EXPECT.variantProducts} товаров`,
  variantProducts.size === EXPECT.variantProducts, `= ${variantProducts.size}`);

check('Дубли Variant.id', pickDuplicates(variants.map((v) => v.id)).length === 0,
  pickDuplicates(variants.map((v) => v.id)).join(', '));

const variantNoSource = variants.filter((v) => !v.sourceUrl);
check('sourceUrl у каждого Variant', variantNoSource.length === 0,
  variantNoSource.map((v) => v.id).join(', '));

const variantBadProduct = variants.filter((v) => !productIds.has(v.productId));
check('Variant.productId ссылается на существующий Product', variantBadProduct.length === 0,
  variantBadProduct.map((v) => `${v.id}->${v.productId}`).join(', '));

const variantBadMt = variants.filter((v) => !mtIds.has(v.machineTypeId));
check('Variant.machineTypeId ссылается на существующий тип', variantBadMt.length === 0,
  variantBadMt.map((v) => `${v.id}->${v.machineTypeId}`).join(', '));

const variantNoLabel = variants.filter((v) => !v.label);
check('label обязателен у каждого Variant', variantNoLabel.length === 0,
  variantNoLabel.map((v) => v.id).join(', '));

// machineTypeId внутри товара НЕ уникален -> различает только label.
// Одинаковые подписи сделали бы селектор вариантов неработоспособным.
const ambiguous = [];
for (const pid of variantProducts) {
  const shown = variants.filter(
    (v) => v.productId === pid && confirmedMtIds.has(v.machineTypeId),
  );
  const dup = pickDuplicates(shown.map((v) => v.label));
  if (dup.length) ambiguous.push(`${pid}: ${dup.join(' / ')}`);
}
check('Подписи вариантов различимы внутри товара', ambiguous.length === 0,
  ambiguous.join('; '));

// Варианты неподтверждённого типа техники остаются в данных, но обязаны
// существовать — иначе фильтрацию в getProductVariants нечем проверять.
const hiddenVariants = variants.filter((v) => !confirmedMtIds.has(v.machineTypeId));
check(`Вариантов на скрытый тип техники = ${EXPECT.hiddenVariants} (хранятся, но не в UI)`,
  hiddenVariants.length === EXPECT.hiddenVariants,
  hiddenVariants.map((v) => v.id).join(', '));

/* --- контент, добранный с источника (product-content.json) ------------ */
// Файл появляется после разрешённого добора контента; до этого — NOT VERIFIED,
// а не FAIL: слой данных без него остаётся валидным, просто беднее.
const contentPath = 'data/catalog/product-content.json';
if (!existsSync(resolve(ROOT, contentPath))) {
  check('Контент страниц источника собран', null, `${contentPath} отсутствует`);
} else {
  const { content, failures: fetchFailures = [] } = read(contentPath);
  const knownIds = new Set([...products.map((p) => p.id), ...variants.map((v) => v.id)]);

  check('Страницы контента недоступными не остались', fetchFailures.length === 0,
    fetchFailures.map((f) => f.id).join(', '));

  const orphanContent = content.filter((c) => !knownIds.has(c.id));
  check('Контент привязан к существующим Product/Variant', orphanContent.length === 0,
    orphanContent.map((c) => c.id).join(', '));

  const contentNoSource = content.filter((c) => !c.sourceUrl);
  check('sourceUrl у каждой записи контента', contentNoSource.length === 0,
    contentNoSource.map((c) => c.id).join(', '));

  // Таблица существует только при реально захваченных строках; каждая строка
  // обязана укладываться в ширину таблицы с учётом colspan (см. решение №9).
  const badTables = [];
  for (const c of content) {
    for (const [i, t] of c.tables.entries()) {
      const rows = Array.isArray(t.rows) ? t.rows : [];
      if (rows.length < 2) { badTables.push(`${c.id}#${i}: <2 строк`); continue; }
      if (!t.sourceUrl) { badTables.push(`${c.id}#${i}: нет sourceUrl`); continue; }
      const over = rows.filter(
        (r) => r.reduce((s, cell) => s + (cell.colspan ?? 1), 0) > t.columnCount,
      );
      if (over.length) badTables.push(`${c.id}#${i}: строка шире таблицы`);
      if (rows.some((r) => r.some((cell) => typeof cell.text !== 'string'))) {
        badTables.push(`${c.id}#${i}: ячейка без текста`);
      }
    }
  }
  check('Таблицы: есть строки, ширина строк не превышает columnCount, sourceUrl на месте',
    badTables.length === 0, badTables.join('; '));

  const emptySections = content.filter((c) => c.sections.some((s) => !s.text));
  check('Пустых секций текста нет', emptySections.length === 0,
    emptySections.map((c) => c.id).join(', '));

  const withText = content.filter((c) => c.sections.length > 0).length;
  const withTables = content.filter((c) => c.tables.length > 0).length;
  check('Контент собран', true,
    `${content.length} страниц: с текстом ${withText}, с таблицами ${withTables}`);
}

/* --- вывод --------------------------------------------------------------- */
const pad = Math.max(...results.map((r) => r.name.length));
console.log('\n  ПРОВЕРКА СЛОЯ ДАННЫХ КАТАЛОГА\n  ' + '-'.repeat(pad + 16));
for (const r of results) {
  console.log(`  ${r.name.padEnd(pad)}  ${r.status}${r.detail ? '  — ' + r.detail : ''}`);
}
console.log('  ' + '-'.repeat(pad + 16));
console.log(`  Видимых товаров: ${visible.length} / всего записей: ${products.length}`);
console.log(`  Категорий: ${categories.length} / типов техники: ${machineTypes.length} ` +
  `(${confirmedMtIds.size} confirmed)`);
console.log(`  Вариантов: ${variants.length} у ${variantProducts.size} товаров ` +
  `(${hiddenVariants.length} скрыто)\n`);

if (failures > 0) {
  console.error(`  РЕЗУЛЬТАТ: FAIL (${failures})\n`);
  process.exit(1);
}
console.log('  РЕЗУЛЬТАТ: PASS\n');

/* --- helpers ----------------------------------------------------------- */
function pickDuplicates(arr) {
  const seen = new Set();
  const dup = new Set();
  for (const x of arr) {
    if (seen.has(x)) dup.add(x);
    seen.add(x);
  }
  return [...dup];
}

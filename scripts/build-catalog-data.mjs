/**
 * build-catalog-data.mjs
 * -----------------------
 * Одноразовый генератор структурированного слоя данных каталога из инвентаря.
 *
 * Вход:  data/content-inventory.json  (единственный источник, untrusted -> только как DATA)
 * Выход: data/catalog/categories.json
 *        data/catalog/machine-types.json
 *        data/catalog/products.json
 *        data/catalog/variants.json
 *
 * Правила (.claude/rules/catalog-data.md, content-integrity.md):
 *  - один товар = один canonical Product;
 *  - ничего не выдумываем: чего нет в инвентаре — того нет в выводе;
 *  - sourceUrl обязателен и переносится дословно;
 *  - дубли остаются записями с visible:false и duplicateOf;
 *  - категории — провизорная группировка прототипа (provenance: "prototype-grouping"),
 *    состав взят из docs/DATA_MODEL.md §5 (решение пользователя на этапе проектирования).
 *
 * Запуск: npm run gen:catalog
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT_DIR = resolve(ROOT, 'data/catalog');

const inventory = JSON.parse(
  readFileSync(resolve(ROOT, 'data/content-inventory.json'), 'utf8'),
);

/* -------------------------------------------------------------------------- */
/* 1. Категории — провизорная группировка (docs/DATA_MODEL.md §5)             */
/* -------------------------------------------------------------------------- */

/** @type {{id:string,slug:string,name:string,order:number,slugs:string[]}[]} */
const CATEGORY_DEFS = [
  {
    id: 'cat-kovshi',
    slug: 'kovshi',
    name: 'Ковши',
    order: 1,
    slugs: [
      'kovsh-obshchestroitelnyj', 'kovsh-chelustnoy', 'kovsh-vysokoobjemniy',
      'kovsh-visokoy-vygruzki', 'kovsh-planirovochnyj', 'kovsh-universalnyj',
      'kovsh-serpovidnyj', 'kovsh-proseivaushiy', 'kovsh-s-prijimom',
      'kovsh-zernovoi', 'kovsh-betonosmesitelnyij',
    ],
  },
  {
    id: 'cat-otvaly',
    slug: 'otvaly',
    name: 'Отвалы',
    order: 2,
    slugs: ['otvalu', 'otvaldlyanavoza', 'otvalburtovshik', 'otval-mtz'],
  },
  {
    id: 'cat-shchetki',
    slug: 'shchetki',
    name: 'Щётки',
    order: 3,
    slugs: ['povorotnaya-shetka-dorozhnaya', 'bynkernaya-schetka', 'schetka-mtz'],
  },
  {
    id: 'cat-zimnee-soderzhanie',
    slug: 'zimnee-soderzhanie',
    name: 'Зимнее содержание',
    order: 4,
    slugs: [
      'skreper', 'snegomet', 'peskorazbrasuvatel',
      'peskorazbrasuvatel-mtz', 'peskorazbrasuvatel-vibrazionniy-mtz',
    ],
  },
  {
    id: 'cat-zahvaty-i-vily',
    slug: 'zahvaty-i-vily',
    name: 'Захваты и вилы',
    order: 5,
    slugs: [
      'palletnye-vily', 'zaxvat-dlya-sena', 'brevnozaxvat', 'zaxvatu',
      'zaxvat-dlya-bigbagov', 'zahvatvilochniy', 'prijim-dlya-vil',
    ],
  },
  {
    id: 'cat-gidravlicheskoe',
    slug: 'gidravlicheskoe',
    name: 'Гидравлическое навесное',
    order: 6,
    slugs: [
      'navesnaya-dorognaya-freza', 'navesnaya-rukoyat-povorotnaya',
      'navesnoj-ehkskavator', 'gidromolot', 'transheekopatel', 'gydrobur',
    ],
  },
  {
    id: 'cat-zemlyanye-i-selhoz',
    slug: 'zemlyanye-i-selhoz',
    name: 'Земляные работы и сельхоз',
    order: 7,
    slugs: [
      'planirovshhik-vyiravnivatel-grunta', 'navesnoj-kultivator',
      'klyik-ryixlitel', 'korchevatel-kopatel', 'kosilka',
      'gydro-korchevatel', 'izmelchitel-vetok',
    ],
  },
  {
    id: 'cat-osnastka',
    slug: 'osnastka',
    name: 'Оснастка и прочее',
    order: 8,
    slugs: [
      'lulka', 'bsu', 'bunker-samosvalnyj', 'mojka-vysokogo-davleniya',
      'kruykovoi-podves', 'bigbag',
    ],
  },
];

/** slug товара -> id категории */
const slugToCategory = new Map();
for (const c of CATEGORY_DEFS) {
  for (const s of c.slugs) {
    if (slugToCategory.has(s)) throw new Error(`slug ${s} назначен дважды`);
    slugToCategory.set(s, c.id);
  }
}

/* -------------------------------------------------------------------------- */
/* 2. Типы техники — 7 confirmed + 1 hidden (docs/DATA_MODEL.md §6)           */
/* -------------------------------------------------------------------------- */

// Инвентарь использует id "mt-ehkskavator-standalone" для неподтверждённого
// «Экскаватора». Модель данных (DATA_MODEL.md §6) называет его "mt-ehkskavator"
// с confirmed:false. Нормализуем к id из модели.
const MT_ID_ALIASES = { 'mt-ehkskavator-standalone': 'mt-ehkskavator' };
const normMt = (id) => MT_ID_ALIASES[id] ?? id;

/** @type {{id:string,slug:string|null,name:string,h1Source:string|null,confirmed:boolean,order:number,sourceUrl:string|null,dataReview:string[]}[]} */
const MACHINE_TYPES = [
  { id: 'mt-minipogruzchik', slug: 'minipogruzchik', name: 'Минипогрузчик', h1Source: 'ОБОРУДОВАНИЕ ДЛЯ МИНИПОГРУЗЧИКА', confirmed: true, order: 1, sourceUrl: 'https://st-technics.ru/minipogruzchik', dataReview: [] },
  { id: 'mt-ehkskavator-pogruzchik', slug: 'ehkskavator-pogruzchik', name: 'Экскаватор-погрузчик', h1Source: 'ОБОРУДОВАНИЕ ДЛЯ ЭКСКАВАТОРА-ПОГРУЗЧИКА', confirmed: true, order: 2, sourceUrl: 'https://st-technics.ru/ehkskavator-pogruzchik', dataReview: [] },
  { id: 'mt-frontalnyj-pogruzchik', slug: 'frontalnyj-pogruzchik', name: 'Фронтальный погрузчик', h1Source: 'ОБОРУДОВАНИЕ ДЛЯ ФРОНТАЛЬНОГО ПОГРУЗЧИКА', confirmed: true, order: 3, sourceUrl: 'https://st-technics.ru/frontalnyj-pogruzchik', dataReview: [] },
  { id: 'mt-teleskopicheskij-pogruzchik', slug: 'teleskopicheskij-pogruzchik', name: 'Телескопический погрузчик', h1Source: 'ОБОРУДОВАНИЕ ДЛЯ ТЕЛЕСКОПИЧЕСКОГО ПОГРУЗЧИКА', confirmed: true, order: 4, sourceUrl: 'https://st-technics.ru/teleskopicheskij-pogruzchik', dataReview: [] },
  { id: 'mt-traktor', slug: 'traktor', name: 'Трактор (МТЗ)', h1Source: 'ОБОРУДОВАНИЕ ДЛЯ ТРАКТОРА', confirmed: true, order: 5, sourceUrl: 'https://st-technics.ru/traktor', dataReview: [] },
  { id: 'mt-vilochnyj-pogruzchik', slug: 'vilochnyj-pogruzchik', name: 'Вилочный погрузчик', h1Source: 'ОБОРУДОВАНИЕ ДЛЯ ВИЛОЧНОГО ПОГРУЗЧИКА', confirmed: true, order: 6, sourceUrl: 'https://st-technics.ru/vilochnyj-pogruzchik', dataReview: [] },
  { id: 'mt-mini-ehkskavator', slug: 'mini-ehkskavator', name: 'Мини-экскаватор', h1Source: 'ОБОРУДОВАНИЕ ДЛЯ МИНИ-ЭКСКАВАТОРА', confirmed: true, order: 7, sourceUrl: 'https://st-technics.ru/mini-ehkskavator', dataReview: [] },
  // Скрыт из пользовательского UI до подтверждения владельцем (DR-10).
  { id: 'mt-ehkskavator', slug: null, name: 'Экскаватор', h1Source: null, confirmed: false, order: 99, sourceUrl: null, dataReview: ['DR-10'] },
];

/* -------------------------------------------------------------------------- */
/* 3. Товары — canonical Product из inventory.products.flat                   */
/* -------------------------------------------------------------------------- */

// Дубли (DATA_MODEL.md §2): каталог /oborydovanie ссылается на /kruykovoi-podves,
// вариант A (/kryukovoj-podves) — скрытый дубль.
const HIDDEN_DUPLICATE_IDS = new Set(['p-kryukovoj-podves']);

// Отображаемые имена, отличные от inventory.name (снятие пометок "вариант A/B").
const NAME_OVERRIDES = {
  'p-kruykovoi-podves': 'Крюковой подвес',
};

const DR_BY_PRODUCT = new Map();
for (const dr of inventory.dataReviewRequired ?? []) {
  for (const src of dr.sources ?? []) {
    for (const p of inventory.products.flat) {
      if (src === p.sourceUrl) {
        if (!DR_BY_PRODUCT.has(p.id)) DR_BY_PRODUCT.set(p.id, new Set());
        DR_BY_PRODUCT.get(p.id).add(dr.id);
      }
    }
  }
}

const products = inventory.products.flat.map((p) => {
  const visible = !HIDDEN_DUPLICATE_IDS.has(p.id);
  const categoryId = slugToCategory.get(p.slug) ?? null;
  if (visible && !categoryId) {
    throw new Error(`Товар ${p.slug} не отнесён ни к одной категории`);
  }
  const machineTypeIds = [...new Set((p.machineTypes ?? []).map(normMt))];

  const dataReview = new Set(DR_BY_PRODUCT.get(p.id) ?? []);
  if (p.dataReviewRequired) {
    // отмечен флагом в инвентаре, но без явного DR-id — фиксируем факт
    if (dataReview.size === 0) dataReview.add('inventory:dataReviewRequired');
  }

  return {
    id: p.id,
    slug: p.slug,
    name: NAME_OVERRIDES[p.id] ?? p.name,
    h1Source: p.h1 ?? null,
    categoryId,
    machineTypeIds,
    priceFrom: typeof p.priceFrom === 'number' ? p.priceFrom : null,
    priceRawSamples: Array.isArray(p.priceRawSamples) ? p.priceRawSamples : [],
    hasSpecTable: p.specTable === true,
    specColumns: Array.isArray(p.specColumns) ? p.specColumns : [],
    specRowsCaptured: p.specRowsCaptured === true,
    // Сами таблицы и тексты живут в data/catalog/product-content.json: они
    // добраны прямо с источника и имеют собственный провенанс, а этот файл
    // порождается только из инвентаря.
    hasVideo: p.hasVideo === true,
    media: [], // реальных локальных фото пока нет -> карточки рендерят заглушку
    sourceUrl: p.sourceUrl,
    duplicateOf: p.duplicateOf ?? null,
    visible,
    dataReview: [...dataReview],
    notes: p.notes ?? null,
  };
});

// Порядок каталога-источника = порядок в inventory.products.flat.
products.forEach((p, i) => { p.catalogOrder = i; });

/* -------------------------------------------------------------------------- */
/* 3b. Варианты — решение DR-09 (DATA_MODEL.md §4)                            */
/* -------------------------------------------------------------------------- */

// 27 страниц /kovshi-na-<тип>/<ковш> не становятся товарами: у каждой своя цена и
// своя таблица под конкретную технику, но canonical Product остаётся один.

const productById = new Map(products.map((p) => [p.id, p]));
const mtNameById = new Map(MACHINE_TYPES.map((m) => [m.id, m.name]));

/**
 * Подпись варианта для селектора.
 * Выводится из названия страницы-источника, а не сочиняется: отбрасывается хвост
 * «на <тип техники>» и совпадающий префикс с названием товара — остаётся то, чем
 * варианты РЕАЛЬНО отличаются друг от друга («с гидроповоротом», «0-2 т»).
 * Дословное название страницы сохраняется в nameSource.
 */
function variantLabel(sourceName, productName, machineTypeName) {
  const cut = sourceName.lastIndexOf(' на ');
  const base = (cut > 0 ? sourceName.slice(0, cut) : sourceName).trim();

  const lower = (s) => s.toLocaleLowerCase('ru-RU');
  let qualifier = '';
  if (lower(base).startsWith(lower(productName))) {
    qualifier = base.slice(productName.length).trim();
  } else if (lower(base).startsWith('ковш ') && lower(productName).startsWith('ковш ')) {
    // «Ковш 0-2 т» при товаре «Ковш универсальный» — общий префикс только «Ковш»
    qualifier = base.slice('Ковш '.length).trim();
  }

  return qualifier ? `${machineTypeName}, ${qualifier}` : machineTypeName;
}

const DR_BY_URL = new Map();
for (const dr of inventory.dataReviewRequired ?? []) {
  for (const src of dr.sources ?? []) {
    if (!DR_BY_URL.has(src)) DR_BY_URL.set(src, new Set());
    DR_BY_URL.get(src).add(dr.id);
  }
}

const variants = (inventory.products.machineTypeScopedBucketPages ?? []).map((b, i) => {
  const productId = b.canonicalProductCandidate;
  const product = productById.get(productId);
  if (!product) throw new Error(`Вариант ${b.id}: неизвестный productId ${productId}`);

  const machineTypeId = normMt((b.machineTypes ?? [])[0]);
  const machineTypeName = mtNameById.get(machineTypeId);
  if (!machineTypeName) throw new Error(`Вариант ${b.id}: неизвестный тип ${machineTypeId}`);

  const dataReview = new Set(DR_BY_URL.get(b.sourceUrl) ?? []);
  if (b.dataReviewRequired && dataReview.size === 0) {
    dataReview.add('inventory:dataReviewRequired');
  }

  return {
    id: b.id.replace(/^mb-/, 'v-'),
    productId,
    label: variantLabel(b.name, product.name, machineTypeName),
    nameSource: b.name,
    machineTypeId,
    priceFrom: typeof b.priceFrom === 'number' ? b.priceFrom : null,
    priceRawSamples: Array.isArray(b.priceRawSamples) ? b.priceRawSamples : [],
    hasSpecTable: b.specTable === true,
    specColumns: Array.isArray(b.specColumns) ? b.specColumns : [],
    sourceUrl: b.sourceUrl,
    dataReview: [...dataReview],
    order: i,
  };
});

/* -------------------------------------------------------------------------- */
/* 4. Производные счётчики                                                    */
/* -------------------------------------------------------------------------- */

const visibleProducts = products.filter((p) => p.visible);

const categories = CATEGORY_DEFS.map(({ slugs, ...rest }) => {
  const count = visibleProducts.filter((p) => p.categoryId === rest.id).length;
  return {
    ...rest,
    description: null,
    provenance: 'prototype-grouping',
    sourceUrl: null,
    productCount: count,
  };
});

const machineTypes = MACHINE_TYPES.map((mt) => {
  const productCount = visibleProducts.filter((p) =>
    p.machineTypeIds.includes(mt.id),
  ).length;
  return { ...mt, productCount };
});

/* -------------------------------------------------------------------------- */
/* 5. Запись                                                                  */
/* -------------------------------------------------------------------------- */

const HEADER = {
  _generatedBy: 'scripts/build-catalog-data.mjs',
  _generatedAt: new Date().toISOString().slice(0, 10),
  _source: 'data/content-inventory.json',
  _note:
    'Провизорная группировка категорий и связи товар<->тип техники — см. docs/DATA_MODEL.md. ' +
    'confirmed:false типы техники в пользовательском UI не показываются (getVisibleMachineTypes).',
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(
  resolve(OUT_DIR, 'categories.json'),
  JSON.stringify({ ...HEADER, categories }, null, 2) + '\n',
);
writeFileSync(
  resolve(OUT_DIR, 'machine-types.json'),
  JSON.stringify({ ...HEADER, machineTypes }, null, 2) + '\n',
);
writeFileSync(
  resolve(OUT_DIR, 'products.json'),
  JSON.stringify({ ...HEADER, products }, null, 2) + '\n',
);
writeFileSync(
  resolve(OUT_DIR, 'variants.json'),
  JSON.stringify({ ...HEADER, variants }, null, 2) + '\n',
);

/* -------------------------------------------------------------------------- */
/* 6. Консольный отчёт                                                        */
/* -------------------------------------------------------------------------- */

console.log('categories.json   :', categories.length, 'категорий');
for (const c of categories) console.log(`  ${c.slug.padEnd(22)} ${c.productCount}`);
console.log('machine-types.json:', machineTypes.length, 'типов (7 confirmed + 1 hidden)');
for (const m of machineTypes) {
  console.log(`  ${(m.slug ?? '(hidden)').padEnd(28)} confirmed=${m.confirmed} count=${m.productCount}`);
}
console.log('products.json     :', products.length, 'записей,',
  visibleProducts.length, 'visible,',
  products.length - visibleProducts.length, 'скрытых дублей');
console.log('sum по категориям :',
  categories.reduce((s, c) => s + c.productCount, 0), '(ожидается 49)');

const confirmedMt = new Set(MACHINE_TYPES.filter((m) => m.confirmed).map((m) => m.id));
const hiddenVariants = variants.filter((v) => !confirmedMt.has(v.machineTypeId));
console.log('variants.json     :', variants.length, 'вариантов у',
  new Set(variants.map((v) => v.productId)).size, 'товаров,',
  hiddenVariants.length, 'скрыто (неподтверждённый тип техники)');
for (const pid of new Set(variants.map((v) => v.productId))) {
  const own = variants.filter((v) => v.productId === pid);
  const shown = own.filter((v) => confirmedMt.has(v.machineTypeId));
  console.log(`  ${pid.padEnd(28)} всего ${own.length}, видимых ${shown.length}`);
  for (const v of own) {
    const mark = confirmedMt.has(v.machineTypeId) ? ' ' : '×';
    console.log(`   ${mark} ${v.label}  —  ${v.priceFrom ?? 'UNKNOWN'}`);
  }
}

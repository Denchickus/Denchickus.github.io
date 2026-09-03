/**
 * Тесты слоя доступа к каталогу (src/data/catalog.ts).
 *
 * Зачем именно здесь: `validate-catalog.mjs` проверяет ЦЕЛОСТНОСТЬ JSON-данных,
 * а это — проверка ФУНКЦИЙ, через которые данные попадают в UI. Ошибка вида
 * «неподтверждённый тип техники просочился в выборку» не ловится ни типами, ни
 * сборкой: JSON остаётся валидным, страница собирается, и в интерфейсе просто
 * появляется то, чего показывать нельзя.
 *
 * Запуск: npm test  (node:test, без зависимостей; Node сам снимает типы с .ts)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getCategories,
  getCategoryBySlug,
  getVisibleMachineTypes,
  getAllMachineTypesUnsafe,
  getMachineTypeBySlug,
  getProducts,
  getProduct,
  getProductTotal,
  getProductsByCategory,
  getProductsByMachineType,
  getProductMachineTypes,
  getProductVariants,
  getAllVariantsUnsafe,
  getPreselectedVariant,
} from '../src/data/catalog.ts';

import {
  getSpecTables,
  hasSpecTables,
  getDescriptionSections,
  getCompatibilityText,
  getUnmatchedSpecTables,
} from '../src/data/productContent.ts';

/* -------------------------------------------------------------------------- */
/* Типы техники: confirmed:false не должен появляться в UI нигде               */
/* -------------------------------------------------------------------------- */

test('видимые типы техники — только confirmed, ровно 7', () => {
  const visible = getVisibleMachineTypes();
  assert.equal(visible.length, 7);
  assert.ok(visible.every((mt) => mt.confirmed === true));
  assert.ok(visible.every((mt) => typeof mt.slug === 'string' && mt.slug.length > 0));
});

test('скрытый тип техники существует в модели, но не имеет slug и страницы', () => {
  const hidden = getAllMachineTypesUnsafe().filter((mt) => !mt.confirmed);
  assert.equal(hidden.length, 1, 'ожидается ровно один скрытый тип (DR-10 «Экскаватор»)');
  assert.equal(hidden[0].slug, null);
  assert.equal(getMachineTypeBySlug('ehkskavator'), undefined);
});

test('витрина скрытого типа техники пуста', () => {
  assert.deepEqual(getProductsByMachineType('mt-ehkskavator'), []);
});

/* -------------------------------------------------------------------------- */
/* Товары: 49 видимых + 1 скрытый дубль, доступный по прямому URL              */
/* -------------------------------------------------------------------------- */

test('в каталоге 49 видимых товаров', () => {
  assert.equal(getProducts().length, 49);
  assert.equal(getProductTotal(), 49);
});

test('скрытый дубль не в выдаче, но доступен по прямому slug', () => {
  const hiddenSlug = 'kryukovoj-podves';
  assert.ok(
    !getProducts().some((p) => p.slug === hiddenSlug),
    'скрытый дубль не должен попадать в каталог',
  );
  const direct = getProduct(hiddenSlug);
  assert.ok(direct, 'скрытый дубль обязан открываться по прямому URL');
  assert.equal(direct.visible, false);
  assert.ok(direct.duplicateOf, 'у скрытого дубля обязан быть duplicateOf');
});

test('у каждого видимого товара есть sourceUrl, категория и цена', () => {
  for (const p of getProducts()) {
    assert.ok(p.sourceUrl, `${p.id}: пустой sourceUrl`);
    assert.ok(p.categoryId, `${p.id}: нет категории`);
    assert.equal(typeof p.priceFrom, 'number', `${p.id}: нет priceFrom`);
  }
});

/* -------------------------------------------------------------------------- */
/* Счётчики: то, что показывается пользователю, совпадает с выборками          */
/* -------------------------------------------------------------------------- */

test('счётчик категории совпадает с реальной выборкой, сумма = 49', () => {
  let total = 0;
  for (const c of getCategories()) {
    const actual = getProductsByCategory(c.id);
    assert.equal(
      actual.length,
      c.productCount,
      `${c.slug}: счётчик ${c.productCount}, выборка ${actual.length}`,
    );
    total += actual.length;
  }
  assert.equal(total, 49);
});

test('счётчик типа техники совпадает с реальной выборкой', () => {
  for (const mt of getVisibleMachineTypes()) {
    const actual = getProductsByMachineType(mt.id);
    assert.equal(
      actual.length,
      mt.productCount,
      `${mt.slug}: счётчик ${mt.productCount}, выборка ${actual.length}`,
    );
  }
});

test('категория находится по slug', () => {
  const c = getCategoryBySlug('kovshi');
  assert.ok(c);
  assert.equal(c.productCount, 11);
  assert.equal(getCategoryBySlug('nesushchestvuyushchaya'), undefined);
});

test('метки типов техники на карточке не содержат неподтверждённых', () => {
  const confirmed = new Set(getVisibleMachineTypes().map((mt) => mt.id));
  for (const p of getProducts()) {
    for (const mt of getProductMachineTypes(p)) {
      assert.ok(confirmed.has(mt.id), `${p.id}: показан неподтверждённый тип ${mt.id}`);
    }
  }
});

/* -------------------------------------------------------------------------- */
/* Варианты (DR-09)                                                            */
/* -------------------------------------------------------------------------- */

const BUCKET_PRODUCTS = [
  'p-kovsh-vysokoobjemniy',
  'p-kovsh-chelustnoy',
  'p-kovsh-visokoy-vygruzki',
  'p-kovsh-proseivaushiy',
  'p-kovsh-obshchestroitelnyj',
  'p-kovsh-planirovochnyj',
  'p-kovsh-serpovidnyj',
  'p-kovsh-universalnyj',
];

test('всего 27 вариантов у 8 товаров-ковшей', () => {
  const all = BUCKET_PRODUCTS.flatMap((id) => getAllVariantsUnsafe(id));
  assert.equal(all.length, 27);
});

test('варианты на неподтверждённый тип техники не попадают в UI', () => {
  const confirmed = new Set(getVisibleMachineTypes().map((mt) => mt.id));
  let hiddenCount = 0;
  for (const id of BUCKET_PRODUCTS) {
    for (const v of getProductVariants(id)) {
      assert.ok(confirmed.has(v.machineTypeId), `${v.id}: скрытый тип в UI-выборке`);
    }
    hiddenCount += getAllVariantsUnsafe(id).length - getProductVariants(id).length;
  }
  assert.equal(hiddenCount, 3, 'три варианта «на экскаватор» обязаны быть скрыты');
});

test('скрытые цены вариантов не попадают в UI-выборку', () => {
  // Конкретные суммы со страниц /kovshi-na-ehkskavator/* — реальные, но
  // привязаны к неподтверждённому типу техники, поэтому показывать их нельзя.
  const hiddenPrices = new Set([100000, 200000, 270000]);
  const shown = BUCKET_PRODUCTS.flatMap((id) => getProductVariants(id));
  const leaked = shown.filter(
    (v) => hiddenPrices.has(v.priceFrom) && v.machineTypeId === 'mt-ehkskavator',
  );
  assert.deepEqual(leaked, []);
});

test('подписи вариантов различимы внутри одного товара', () => {
  for (const id of BUCKET_PRODUCTS) {
    const labels = getProductVariants(id).map((v) => v.label);
    assert.equal(
      new Set(labels).size,
      labels.length,
      `${id}: одинаковые подписи вариантов — селектор станет неразличимым (${labels.join(' / ')})`,
    );
  }
});

test('у товаров с повторяющимся типом техники подпись уточняет вариант', () => {
  // Именно эти два случая делают machineTypeId неуникальным внутри товара.
  const planir = getProductVariants('p-kovsh-planirovochnyj');
  assert.equal(planir.length, 3);
  assert.equal(planir.filter((v) => v.machineTypeId === 'mt-ehkskavator-pogruzchik').length, 2);

  const univ = getProductVariants('p-kovsh-universalnyj');
  assert.equal(univ.length, 3);
  assert.ok(univ.every((v) => v.machineTypeId === 'mt-mini-ehkskavator'));
});

test('у каждого варианта есть sourceUrl и существующий товар', () => {
  const productIds = new Set(getProducts().map((p) => p.id));
  for (const id of BUCKET_PRODUCTS) {
    for (const v of getAllVariantsUnsafe(id)) {
      assert.ok(v.sourceUrl, `${v.id}: пустой sourceUrl`);
      assert.ok(productIds.has(v.productId), `${v.id}: битая ссылка на товар`);
      assert.equal(v.productId, id);
    }
  }
});

/* -------------------------------------------------------------------------- */
/* Предвыбор варианта по ?mt= (журней B)                                       */
/* -------------------------------------------------------------------------- */

test('?mt= предвыбирает вариант нужного типа техники', () => {
  const v = getPreselectedVariant('p-kovsh-chelustnoy', 'minipogruzchik');
  assert.ok(v);
  assert.equal(v.machineTypeId, 'mt-minipogruzchik');
});

test('без ?mt= и при неизвестном ?mt= берётся первый вариант по порядку источника', () => {
  const first = getProductVariants('p-kovsh-chelustnoy')[0];
  assert.equal(getPreselectedVariant('p-kovsh-chelustnoy', null).id, first.id);
  assert.equal(getPreselectedVariant('p-kovsh-chelustnoy', 'nesushchestvuyushchij').id, first.id);
});

test('?mt= со скрытым типом техники не открывает скрытый вариант', () => {
  // slug у скрытого типа отсутствует, поэтому подставляем правдоподобный —
  // поведение обязано быть «первый видимый вариант», а не скрытый.
  const v = getPreselectedVariant('p-kovsh-planirovochnyj', 'ehkskavator');
  assert.ok(v);
  assert.notEqual(v.machineTypeId, 'mt-ehkskavator');
});

test('у товара без вариантов предвыбирать нечего', () => {
  assert.equal(getPreselectedVariant('p-navesnaya-dorognaya-freza', 'minipogruzchik'), undefined);
});

/* -------------------------------------------------------------------------- */
/* Контент источника: таблицы и тексты                                        */
/* -------------------------------------------------------------------------- */

test('таблица существует только при реально захваченных строках', () => {
  const ids = [
    ...getProducts().map((p) => p.id),
    ...BUCKET_PRODUCTS.flatMap((id) => getAllVariantsUnsafe(id).map((v) => v.id)),
  ];
  for (const id of ids) {
    for (const t of getSpecTables(id)) {
      assert.ok(t.rows.length >= 2, `${id}: таблица без строк не должна существовать`);
      assert.ok(t.sourceUrl, `${id}: таблица без sourceUrl`);
      for (const row of t.rows) {
        const width = row.reduce((s, c) => s + c.colspan, 0);
        assert.ok(
          width <= t.columnCount,
          `${id}: строка шире таблицы (${width} > ${t.columnCount})`,
        );
      }
    }
  }
});

test('hasSpecTables совпадает с наличием таблиц', () => {
  for (const p of getProducts()) {
    assert.equal(hasSpecTables(p.id), getSpecTables(p.id).length > 0);
  }
});

test('описание не содержит служебных секций цены и агрегатирования', () => {
  for (const p of getProducts()) {
    for (const s of getDescriptionSections(p.id)) {
      assert.notEqual(s.label, 'ЦЕНА', `${p.id}: цена продублирована в описании`);
      assert.notEqual(s.label, 'АГРЕГАТИРОВАНИЕ', `${p.id}: совместимость внутри описания`);
      assert.ok(s.text.length > 0, `${p.id}: пустая секция описания`);
    }
  }
});

test('текст агрегатирования — отдельный блок и не пустой, если он есть', () => {
  let found = 0;
  for (const p of getProducts()) {
    const text = getCompatibilityText(p.id);
    if (text === null) continue;
    found++;
    assert.ok(text.trim().length > 0, `${p.id}: пустой текст агрегатирования`);
  }
  assert.ok(found > 0, 'ожидается, что у части товаров есть блок «АГРЕГАТИРОВАНИЕ»');
});

test('в текстах не осталось технического мусора Tilda', () => {
  for (const p of getProducts()) {
    for (const s of getDescriptionSections(p.id)) {
      assert.ok(!/КУПИТЬ\s*$/u.test(s.text), `${p.id}: хвостовая кнопка «КУПИТЬ» в тексте`);
      assert.ok(!/<[a-z]/i.test(s.text), `${p.id}: HTML-теги в тексте`);
    }
  }
});

/* -------------------------------------------------------------------------- */
/* DR-16: таблицы канонической страницы без соответствующего варианта          */
/* -------------------------------------------------------------------------- */

test('неучтённые таблицы показываются только при явной подписи с подтверждённым типом техники', () => {
  const confirmedNames = getVisibleMachineTypes().map((mt) => mt.name);
  assert.equal(getUnmatchedSpecTables('p-kovsh-obshchestroitelnyj').length, 1);
  assert.equal(getUnmatchedSpecTables('p-kovsh-universalnyj').length, 1);
  for (const p of getProducts()) {
    for (const t of getUnmatchedSpecTables(p.id)) {
      assert.ok(t.caption, `${p.id}: таблица без подписи не должна проходить фильтр`);
      const caption = t.caption.toLocaleLowerCase('ru-RU');
      assert.ok(
        confirmedNames.some((n) => caption.includes(n.toLocaleLowerCase('ru-RU').replace(/-/g, ' '))),
        `${p.id}: таблица «${t.caption}» показана без явного упоминания подтверждённого типа техники`,
      );
    }
  }
});

test('неучтённая таблица со скрытым типом техники рядом (DR-16) не просачивается', () => {
  // «Стоимость, руб» стоит на странице сразу за таблицей скрытого варианта
  // v-ex-univ (неподтверждённый «Экскаватор») и не должна показываться нигде —
  // ни через selector (variant скрыт), ни через getUnmatchedSpecTables.
  const leaked = getUnmatchedSpecTables('p-kovsh-universalnyj').find(
    (t) => t.caption === 'Стоимость, руб',
  );
  assert.equal(leaked, undefined);
});

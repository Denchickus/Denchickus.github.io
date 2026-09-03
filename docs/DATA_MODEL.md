# DATA MODEL — модель данных прототипа

Дата: 2026-08-30. Frontend не создавался. Файлы данных на этом этапе **не генерировались** —
документ описывает схему, по которой они будут построены из `data/content-inventory.json`.

Базовые правила — `.claude/rules/catalog-data.md` и `.claude/rules/content-integrity.md`:
один товар = один canonical Product; отсутствие данных — `null` / `[]` / `"UNKNOWN"`;
конфликт — оба значения и оба URL, без автоматического выбора.

---

## 1. Обзор сущностей

```
Category (8, provisional)  ──1───n──▶  Product (49 canonical)
MachineType (7 + 1 hidden) ──n───n──▶  Product
                                        │
                                        ├──0..n──▶ ProductVariant (27, ковши)
                                        ├──0..n──▶ SpecTable (произвольные колонки)
                                        ├──0..n──▶ Asset
                                        ├──0..n──▶ Document (сейчас 0)
                                        └──0..n──▶ DataReviewFlag
```

Числа — фактические, пересчитаны по инвентарю.

---

## 2. Product

Canonical-объект. 49 записей. Ни один товар не дублируется из-за нескольких типов техники.

```ts
interface Product {
  id: string;                    // "p-kovsh-chelustnoy"
  slug: string;                  // "kovsh-chelustnoy" — из sitemap.xml источника
  name: string;                  // человекочитаемое; H1 источника хранится отдельно
  h1Source: string | null;       // как на источнике, КАПСОМ
  categoryId: string;            // ровно один, provisional
  machineTypeIds: string[];      // PARTIALLY VERIFIED, включая неподтверждённые
  priceFrom: number | null;      // рубли; заполнено у 49/49
  priceRawSamples: string[];     // verbatim строки цен источника
  specTables: SpecTable[];       // 0..n, произвольные схемы
  variants: ProductVariant[];    // 0..n, см. §4
  media: Asset[];
  video: Video | null;
  documents: Document[];         // сейчас пусто у всех
  descriptionHtml: string | null;
  advantages: string[];
  aggregationNote: string | null;// текст блока «АГРЕГАТИРОВАНИЕ»
  relatedIds: string[];          // только внутри своей категории
  sourceUrl: string;             // обязателен, 49/49
  duplicateOf: string | null;    // DR-01 / DR-02
  visible: boolean;              // скрытые дубли не попадают в каталог
  dataReview: string[];          // ["DR-12"]
  notVerified: string[];         // перечень непроверенных полей
}
```

**Обязательные поля:** `id`, `slug`, `name`, `categoryId`, `sourceUrl`, `visible`.
Всё остальное может быть `null` / `[]` — и тогда соответствующий блок страницы не рендерится.

**Дубли.** `p-kryukovoj-podves` и `p-kruykovoi-podves` (DR-01) остаются двумя записями со взаимными
`duplicateOf`; в каталоге показывается только та, на которую ссылается `/oborydovanie`
(`kruykovoi-podves`), у второй `visible: false`. Отображаемое имя — «Крюковой подвес»;
пометки «вариант A/B» из инвентаря в интерфейс не выводятся. Аналогично `/page63841391.html`
(DR-02) не порождает отдельного Product.

---

## 3. SpecTable — произвольные схемы

Таблицы характеристик у источника имеют **разные схемы**: от 3 до 12 колонок, у 21 товара из 49.
Никакой общей схемы «параметр → значение» не существует и вводить её нельзя — это исказило бы данные.

```ts
interface SpecTable {
  title: string | null;          // "Характеристики и цены"
  columns: string[];             // verbatim заголовки источника
  rows: (string | null)[][];     // строки; длина каждой === columns.length
  rowsCaptured: boolean;         // false → показываем только то, что есть
  machineTypeId: string | null;  // если таблица относится к варианту
  sourceUrl: string;
  dataReview: string[];
}
```

Примеры реальных схем:

| Товар | Колонок | Заголовки |
|---|---|---|
| Ковш общестроительный | 5 | Модель · Ширина ковша, мм · Объем по SAE · Масса ковша, кг · Стоимость, руб. |
| Гидробур | 3 | Длина · S4 · S5 |
| Измельчитель веток | 12 | Тип оборудования · Габариты (рабочее) · Габариты (транспортное) · Страна · Тип носителя · Масса · Макс. размер веток · Производительность · Кол-во ножей · Мощность трактора · Диаметр ротора · Размер щепы |

**Цена живёт внутри таблицы.** У источника колонка «Стоимость, руб.» — часть таблицы характеристик,
то есть таблица одновременно является прайсом по вариантам. Разделять их на «характеристики» и
«цены» нельзя: строка «модель — ширина — масса — цена» распалась бы и потеряла смысл. Поэтому
`SpecTable` рендерится как есть, а `priceFrom` — производная величина для карточек и фильтра.

`rowsCaptured: false` (16 из 21 таблиц) означает, что известны только заголовки колонок. Такая
таблица **не рендерится**; вместо неё на странице ничего нет. Придумывать строки запрещено.

---

## 4. ProductVariant — решение DR-09

27 страниц `/kovshi-na-<тип>/<ковш>` не становятся товарами. Они становятся вариантами 8 канонических
ковшей, потому что у каждой свои цена и таблица под конкретную технику.

```ts
interface ProductVariant {
  id: string;                    // "v-kovsh-chelustnoy-frontalnyj"
  productId: string;
  label: string;                 // "На фронтальный погрузчик", "С гидроповоротом", "0–2 т"
  machineTypeId: string;
  priceFrom: number | null;
  priceRawSamples: string[];
  specTable: SpecTable | null;
  sourceUrl: string;             // URL исходной страницы варианта
  dataReview: string[];
}
```

**`variants` — список, а не словарь по типу техники.** У `p-kovsh-planirovochnyj` два варианта на
экскаватор-погрузчик («обычный» и «с гидроповоротом»), у `p-kovsh-universalnyj` три варианта на
мини-экскаватор (0–2 т, 2–4 т, 4–7 т). Ключ `machineTypeId` не уникален, поэтому `label` обязателен.

Распределение вариантов:

| Canonical Product | Вариантов | Типы техники |
|---|---|---|
| Ковш планировочный | 5 | экскаватор-погрузчик ×2, экскаватор ×2 (скрыт), мини-экскаватор |
| Ковш высокообъёмный | 4 | мини-, экскаватор-, телескопический, фронтальный погрузчик |
| Ковш челюстной | 4 | мини-, экскаватор-, телескопический, фронтальный погрузчик |
| Ковш универсальный | 4 | экскаватор (скрыт), мини-экскаватор ×3 (по тоннажу) |
| Ковш просеивающий | 3 | мини-, телескопический, фронтальный погрузчик |
| Ковш общестроительный | 3 | экскаватор-, телескопический, фронтальный погрузчик |
| Ковш высокой выгрузки | 2 | минипогрузчик, фронтальный погрузчик |
| Ковш серповидный | 2 | экскаватор-погрузчик, мини-экскаватор |

**Конфликт цен сохраняется, а не разрешается.** У «плоской» карточки «Ковш общестроительный»
`priceFrom = 50 000`, у вариантов — 90 000 / 155 000 / 175 000. Оба источника хранятся со своими
URL; на странице показывается «от 50 000 ₽» (значение плоской карточки) и цены вариантов рядом,
как на источнике. Итоговое решение — за владельцем (DR-09 остаётся открытым).

---

## 5. Category — провизорная группировка

8 записей. **Это уровень прототипа, а не факт исходного сайта** (`categoryGroupingNotFromSource`).

```ts
interface Category {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  provenance: "prototype-grouping";   // всегда, у всех 8
  sourceUrl: null;                    // соответствующей страницы у источника нет
  order: number;
}
```

Назначение категории — механическая группировка по типу изделия из его же названия;
технический и коммерческий смысл товара не меняется. Названия групп требуют подтверждения владельцем.

### Полное распределение 49 товаров

**Ковши** (11) — `kovshi`

| Товар | slug | от, ₽ | Таблица | Видео |
|---|---|---|---|---|
| Ковш общестроительный | `kovsh-obshchestroitelnyj` | 50 000 | да | — |
| Ковш челюстной | `kovsh-chelustnoy` | 195 000 | да | — |
| Ковш высокообъёмный | `kovsh-vysokoobjemniy` | 75 000 | да | — |
| Ковш высокой выгрузки | `kovsh-visokoy-vygruzki` | 175 000 | да | — |
| Ковш планировочный | `kovsh-planirovochnyj` | 21 000 | да | — |
| Ковш универсальный | `kovsh-universalnyj` | 30 000 | да | — |
| Ковш серповидный | `kovsh-serpovidnyj` | 32 000 | да | — |
| Ковш просеивающий | `kovsh-proseivaushiy` | 120 000 | да | — |
| Ковш с прижимом | `kovsh-s-prijimom` | 155 000 | да | — |
| Ковш зерновой | `kovsh-zernovoi` | 210 000 | да | — |
| Ковш бетоносмеситель | `kovsh-betonosmesitelnyij` | 250 000 | — | — |

**Отвалы** (4) — `otvaly`

| Товар | slug | от, ₽ | Таблица | Видео |
|---|---|---|---|---|
| Отвалы | `otvalu` | 60 000 | — | да |
| Отвал для навоза | `otvaldlyanavoza` | 250 000 | — | — |
| Отвал-буртовщик | `otvalburtovshik` | 190 000 | — | — |
| Отвал МТЗ | `otval-mtz` | 105 000 | да | — |

**Щётки** (3) — `shchetki`

| Товар | slug | от, ₽ | Таблица | Видео |
|---|---|---|---|---|
| Коммунальная дорожная щётка (щётка поворотная) | `povorotnaya-shetka-dorozhnaya` | 105 000 | — | да |
| Щётка с бункером | `bynkernaya-schetka` | 145 000 | — | да |
| Щётка МТЗ | `schetka-mtz` | 125 000 | да | — |

**Зимнее содержание** (5) — `zimnee-soderzhanie`

| Товар | slug | от, ₽ | Таблица | Видео |
|---|---|---|---|---|
| Скрепер (скалыватель льда) | `skreper` | 60 000 | — | да |
| Шнекороторный снегометатель | `snegomet` | 190 000 | — | да |
| Разбрасыватель реагентов | `peskorazbrasuvatel` | 95 000 | — | — |
| Пескоразбрасыватель МТЗ | `peskorazbrasuvatel-mtz` | 100 000 | да | — |
| Пескоразбрасыватель вибрационный МТЗ | `peskorazbrasuvatel-vibrazionniy-mtz` | 300 000 | да | — |

**Захваты и вилы** (7) — `zahvaty-i-vily`

| Товар | slug | от, ₽ | Таблица | Видео |
|---|---|---|---|---|
| Паллетные вилы и удлинители вил | `palletnye-vily` | 65 000 | — | — |
| Захват для сена | `zaxvat-dlya-sena` | 240 000 | — | — |
| Бревнозахват | `brevnozaxvat` | 180 000 | — | — |
| Захват для рулонов | `zaxvatu` | 220 000 | — | — |
| Захват для биг-бэгов | `zaxvat-dlya-bigbagov` | 230 000 | — | — |
| Захват вилочный | `zahvatvilochniy` | 180 000 | — | — |
| Прижим для паллетных вил | `prijim-dlya-vil` | 65 000 | — | — |

**Гидравлическое навесное** (6) — `gidravlicheskoe`

| Товар | slug | от, ₽ | Таблица | Видео |
|---|---|---|---|---|
| Фреза дорожная навесная | `navesnaya-dorognaya-freza` | 260 000 | — | да |
| Навесная рукоять (поворотная) | `navesnaya-rukoyat-povorotnaya` | 190 000 | да | — |
| Навесной экскаватор | `navesnoj-ehkskavator` | 500 000 | да | — |
| Гидромолот | `gidromolot` | 180 000 | — | — |
| Траншеекопатель | `transheekopatel` | 420 000 | — | — |
| Гидробур | `gydrobur` | 135 000 | да | — |

**Земляные работы и сельхоз** (7) — `zemlyanye-i-selhoz`

| Товар | slug | от, ₽ | Таблица | Видео |
|---|---|---|---|---|
| Планировщик-выравниватель грунта | `planirovshhik-vyiravnivatel-grunta` | 60 000 | — | — |
| Навесной культиватор | `navesnoj-kultivator` | 220 000 | — | — |
| Клык-рыхлитель | `klyik-ryixlitel` | 30 000 | — | — |
| Корчеватель (копатель) | `korchevatel-kopatel` | 78 000 | — | — |
| Косилка | `kosilka` | 230 000 | — | — |
| Гидравлический корчеватель | `gydro-korchevatel` | 250 000 | да | — |
| Измельчитель веток | `izmelchitel-vetok` | 150 000 | да | — |

**Оснастка и прочее** (6) — `osnastka`

| Товар | slug | от, ₽ | Таблица | Видео |
|---|---|---|---|---|
| Люлька | `lulka` | 95 000 | — | — |
| Быстросъёмное устройство (БСУ) | `bsu` | 2 500 | — | — |
| Бункер самосвальный | `bunker-samosvalnyj` | 150 000 | да | — |
| Мойка высокого давления | `mojka-vysokogo-davleniya` | 250 000 | да | — |
| Крюковой подвес | `kruykovoi-podves` | 100 000 | — | — |
| Наполнитель для биг-бэгов | `bigbag` | 165 000 | — | — |

Проверено скриптом: 50 плоских страниц − 1 скрытый дубль = **49 назначенных, 0 неназначенных,
0 двойных назначений**.

---

## 6. MachineType

```ts
interface MachineType {
  id: string;
  slug: string;
  name: string;
  h1Source: string | null;
  confirmed: boolean;            // ключевое поле
  sourceUrl: string | null;
  order: number;
  dataReview: string[];
}
```

| id | Название | slug | confirmed | Товаров |
|---|---|---|---|---|
| `mt-minipogruzchik` | Минипогрузчик | `minipogruzchik` | true | 35 |
| `mt-ehkskavator-pogruzchik` | Экскаватор-погрузчик | `ehkskavator-pogruzchik` | true | 25 |
| `mt-frontalnyj-pogruzchik` | Фронтальный погрузчик | `frontalnyj-pogruzchik` | true | 23 |
| `mt-teleskopicheskij-pogruzchik` | Телескопический погрузчик | `teleskopicheskij-pogruzchik` | true | 19 |
| `mt-traktor` | Трактор (МТЗ) | `traktor` | true | 16 |
| `mt-vilochnyj-pogruzchik` | Вилочный погрузчик | `vilochnyj-pogruzchik` | true | 13 |
| `mt-mini-ehkskavator` | Мини-экскаватор | `mini-ehkskavator` | true | 13 |
| `mt-ehkskavator` | Экскаватор | — | **false** (DR-10) | 3 |

### Правило видимости

Запись с `confirmed: false` хранится в данных, но **не показывается пользователю нигде**:

- нет в `/machines`;
- нет в фасете «Тип техники» в каталоге;
- нет в блоке типов техники на главной;
- нет в метках совместимости на карточке и на странице товара;
- нет страницы `/machines/ehkskavator`.

Реализация: единственный источник для пользовательского UI — селектор
`getVisibleMachineTypes() → machineTypes.filter(m => m.confirmed)`. Компоненты не обращаются к
массиву напрямую. Варианты товаров, привязанные к неподтверждённому типу
(3 страницы `/kovshi-na-ehkskavator/*`), сохраняются в данных, но не рендерятся и не участвуют в
подсчёте вариантов на странице.

Единственное место, где «Экскаватор» виден, — служебная `/_data-review`.

---

## 7. Asset, Video, Document

```ts
interface Asset {
  id: string;
  role: "logo" | "hero" | "gallery" | "card" | "placeholder";
  sourceUrl: string | null;      // исходный URL, обязателен для реальных фото
  localPath: string | null;      // путь в проекте, когда файл положен локально
  alt: string | null;            // null → altNotVerified
  altNotVerified: boolean;
  width: number | null;
  height: number | null;
}
```

Правила: реальное фото рендерится, только если есть `localPath` **или** подтверждённый `sourceUrl`.
Если ни того ни другого — рендерится **явная техническая заглушка**, читаемая как заглушка.
AI-изображения и стоковые фотографии как фото продукции СТ-ТЕХНИКС запрещены
(`content-integrity.md`). Сейчас в манифесте подтверждено 2 ассета из ожидаемых сотен.

```ts
interface Video { platform: "youtube" | "rutube" | "vk" | "UNKNOWN"; url: string | null; sourceUrl: string; }
interface Document { title: string; type: "pdf" | "doc"; url: string; sourceUrl: string; }
```

Платформа и URL видео не подтверждены → блок видео не рендерится, пока `url === null`
(6 товаров с секцией «ВИДЕО» ждут проверки). Документов найдено 0 → блок не рендерится ни у кого.

---

## 8. DataReviewFlag

```ts
interface DataReviewFlag {
  id: string;                    // "DR-09"
  topic: string;
  detail: string;
  values: { value: string; sourceUrl: string }[];   // все конфликтующие значения
  sources: string[];
  affects: { entity: "product" | "machineType" | "site"; id: string }[];
  status: "open" | "resolved";
  resolution: string | null;     // заполняется ТОЛЬКО решением владельца
}
```

Модель поддерживает DATA_REVIEW явно: конфликт — это не «ошибка загрузки», а нормальное состояние
записи. Оба значения хранятся вместе с URL, ни одно не выбирается автоматически. В клиентском UI
пометок нет; всё видно на `/_data-review`.

13 открытых пунктов: DR-01 … DR-12 из инвентаря + **DR-13, добавлен на этапе проектирования**:

> **DR-13.** Три страницы `/kovshi-na-miniehkskavator/kovsh-0-2-t`, `…/kovsh-2-4-t`, `…/kovsh-4-7-t`
> отнесены инвентаризацией к каноническому «Ковш универсальный» (`canonicalProductCandidate`).
> Это вывод исследования, а не утверждение источника: возможно, тоннажные ковши на мини-экскаватор
> — самостоятельный товар. Требуется подтверждение владельца.
> Источники: `https://st-technics.ru/kovshi-na-miniehkskavator`, `…/kovsh-0-2-t`,
> `https://st-technics.ru/kovsh-universalnyj`.

---

## 9. Файлы данных и валидация (следующий этап)

```
data/catalog/products.json        49 canonical + 2 скрытых дубля
data/catalog/variants.json        27
data/catalog/categories.json      8
data/catalog/machine-types.json   8 (7 confirmed + 1 hidden)
data/catalog/assets.json
data/catalog/data-review.json     13
src/types/catalog.ts              типы из этого документа
scripts/validate-catalog.mjs      обязательные проверки
```

`validate-catalog.mjs` (по `.claude/rules/testing.md`), запускается перед сборкой:

| Проверка | Ожидание |
|---|---|
| Дубли `id` / `slug` | 0 |
| `sourceUrl` у каждого Product и Variant | 100 % |
| `categoryId` ссылается на существующую категорию | 100 % |
| `machineTypeIds` ссылаются на существующие типы | 100 % |
| `variant.productId` ссылается на существующий Product | 100 % |
| `relatedIds` — только внутри своей категории и без самоссылок | 100 % |
| `specTable.rows[i].length === columns.length` | 100 % |
| Товаров без категории | 0 |
| `visible: false` не попадает в каталог, но доступен по прямому URL | да |
| Пользовательские выборки не содержат `confirmed: false` | да |
| Число canonical Product | 49 |

---

## 10. Как это подключается к настоящему backend/CMS позже

Слой данных изолирован: страницы обращаются только к `src/data/*.ts`
(`getProducts()`, `getProduct(slug)`, `getVisibleMachineTypes()`, `getCategories()`).
Сейчас эти функции читают локальный JSON на этапе сборки. Замена на CMS/API затрагивает только их:
типы, компоненты и маршруты не меняются. Поля `sourceUrl`, `provenance`, `dataReview` и `confirmed`
переносятся в CMS как есть — они часть модели, а не временные пометки прототипа.

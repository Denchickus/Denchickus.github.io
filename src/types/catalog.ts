/**
 * Типы слоя данных каталога прототипа СТ-ТЕХНИКС.
 * Схема — docs/DATA_MODEL.md. Этап каталога добавил ProductVariant и SpecTable;
 * description / advantages / video / documents появятся, только если реальные данные
 * будут найдены на источнике — выдуманных значений в этих полях быть не может.
 */

/** Провизорная группа каталога. НЕ факт исходного сайта. */
export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  /** всегда "prototype-grouping" — группировка уровня прототипа */
  provenance: 'prototype-grouping';
  /** у категорий нет страницы-источника */
  sourceUrl: null;
  order: number;
  /** число видимых canonical Product в категории (пересчитывается генератором) */
  productCount: number;
}

export interface MachineType {
  id: string;
  /** null у неподтверждённого типа — страницы у него нет */
  slug: string | null;
  name: string;
  h1Source: string | null;
  /** ключевое поле: confirmed:false НЕ показывается пользователю нигде */
  confirmed: boolean;
  sourceUrl: string | null;
  order: number;
  dataReview: string[];
  /** число совместимых видимых товаров (PARTIALLY VERIFIED) */
  productCount: number;
}

/** Ассет. На этапе foundation массив media у всех товаров пуст -> заглушка. */
export interface Asset {
  id: string;
  role: 'logo' | 'hero' | 'gallery' | 'card' | 'placeholder';
  sourceUrl: string | null;
  localPath: string | null;
  alt: string | null;
  altNotVerified: boolean;
  width: number | null;
  height: number | null;
}

/**
 * Ячейка таблицы характеристик.
 *
 * colspan/rowspan сохраняются, а не «выпрямляются»: таблицы источника реально
 * используют объединённые ячейки (группирующие заголовки, общее значение на
 * несколько строк). Попытка привести всё к прямоугольной сетке сдвигает значения
 * и портит технические данные — поэтому структура переносится как есть.
 */
export interface SpecCell {
  text: string;
  colspan: number;
  rowspan: number;
  /** Ячейка была <th> в источнике. */
  header: boolean;
}

/**
 * Таблица характеристик с произвольной схемой колонок (в источнике от 2 до 9).
 * Существует ТОЛЬКО когда реально захвачены строки (DATA_MODEL.md §3, решение №9).
 */
export interface SpecTable {
  /** Подпись: строка-заголовок внутри таблицы или ближайший заголовок блока. Не сочиняется. */
  caption: string | null;
  /** Все строки таблицы, включая заголовочные, в порядке источника. */
  rows: SpecCell[][];
  /** Сколько первых строк — заголовочные (бывает две при группирующем colspan). */
  headerRowCount: number;
  /** Максимальная ширина строки в колонках (с учётом colspan). */
  columnCount: number;
  /** Страница источника, с которой снята таблица. */
  sourceUrl: string;
}

/** Размеченная самим источником секция текста: «ОПИСАНИЕ», «АГРЕГАТИРОВАНИЕ», … */
export interface ContentSection {
  label: string | null;
  text: string;
}

/**
 * Фактический контент страницы источника (тексты и таблицы), собранный
 * scripts/fetch-product-content.mjs. Хранится отдельно от products.json ровно
 * потому, что products.json порождается из инвентаря, а это — прямой добор
 * с сайта со своим провенансом.
 */
export interface PageContent {
  kind: 'product' | 'variant';
  id: string;
  slug: string;
  sourceUrl: string;
  sections: ContentSection[];
  tables: SpecTable[];
}

/**
 * Вариант товара под конкретный тип техники — решение DR-09 (DATA_MODEL.md §4).
 * 27 страниц /kovshi-na-<тип>/<ковш> не становятся отдельными товарами: у каждой
 * своя цена и своя таблица под конкретную технику, но товар остаётся один.
 *
 * ВАЖНО: machineTypeId НЕ уникален внутри товара (у «Ковш планировочный» два варианта
 * на экскаватор-погрузчик, у «Ковш универсальный» три на мини-экскаватор), поэтому
 * label обязателен — без него варианты неразличимы в селекторе.
 */
export interface ProductVariant {
  id: string;
  productId: string;
  /** Подпись для селектора: «Экскаватор-погрузчик, с гидроповоротом», «Мини-экскаватор, 0-2 т». */
  label: string;
  /** Название страницы-источника verbatim — на случай, если понадобится дословная форма. */
  nameSource: string;
  /** Может указывать на confirmed:false тип — такие варианты в UI не попадают. */
  machineTypeId: string;
  priceFrom: number | null;
  /** verbatim-строки цен источника */
  priceRawSamples: string[];
  /** На странице-источнике таблица есть (по данным инвентаря). */
  hasSpecTable: boolean;
  /** Заголовки колонок по данным инвентаря. Сами таблицы — в PageContent. */
  specColumns: string[];
  sourceUrl: string;
  dataReview: string[];
  /** Порядок вариантов внутри товара = порядок в инвентаре. */
  order: number;
}

export interface Product {
  id: string;
  /** из sitemap.xml источника */
  slug: string;
  name: string;
  /** H1 источника, КАПСОМ */
  h1Source: string | null;
  /** ровно одна провизорная категория */
  categoryId: string | null;
  /** PARTIALLY VERIFIED; может включать неподтверждённые типы (фильтруется в UI) */
  machineTypeIds: string[];
  /** рубли; заполнено у 49/49 видимых */
  priceFrom: number | null;
  /** verbatim-строки цен источника */
  priceRawSamples: string[];
  hasSpecTable: boolean;
  specColumns: string[];
  specRowsCaptured: boolean;
  hasVideo: boolean;
  media: Asset[];
  /** обязателен, 49/49 */
  sourceUrl: string;
  duplicateOf: string | null;
  /** скрытые дубли не попадают в каталог, но доступны по прямому URL */
  visible: boolean;
  dataReview: string[];
  notes: string | null;
  /** порядок каталога-источника (индекс в inventory.products.flat) */
  catalogOrder: number;
}

/**
 * Provenance одной Telegram-ссылки, привязанной к конкретному UI placement источника.
 * DR-04 уточнён 2026-08-30: два Telegram-URL — не конфликт одного значения, а два разных
 * подтверждённых размещения на публичном сайте (см. комментарий у CONTACTS.telegram).
 */
export interface TelegramLink {
  url: string;
  placement: 'floating' | 'footer';
  /** Страница(ы) исходного сайта, на которых размещение подтверждено. */
  sourcePageUrl: string;
}

export interface SiteContacts {
  /** Только публично подтверждённые телефоны (DR-14). Сейчас — ровно один. */
  phones: string[];
  emailPrimary: string;
  /**
   * НЕ один общий telegramUrl — два раздельных подтверждённых размещения (DR-04).
   * floating и footer используют разные Telegram-URL источника и не взаимозаменяемы.
   */
  telegram: {
    floating: TelegramLink;
    footer: TelegramLink;
  };
  /** Полный адрес verbatim, подтверждён скриншотом /contacts 2026-08-30; DR-06 (корректность
   *  как почтового адреса) остаётся открытым. */
  locality: string;
  workingHours: string;
}

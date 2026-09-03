/**
 * Доступ к фактическому контенту страниц источника: тексты и таблицы характеристик.
 *
 * Данные собраны scripts/fetch-product-content.mjs прямо со страниц st-technics.ru
 * и хранятся отдельно от products.json (тот порождается из инвентаря). Здесь —
 * единственная точка доступа: страницы и компоненты не читают JSON напрямую.
 *
 * Что здесь НЕ делается: тексты не переписываются, не сокращаются, не дополняются;
 * таблицы не «выпрямляются». Отбор — только раскладка по секциям, которую задал
 * сам источник своими заголовками («ОПИСАНИЕ:», «АГРЕГАТИРОВАНИЕ:», …).
 */
import type { ContentSection, PageContent, SpecCell, SpecTable } from '../types/catalog';
import { getAllVariantsUnsafe, getVisibleMachineTypes } from './catalog.ts';

import contentFile from '../../data/catalog/product-content.json' with { type: 'json' };

const allContent = contentFile.content as PageContent[];
const byId = new Map(allContent.map((c) => [c.id, c]));

/** Секция «ЦЕНА» дублирует priceFrom/priceRawSamples и в UI отдельным текстом не нужна. */
const PRICE_LABEL = 'ЦЕНА';
/** Совместимость показывается собственным блоком, а не внутри описания. */
const COMPATIBILITY_LABEL = 'АГРЕГАТИРОВАНИЕ';
/**
 * У большинства товаров, где встречается эта секция, она дословно дублирует уже
 * захваченную spec-таблицу (getSpecTables) — просто текстом вместо <table>. Такую
 * секцию не нужно показывать отдельно (см. getDescriptionSections). Но у части
 * товаров таблицы вообще нет, и это единственный источник характеристик — для них
 * getTechCharacteristicsTable() ниже пытается собрать из неё настоящую таблицу.
 */
const TECH_LABEL = 'ТЕХНИЧЕСКИЕ ХАРАКТЕРИСТИКИ';

function content(id: string): PageContent | undefined {
  return byId.get(id);
}

/**
 * Описательные секции для блока «Описание»: всё, кроме цены (она отдельным
 * элементом интерфейса), агрегатирования (отдельный блок совместимости) и
 * характеристик — но TECH_LABEL прячется только когда она реально показана
 * таблицей в другом месте страницы (см. getTechCharacteristicsTable); если
 * распарсить её в таблицу не удалось и настоящей таблицы у товара нет, секция
 * остаётся здесь текстом — это единственный источник этих данных, и молча
 * терять их нельзя.
 */
export function getDescriptionSections(id: string): ContentSection[] {
  const c = content(id);
  if (!c) return [];
  const techShownElsewhere = getSpecTables(id).length > 0 || getTechCharacteristicsTable(id) !== null;
  return c.sections.filter((s) => {
    if (s.label === PRICE_LABEL || s.label === COMPATIBILITY_LABEL) return false;
    if (s.label === TECH_LABEL && techShownElsewhere) return false;
    return true;
  });
}

/**
 * Текст «АГРЕГАТИРОВАНИЕ» источника — перечень базовых машин по типам техники.
 * Это формулировка источника, а не гарантия совместимости: связи PARTIALLY VERIFIED.
 */
export function getCompatibilityText(id: string): string | null {
  const c = content(id);
  if (!c) return null;
  return c.sections.find((s) => s.label === COMPATIBILITY_LABEL)?.text ?? null;
}

/** Таблицы характеристик страницы в порядке источника. Пусто — блока в UI нет. */
export function getSpecTables(id: string): SpecTable[] {
  return content(id)?.tables ?? [];
}

/**
 * Настоящая таблица характеристик, собранная из текста секции TECH_LABEL — только
 * для товаров, у которых нет ни одной захваченной spec-таблицы (иначе секция —
 * дубль уже показанной таблицы, см. TECH_LABEL выше и getDescriptionSections).
 *
 * Источник у таких товаров уже сам разбивает факты по строкам вида
 * «Метка - значение;» (тот же формат, что priceRawSamples в [product].astro) —
 * разбираем тем же безопасным паттерном. Если хоть одна строка не совпадает с
 * форматом — не собираем таблицу вообще: молча терять часть характеристик хуже,
 * чем оставить их как есть текстом (секция останется видна в getDescriptionSections,
 * потому что TECH_LABEL исключается из фильтра только здесь, при успешной сборке).
 */
export function getTechCharacteristicsTable(id: string): SpecTable | null {
  if (getSpecTables(id).length > 0) return null;

  const c = content(id);
  const section = c?.sections.find((s) => s.label === TECH_LABEL);
  if (!c || !section) return null;

  const lines = section.text.split('\n').map((l) => l.trim()).filter(Boolean);
  const rows: SpecCell[][] = [];
  for (const line of lines) {
    const match = line.match(/^(.*?)\s+[-–—]\s+(.*?);?$/);
    if (!match) return null;
    rows.push([
      { text: match[1].trim(), colspan: 1, rowspan: 1, header: false },
      { text: match[2].trim(), colspan: 1, rowspan: 1, header: false },
    ]);
  }
  if (rows.length === 0) return null;

  return {
    caption: null,
    rows,
    headerRowCount: 0,
    columnCount: 2,
    sourceUrl: c.sourceUrl,
  };
}

/** Есть ли вообще что показать в блоке характеристик. */
export function hasSpecTables(id: string): boolean {
  return getSpecTables(id).length > 0;
}

/** URL страницы источника, с которой снят контент (для провенанса). */
export function getContentSourceUrl(id: string): string | null {
  return content(id)?.sourceUrl ?? null;
}

const tableFingerprint = (t: SpecTable): string =>
  t.rows.map((r) => r.map((c) => c.text.trim()).join('|')).join('//');

/**
 * Таблицы канонической страницы товара, которые не показаны через переключатель
 * вариантов, но реально существуют на её sourceUrl (DR-16).
 *
 * Почему это вообще нужно: у части товаров исходная инвентаризация не создала
 * bucket-страницу под каждый тип техники из Product.machineTypeIds — часть
 * данных живёт только внутри embedded-таблицы на самой канонической странице
 * (см. DR-16 в data/content-inventory.json → dataReviewRequired). Прятать эти
 * данные значит терять их молча; показывать без разбора — риск случайно
 * протащить в UI таблицу, относящуюся к неподтверждённому типу техники (ровно
 * так на странице p-kovsh-universalnyj рядом с таблицей скрытого «Экскаватора»
 * стоит служебная таблица «Стоимость, руб» без привязки к типу в подписи).
 *
 * Поэтому правило нарочно консервативное: таблица показывается, ТОЛЬКО когда её
 * подпись содержит имя ПОДТВЕРЖДЁННОГО типа техники — и никогда содержимым не
 * совпадает с уже показанной таблицей варианта (не дублируем).
 */
export function getUnmatchedSpecTables(productId: string): SpecTable[] {
  const c = content(productId);
  if (!c) return [];

  const shownFingerprints = new Set(
    getAllVariantsUnsafe(productId).flatMap((v) =>
      getSpecTables(v.id).map(tableFingerprint),
    ),
  );

  const confirmedNames = getVisibleMachineTypes().map((mt) => mt.name.toLocaleLowerCase('ru-RU'));
  const norm = (s: string) => s.toLocaleLowerCase('ru-RU').replace(/-/g, ' ');

  return c.tables.filter((t) => {
    if (shownFingerprints.has(tableFingerprint(t))) return false;
    if (!t.caption) return false;
    const caption = norm(t.caption);
    return confirmedNames.some((name) => caption.includes(norm(name)));
  });
}

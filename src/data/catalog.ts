/**
 * Изолированный слой доступа к данным каталога.
 * Страницы и компоненты обращаются ТОЛЬКО к этим функциям — не к JSON напрямую.
 * Замена локального JSON на CMS/API затронет только этот файл (docs/DATA_MODEL.md §10).
 */
import type { Category, MachineType, Product, ProductVariant } from '../types/catalog';

import categoriesFile from '../../data/catalog/categories.json' with { type: 'json' };
import machineTypesFile from '../../data/catalog/machine-types.json' with { type: 'json' };
import productsFile from '../../data/catalog/products.json' with { type: 'json' };
import variantsFile from '../../data/catalog/variants.json' with { type: 'json' };

const allCategories = categoriesFile.categories as Category[];
const allMachineTypes = machineTypesFile.machineTypes as MachineType[];
const allProducts = productsFile.products as Product[];
const allVariants = variantsFile.variants as ProductVariant[];

/** Категории каталога в порядке `order`. */
export function getCategories(): Category[] {
  return [...allCategories].sort((a, b) => a.order - b.order);
}

/**
 * Только подтверждённые типы техники — ЕДИНСТВЕННЫЙ источник для пользовательского UI.
 * Записи confirmed:false (DR-10 «Экскаватор») сюда не попадают: их нет в /machines,
 * в фасете каталога, в блоках совместимости и на главной.
 */
export function getVisibleMachineTypes(): MachineType[] {
  return allMachineTypes
    .filter((mt) => mt.confirmed)
    .sort((a, b) => a.order - b.order);
}

/** Все типы техники, включая скрытые. Только для служебных экранов (/_data-review). */
export function getAllMachineTypesUnsafe(): MachineType[] {
  return [...allMachineTypes].sort((a, b) => a.order - b.order);
}

/** Видимые canonical Product в порядке каталога-источника. */
export function getProducts(): Product[] {
  return allProducts
    .filter((p) => p.visible)
    .sort((a, b) => a.catalogOrder - b.catalogOrder);
}

/** Product по slug (включая скрытые дубли — доступны по прямому URL). */
export function getProduct(slug: string): Product | undefined {
  return allProducts.find((p) => p.slug === slug);
}

/**
 * ВСЕ canonical Product, включая скрытые дубли (сейчас — 50: 49 видимых +
 * `kryukovoj-podves`). Только для генерации маршрутов `getStaticPaths` —
 * скрытый дубль обязан открываться по прямому URL, но нигде не перечисляться.
 * Для листингов используй getProducts().
 */
export function getAllProductsUnsafe(): Product[] {
  return [...allProducts].sort((a, b) => a.catalogOrder - b.catalogOrder);
}

/**
 * Оборудование для витрины на главной.
 * Правило отбора (SITE_STRUCTURE.md §5, PROVISIONAL): первые N по порядку
 * каталога-источника. НЕ «хиты», НЕ «популярное» — таких данных нет.
 */
export function getHomepageProducts(limit = 8): Product[] {
  return getProducts().slice(0, limit);
}

/** Кол-во видимых canonical Product всего. */
export function getProductTotal(): number {
  return getProducts().length;
}

/** Категория по id. */
export function getCategory(id: string | null): Category | undefined {
  if (!id) return undefined;
  return allCategories.find((c) => c.id === id);
}

/** Видимые типы техники товара, в порядке `order`. */
export function getProductMachineTypes(product: Product): MachineType[] {
  const visible = getVisibleMachineTypes();
  return visible.filter((mt) => product.machineTypeIds.includes(mt.id));
}

/** Категория по slug (для маршрута /catalog/category/[category]). */
export function getCategoryBySlug(slug: string): Category | undefined {
  return allCategories.find((c) => c.slug === slug);
}

/** Подтверждённый тип техники по slug. Скрытый тип не имеет slug и сюда не попадает. */
export function getMachineTypeBySlug(slug: string): MachineType | undefined {
  return getVisibleMachineTypes().find((mt) => mt.slug === slug);
}

/** Тип техники по id — включая скрытый. Только для служебной логики, не для UI-списков. */
export function getMachineTypeById(id: string): MachineType | undefined {
  return allMachineTypes.find((mt) => mt.id === id);
}

/** Видимые товары категории, в порядке каталога-источника. */
export function getProductsByCategory(categoryId: string): Product[] {
  return getProducts().filter((p) => p.categoryId === categoryId);
}

/**
 * Видимые товары, агрегатируемые с типом техники (PARTIALLY VERIFIED — связи
 * выведены из блоков «АГРЕГАТИРОВАНИЕ» источника, см. SITE_STRUCTURE.md §4).
 * Для неподтверждённого типа возвращает пустой список: страницы у него нет и
 * витрины быть не должно.
 */
export function getProductsByMachineType(machineTypeId: string): Product[] {
  const mt = getMachineTypeById(machineTypeId);
  if (!mt || !mt.confirmed) return [];
  return getProducts().filter((p) => p.machineTypeIds.includes(machineTypeId));
}

/**
 * Варианты товара для пользовательского UI.
 * Варианты, привязанные к `confirmed:false` типу техники (DR-10 «Экскаватор» —
 * три варианта с реальными ценами), отфильтрованы: они не попадают ни в селектор,
 * ни в цены, ни в счётчики. В данных остаются и вернутся автоматически, как только
 * тип будет подтверждён владельцем.
 */
export function getProductVariants(productId: string): ProductVariant[] {
  const confirmed = new Set(getVisibleMachineTypes().map((mt) => mt.id));
  return allVariants
    .filter((v) => v.productId === productId && confirmed.has(v.machineTypeId))
    .sort((a, b) => a.order - b.order);
}

/** Все варианты товара, включая скрытые. Только для служебных экранов и проверок. */
export function getAllVariantsUnsafe(productId: string): ProductVariant[] {
  return allVariants
    .filter((v) => v.productId === productId)
    .sort((a, b) => a.order - b.order);
}

/**
 * Вариант, предвыбираемый по `?mt=` из журнея B.
 * Если у типа техники несколько вариантов (у «Ковш универсальный» три на
 * мини-экскаватор), берётся первый по порядку источника — самостоятельный выбор
 * «правильного» здесь недопустим, поэтому правило простое и явное.
 */
export function getPreselectedVariant(
  productId: string,
  machineTypeSlug: string | null,
): ProductVariant | undefined {
  const variants = getProductVariants(productId);
  if (variants.length === 0) return undefined;
  if (!machineTypeSlug) return variants[0];
  const mt = getMachineTypeBySlug(machineTypeSlug);
  if (!mt) return variants[0];
  return variants.find((v) => v.machineTypeId === mt.id) ?? variants[0];
}

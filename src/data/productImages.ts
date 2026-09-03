/**
 * Доступ к локальным изображениям продукции (data/catalog/product-images.json).
 * Изображения собраны с публичного st-technics.ru (CDN Tilda) единоразово.
 *
 * В UI используются ТОЛЬКО записи с verificationStatus === "VERIFIED".
 * Карточное и hero-изображение выбраны визуальным просмотром (role "card" /
 * "hero" в манифесте) — здесь НЕТ правила «самое большое изображение».
 */
import file from '../../data/catalog/product-images.json';

export interface ProductImage {
  productId: string | null;
  productSlug: string | null;
  localPath: string | null;
  sourceUrl: string;
  sourcePageUrl: string;
  role: 'card' | 'gallery' | 'hero' | 'hero-candidate' | 'hero-candidate-rejected';
  fit?: 'cover' | 'contain';
  objectPosition?: string;
  width: number | null;
  height: number | null;
  alt?: string;
  verificationStatus: 'VERIFIED' | 'NOT_VERIFIED';
  note?: string;
}

const all = file.images as ProductImage[];

const isUsable = (im: ProductImage): boolean =>
  im.verificationStatus === 'VERIFIED' && !!im.localPath;

/** Карточное изображение товара: строго role "card". Иначе null → заглушка. */
export function getCardImage(productId: string): ProductImage | null {
  return (
    all.find(
      (im) => im.productId === productId && im.role === 'card' && isUsable(im),
    ) ?? null
  );
}

/** Все VERIFIED изображения товара (для будущей галереи на странице товара). */
export function getProductImages(productId: string): ProductImage[] {
  return all.filter(
    (im) =>
      im.productId === productId &&
      (im.role === 'card' || im.role === 'gallery') &&
      isUsable(im),
  );
}

/**
 * Hero-изображение. По решению пользователя Hero сейчас ОТКЛЮЧЁН: ни одна запись
 * не имеет role "hero", поэтому функция возвращает null и Hero показывает
 * нейтральную заглушку. Новый Hero-ассет пользователь выберет отдельно
 * (тогда у нужной записи в манифесте появится role "hero").
 */
export function getHeroImage(): ProductImage | null {
  return all.find((im) => im.role === 'hero' && isUsable(im)) ?? null;
}

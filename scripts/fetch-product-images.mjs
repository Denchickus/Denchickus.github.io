/**
 * fetch-product-images.mjs
 * ------------------------
 * Одноразовый сбор РЕАЛЬНЫХ изображений продукции с публичного st-technics.ru
 * для товаров, показанных в секции Homepage «Оборудование из каталога».
 *
 * Веб-доступ был разрешён пользователем ТОЛЬКО для этой задачи и только к
 * публичным страницам товаров. Простой HTTP через global fetch, без браузера.
 * После выполнения запрет на браузерные инструменты снова действует.
 *
 * Что делает:
 *  1. берёт первые N товаров каталога (правило Homepage не меняется);
 *  2. по canonical sourceUrl каждого качает HTML его страницы;
 *  3. вытаскивает изображения из ЕДИНСТВЕННОГО на странице блока-галереи
 *     Tilda (`t-slds__bgimg[data-original]`) — это фотографии именно этого
 *     товара;
 *  4. сохраняет первые 4 уникальных в public/images/products/<slug>/0N.ext
 *     (повторный запуск не перекачивает уже существующие файлы);
 *  5. карточное изображение выбрано ВИЗУАЛЬНЫМ просмотром (CARD_PICK), НЕ по
 *     разрешению; в манифест пишутся fit и objectPosition для каждого кадра;
 *  6. пишет data/catalog/product-images.json с провенансом и полем role
 *     (card / gallery / hero-candidate / hero-candidate-rejected).
 *
 * Hero: role "hero" присвоен студийному кадру навесного оборудования
 * (kovsh-chelustnoy/03.jpg, ковш на нейтральном фоне, без базовой спецтехники).
 * В UI оформляется как product showcase — object-fit: contain, светлый фон.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'Mozilla/5.0 (st-technics local prototype; one-time asset fetch)';
const PER_PRODUCT = 4;
const ALLOWED_HOSTS = new Set([
  'static.tildacdn.com',
  'optim.tildacdn.com',
  'thb.tildacdn.com',
]);

/**
 * Карточное изображение выбрано ВИЗУАЛЬНЫМ просмотром каждого файла, а НЕ по
 * разрешению/номеру/эвристике. Приоритет: само навесное оборудование хорошо
 * видно и занимает значительную часть кадра; ближе к горизонтали / 4:3; минимум
 * фона; без текста/схем/рендеров/случайных фрагментов.
 *
 * fit  — object-fit для этого кадра:
 *   "contain" (по умолчанию) для оборудования на нейтральном фоне;
 *   "cover"  только если кадр уверенно выдерживает обрезку в 4:3.
 * objectPosition — object-position; обычно "center".
 */
const CARD_PICK = {
  'navesnaya-dorognaya-freza': { file: '02.jpg', fit: 'cover', objectPosition: 'center', why: 'фреза ФРЕЗА 400 крупно по центру, обрезка кабины/грунта безопасна' },
  'povorotnaya-shetka-dorozhnaya': { file: '03.jpg', fit: 'cover', objectPosition: 'center', why: 'LiuGong + щётка, кадр почти 4:3, чистый фон' },
  'bynkernaya-schetka': { file: '01.jpg', fit: 'cover', objectPosition: 'center', why: 'бункерная щётка целиком на погрузчике, кадр ≈4:3' },
  'otvalu': { file: '03.jpg', fit: 'cover', objectPosition: 'center', why: 'LiuGong + отвал с рабочей кромкой, кадр 3:2' },
  'palletnye-vily': { file: '04.jpg', fit: 'cover', objectPosition: 'center', why: 'JCB + вилы-удлинители, кадр 4:3, вилы хорошо читаются' },
  'kovsh-obshchestroitelnyj': { file: '04.jpg', fit: 'cover', objectPosition: 'center', why: 'ковш крупным планом на Bobcat, оборудование занимает большую часть кадра' },
  'kovsh-chelustnoy': { file: '03.jpg', fit: 'contain', objectPosition: 'center', why: 'реальное фото ковша на нейтральном фоне (не 3D-рендер), quadratic -> contain' },
  'kovsh-vysokoobjemniy': { file: '01.jpg', fit: 'contain', objectPosition: 'center', why: 'реальное фото ковша на нейтральном фоне, quadratic -> contain' },
};

/**
 * Hero-изображение выбрано пользователем и подтверждено визуальным просмотром:
 * студийный кадр навесного оборудования (ковш челюстной) на нейтральном фоне,
 * без базовой спецтехники, без текста, целиком в кадре. Оформляется как
 * product showcase: object-fit: contain, светлый фон, без кропа.
 */
const HERO_PICK = {
  productSlug: 'kovsh-chelustnoy',
  file: '03.jpg',
  fit: 'contain',
  objectPosition: 'center',
  alt: 'Ковш челюстной производства СТ-ТЕХНИКС',
};

const { products } = JSON.parse(
  readFileSync(resolve(ROOT, 'data/catalog/products.json'), 'utf8'),
);
const homepageProducts = products
  .filter((p) => p.visible)
  .sort((a, b) => a.catalogOrder - b.catalogOrder)
  .slice(0, 8);

/** Изображения галереи Tilda: <div class="t-slds__bgimg ..." data-original="URL"> */
function extractGalleryImages(html) {
  const re = /t-slds__bgimg[^>]*?\bdata-original="([^"]+)"/g;
  const seen = new Set();
  const out = [];
  let m;
  while ((m = re.exec(html))) {
    const url = m[1];
    if (seen.has(url)) continue; // Tilda клонирует слайды — берём уникальные
    seen.add(url);
    out.push(url);
  }
  return out;
}

/** Размеры из заголовков JPEG/PNG без зависимостей. */
function imageSize(buf) {
  // PNG
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // JPEG: ищем SOF0..SOF3 / SOF5..SOF7 / SOF9..SOF11 / SOF13..SOF15
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) { off++; continue; }
      const marker = buf[off + 1];
      const len = buf.readUInt16BE(off + 2);
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        return {
          height: buf.readUInt16BE(off + 5),
          width: buf.readUInt16BE(off + 7),
        };
      }
      off += 2 + len;
    }
  }
  return { width: null, height: null };
}

const extFromUrl = (url) => {
  const clean = url.split('?')[0].toLowerCase();
  const e = clean.slice(clean.lastIndexOf('.') + 1);
  return e === 'jpeg' ? 'jpg' : e;
};

async function get(url, asBuffer = false) {
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return asBuffer ? Buffer.from(await res.arrayBuffer()) : res.text();
}

const manifest = [];
let downloaded = 0;
let reused = 0;

for (const p of homepageProducts) {
  process.stdout.write(`\n${p.slug}\n`);
  let html;
  try {
    html = await get(p.sourceUrl);
  } catch (e) {
    console.log(`  ! не удалось получить страницу: ${e.message}`);
    continue;
  }

  const gallery = extractGalleryImages(html).filter((u) => {
    try {
      return ALLOWED_HOSTS.has(new URL(u).host);
    } catch {
      return false;
    }
  });

  if (gallery.length === 0) {
    console.log('  ! галерея не найдена — placeholder остаётся');
    continue;
  }

  const dir = resolve(ROOT, 'public/images/products', p.slug);
  mkdirSync(dir, { recursive: true });

  const picks = gallery.slice(0, PER_PRODUCT);
  const rows = [];
  for (let i = 0; i < picks.length; i++) {
    const url = picks[i];
    const ext = extFromUrl(url);
    const file = `${String(i + 1).padStart(2, '0')}.${ext}`;
    const localPath = `/images/products/${p.slug}/${file}`;
    const dest = resolve(dir, file);
    try {
      let buf;
      if (existsSync(dest)) {
        buf = readFileSync(dest); // уже скачано — не трогаем сеть повторно
        reused++;
      } else {
        buf = await get(url, true);
        writeFileSync(dest, buf);
        downloaded++;
      }
      const { width, height } = imageSize(buf);
      console.log(`  ${existsSync(dest) ? '·' : '✓'} ${file}  ${width}x${height}`);
      rows.push({
        productId: p.id,
        productSlug: p.slug,
        localPath,
        sourceUrl: url,
        sourcePageUrl: p.sourceUrl,
        role: 'gallery',
        fit: 'cover',
        objectPosition: 'center',
        width,
        height,
        galleryIndex: i,
        verificationStatus: 'VERIFIED',
      });
    } catch (e) {
      console.log(`  ! ${file}: ${e.message}`);
    }
  }

  // Карточное изображение — по ВИЗУАЛЬНОМУ выбору (CARD_PICK), не по размеру.
  const pick = CARD_PICK[p.slug];
  const cardRow = pick && rows.find((r) => r.localPath.endsWith('/' + pick.file));
  if (cardRow) {
    cardRow.role = 'card';
    cardRow.fit = pick.fit;
    cardRow.objectPosition = pick.objectPosition;
    cardRow.pickReason = pick.why;
    console.log(`  → card: ${cardRow.localPath} (${cardRow.width}x${cardRow.height}) fit=${pick.fit}`);
  } else {
    console.log(`  ! CARD_PICK для ${p.slug} не найден среди скачанных — карточка останется на заглушке`);
  }

  // Hero-изображение (role "hero") — используется в Hero-секции как product showcase.
  if (p.slug === HERO_PICK.productSlug) {
    const heroRow = rows.find((r) => r.localPath.endsWith('/' + HERO_PICK.file));
    if (heroRow) {
      manifest.push({
        productId: heroRow.productId,
        productSlug: heroRow.productSlug,
        localPath: heroRow.localPath,
        sourceUrl: heroRow.sourceUrl,
        sourcePageUrl: heroRow.sourcePageUrl,
        role: 'hero',
        fit: HERO_PICK.fit,
        objectPosition: HERO_PICK.objectPosition,
        width: heroRow.width,
        height: heroRow.height,
        alt: HERO_PICK.alt,
        verificationStatus: 'VERIFIED',
      });
      console.log(`  → hero: ${heroRow.localPath} (${heroRow.width}x${heroRow.height}) fit=${HERO_PICK.fit}`);
    }
  }

  manifest.push(...rows);
}

/* --- og:image главной: тоже только кандидат, NOT_VERIFIED ------------- */
manifest.push({
  productId: null,
  productSlug: null,
  localPath: null,
  sourceUrl: 'https://static.tildacdn.com/tild6563-3035-4162-a333-646264643937/IMG_8507.jpg',
  sourcePageUrl: 'https://st-technics.ru/',
  role: 'hero-candidate-rejected',
  width: null,
  height: null,
  verificationStatus: 'NOT_VERIFIED',
  note:
    'og:image главной страницы. Содержание не подтверждено (не встречается в ' +
    'контентных блоках, имя файла IMG_8507.jpg неинформативно). В UI не используется.',
});

const out = {
  _generatedBy: 'scripts/fetch-product-images.mjs',
  _generatedAt: new Date().toISOString().slice(0, 10),
  _webAccessNote:
    'Веб-доступ к st-technics.ru был разрешён пользователем однократно только ' +
    'для сбора изображений продукции. Все URL — с CDN Tilda самого сайта.',
  _rule: 'В UI использовать только записи с verificationStatus === "VERIFIED".',
  images: manifest,
};
writeFileSync(
  resolve(ROOT, 'data/catalog/product-images.json'),
  JSON.stringify(out, null, 2) + '\n',
);

console.log(
  `\nИтого: скачано ${downloaded}, переиспользовано ${reused}; ` +
    `${manifest.filter((m) => m.verificationStatus === 'VERIFIED').length} VERIFIED записей ` +
    `(card: ${manifest.filter((m) => m.role === 'card').length}, ` +
    `hero: ${manifest.filter((m) => m.role === 'hero').length}).`,
);
console.log('Манифест: data/catalog/product-images.json');

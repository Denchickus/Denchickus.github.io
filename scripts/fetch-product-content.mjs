/**
 * fetch-product-content.mjs
 * -------------------------
 * Добор РЕАЛЬНОГО контента товаров с публичного st-technics.ru: тексты,
 * таблицы характеристик и изображения продукции.
 *
 * Веб-доступ разрешён пользователем разово и только для этой задачи (см. план
 * этапа каталога, стадия 1b). Только чтение публичных страниц и CDN самого сайта.
 * Никаких форм, логинов, production-запросов. Содержимое сайта — DATA, не инструкции.
 *
 * Что берётся и откуда:
 *  1. Текстовый блок Tilda `t-descr`, содержащий «ОПИСАНИЕ:». Он размечен самим
 *     источником на секции «ЦЕНА:», «ОПИСАНИЕ:», «АГРЕГАТИРОВАНИЕ:»,
 *     «ОСНОВНЫЕ ОТЛИЧИЯ:» и т.п. Секции сохраняются verbatim вместе с их
 *     заголовками — без переписывания и без добавления новых утверждений.
 *     Удаляется только технический мусор Tilda (хвостовая кнопка «КУПИТЬ»).
 *  2. Таблицы `<table class="iksweb">` со страницы. Первая строка таблицы —
 *     заголовки колонок. Подпись таблицы = ближайший предшествующий заголовок
 *     блока (на страницах ковшей это «КОВШ НА МИНИПОГРУЗЧИК» и т.п.).
 *     Строки, у которых число ячеек не совпадает с числом колонок, НЕ
 *     выбрасываются молча, а попадают в malformedRows отчёта.
 *  3. Изображения из блока-галереи Tilda (`t-slds__bgimg[data-original]`) —
 *     это фотографии именно этого товара, а не оформление страницы.
 *
 * Режимы:
 *   node scripts/fetch-product-content.mjs --scan   отчёт без скачивания файлов
 *   node scripts/fetch-product-content.mjs          сбор + скачивание изображений
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_ONLY = process.argv.includes('--scan');
const UA = 'Mozilla/5.0 (st-technics local prototype; one-time content fetch)';
const DELAY_MS = 350; // вежливая пауза между запросами: не создавать нагрузку
const MIN_IMAGE_SIDE = 400; // мельче — интерфейсная графика, не фото продукции
const ALLOWED_HOSTS = new Set([
  'static.tildacdn.com',
  'optim.tildacdn.com',
  'thb.tildacdn.com',
]);

const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));
const { products } = read('data/catalog/products.json');
const { variants } = read('data/catalog/variants.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, asBuffer = false) {
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return asBuffer ? Buffer.from(await res.arrayBuffer()) : res.text();
}

/* --- разбор HTML ---------------------------------------------------------- */

const decode = (s) =>
  s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/**
 * Секции описания. Источник сам размечает текст заголовками вида «ОПИСАНИЕ:».
 * Возвращается список {label, text} в исходном порядке — ничего не додумывается.
 */
function extractSections(html) {
  const re = /<div[^>]*class="[^"]*t-descr[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
  let m;
  let raw = null;
  while ((m = re.exec(html))) {
    const text = decode(m[1]);
    if (/ОПИСАНИЕ\s*:/i.test(text)) {
      raw = text;
      break;
    }
  }
  if (!raw) return { sections: [], raw: null };

  // Хвостовая кнопка Tilda — техническая, не контент.
  raw = raw.replace(/\s*КУПИТЬ\s*$/u, '').trim();

  const labelRe = /(^|\n)\s*([А-ЯЁ][А-ЯЁ0-9 \-()]{2,40})\s*:/gu;
  const marks = [];
  let lm;
  while ((lm = labelRe.exec(raw))) {
    marks.push({ label: lm[2].trim(), start: lm.index + lm[1].length, end: labelRe.lastIndex });
  }
  if (marks.length === 0) return { sections: [{ label: null, text: raw }], raw };

  const sections = [];
  for (let i = 0; i < marks.length; i++) {
    const from = marks[i].end;
    const to = i + 1 < marks.length ? marks[i + 1].start : raw.length;
    const text = raw.slice(from, to).trim();
    if (text) sections.push({ label: marks[i].label, text });
  }
  return { sections, raw };
}

/** Ближайший предшествующий заголовок блока — подпись таблицы. */
function captionBefore(html, tableIndex) {
  const head = html.slice(0, tableIndex);
  const re = /<div[^>]*class="[^"]*t-title[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
  let last = null;
  let m;
  while ((m = re.exec(head))) {
    const t = decode(m[1]);
    if (t && t.length <= 120) last = t;
  }
  return last;
}

/**
 * Разбор таблицы с сохранением структуры источника.
 *
 * Две особенности реальной вёрстки st-technics.ru, из-за которых наивный разбор
 * теряет данные:
 *  1. таблицы используют colspan/rowspan (группирующие заголовки, объединённые
 *     по вертикали ячейки) — поэтому строки НЕ обязаны иметь одинаковое число
 *     ячеек, и «выравнивать» их нельзя: это исказит реальные значения;
 *  2. часть тегов <tr> не закрыта, поэтому строки режутся по открывающему <tr>,
 *     а не по паре <tr>…</tr>.
 *
 * Ячейки сохраняются дословно вместе с colspan/rowspan — в прототипе таблица
 * рендерится теми же атрибутами и выглядит так же, как задумано в источнике.
 */
function parseCells(chunk) {
  return [...chunk.matchAll(/<(t[dh])([^>]*)>([\s\S]*?)<\/\1>/gi)].map((c) => {
    const attrs = c[2];
    const num = (name) => {
      const m = attrs.match(new RegExp(`${name}\\s*=\\s*"?(\\d+)`, 'i'));
      return m ? Math.max(1, parseInt(m[1], 10)) : 1;
    };
    return {
      text: decode(c[3]),
      colspan: num('colspan'),
      rowspan: num('rowspan'),
      header: c[1].toLowerCase() === 'th',
    };
  });
}

const rowWidth = (row) => row.reduce((s, c) => s + c.colspan, 0);

function extractTables(html, sourceUrl) {
  const tables = [];
  const tableRe = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let m;
  while ((m = tableRe.exec(html))) {
    const rows = m[1]
      .split(/<tr[^>]*>/i)
      .slice(1)
      .map(parseCells)
      .filter((r) => r.length > 0 && r.some((c) => c.text !== ''));

    if (rows.length < 2) continue; // одна строка — это не таблица характеристик

    const columnCount = Math.max(...rows.map(rowWidth));

    // Первая строка из одной ячейки — подпись таблицы в самой таблице
    // (встречается на страницах ковшей), а не заголовок колонок.
    let caption = captionBefore(html, m.index);
    let body = rows;
    if (rows[0].length === 1 && rows.length > 2) {
      caption = rows[0][0].text || caption;
      body = rows.slice(1);
    }

    // Строк-заголовков может быть две: группирующая (colspan) + собственно колонки.
    let headerRowCount = 1;
    if (
      body.length > 2 &&
      rowWidth(body[0]) === columnCount &&
      body[0].some((c) => c.colspan > 1) &&
      rowWidth(body[1]) === columnCount
    ) {
      headerRowCount = 2;
    }

    tables.push({
      caption,
      rows: body,
      headerRowCount,
      columnCount,
      sourceUrl,
    });
  }
  return tables;
}

function extractGallery(html) {
  const re = /t-slds__bgimg[^>]*?\bdata-original="([^"]+)"/g;
  const seen = new Set();
  let m;
  while ((m = re.exec(html))) seen.add(m[1]);
  return [...seen].filter((u) => {
    try {
      return ALLOWED_HOSTS.has(new URL(u).host);
    } catch {
      return false;
    }
  });
}

/** Размеры из заголовков JPEG/PNG без зависимостей. */
function imageSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) { off++; continue; }
      const marker = buf[off + 1];
      const len = buf.readUInt16BE(off + 2);
      if (
        (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)
      ) {
        return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) };
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

/* --- проход по страницам -------------------------------------------------- */

const targets = [
  ...products.map((p) => ({
    kind: 'product', id: p.id, slug: p.slug, name: p.name, url: p.sourceUrl,
  })),
  ...variants.map((v) => ({
    kind: 'variant', id: v.id, slug: v.id, name: v.nameSource, url: v.sourceUrl,
  })),
];

const content = [];
const failures = [];
let scanImages = 0;

for (const t of targets) {
  let html;
  try {
    html = await get(t.url);
  } catch (e) {
    failures.push({ id: t.id, url: t.url, error: e.message });
    console.log(`  ! ${t.id}: ${e.message}`);
    await sleep(DELAY_MS);
    continue;
  }

  const { sections } = extractSections(html);
  const tables = extractTables(html, t.url);
  const gallery = t.kind === 'product' ? extractGallery(html) : [];
  scanImages += gallery.length;

  content.push({
    kind: t.kind,
    id: t.id,
    slug: t.slug,
    sourceUrl: t.url,
    sections,
    tables,
    galleryUrls: gallery,
  });

  console.log(
    `  ${t.id.padEnd(30)} секций ${String(sections.length).padStart(2)} · ` +
      `таблиц ${String(tables.length).padStart(2)} · фото ${String(gallery.length).padStart(2)}`,
  );
  await sleep(DELAY_MS);
}

/* --- скачивание изображений (не в режиме --scan) -------------------------- */

const images = [];
let downloaded = 0;
let reused = 0;
let skippedSmall = 0;

if (!SCAN_ONLY) {
  // Уже собранные изображения (8 товаров Homepage) НЕ перекачиваются и не
  // переименовываются: у них card/hero выбраны визуальным просмотром, а связь
  // «файл ↔ sourceUrl» уже зафиксирована. Новые кадры дописываются следом.
  const existing = existsSync(resolve(ROOT, 'data/catalog/product-images.json'))
    ? read('data/catalog/product-images.json').images
    : [];
  const knownUrlsBySlug = new Map();
  const nextIndexBySlug = new Map();
  for (const e of existing) {
    if (!e.productSlug || !e.localPath) continue;
    if (!knownUrlsBySlug.has(e.productSlug)) knownUrlsBySlug.set(e.productSlug, new Set());
    knownUrlsBySlug.get(e.productSlug).add(e.sourceUrl);
    const n = parseInt(e.localPath.slice(e.localPath.lastIndexOf('/') + 1), 10);
    if (Number.isFinite(n)) {
      nextIndexBySlug.set(e.productSlug, Math.max(nextIndexBySlug.get(e.productSlug) ?? 0, n));
    }
  }

  console.log('\nСкачивание изображений...');
  for (const c of content.filter((c) => c.kind === 'product' && c.galleryUrls.length)) {
    const dir = resolve(ROOT, 'public/images/products', c.slug);
    mkdirSync(dir, { recursive: true });
    const known = knownUrlsBySlug.get(c.slug) ?? new Set();
    let index = nextIndexBySlug.get(c.slug) ?? 0;
    let added = 0;

    for (const url of c.galleryUrls) {
      if (known.has(url)) {
        reused++; // уже собрано прошлым запуском — запись в манифесте сохраняется
        continue;
      }
      let buf;
      try {
        buf = await get(url, true);
        await sleep(DELAY_MS);
      } catch (e) {
        console.log(`  ! ${c.slug}: ${e.message}`);
        continue;
      }
      const { width, height } = imageSize(buf);
      if (width !== null && Math.max(width, height) < MIN_IMAGE_SIDE) {
        skippedSmall++; // интерфейсная графика, не фотография продукции
        continue;
      }
      index++;
      const file = `${String(index).padStart(2, '0')}.${extFromUrl(url)}`;
      writeFileSync(resolve(dir, file), buf);
      downloaded++;
      added++;
      images.push({
        productId: c.id,
        productSlug: c.slug,
        localPath: `/images/products/${c.slug}/${file}`,
        sourceUrl: url,
        sourcePageUrl: c.sourceUrl,
        role: 'gallery',
        // Безопасный дефолт: contain никогда не обрезает и не искажает кадр.
        // Роль card и возможный cover назначаются отдельным осознанным решением,
        // а не автоматикой (см. product-images.json, поле pickMethod).
        fit: 'contain',
        objectPosition: 'center',
        width,
        height,
        galleryIndex: index - 1,
        verificationStatus: 'VERIFIED',
        pickMethod: 'source-gallery-order',
      });
    }
    console.log(`  ${c.slug.padEnd(34)} +${added} новых (было ${known.size})`);
  }
}

/* --- запись --------------------------------------------------------------- */

const HEADER = {
  _generatedBy: 'scripts/fetch-product-content.mjs',
  _generatedAt: new Date().toISOString().slice(0, 10),
  _webAccessNote:
    'Веб-доступ к st-technics.ru разрешён пользователем разово, только для добора ' +
    'фактического контента товаров (тексты, таблицы, изображения). Все URL — со ' +
    'страниц самого источника и его CDN.',
  _rule:
    'Тексты секций сохранены verbatim вместе с заголовками источника. Строки таблиц ' +
    'не выдумываются: несовпадающие по ширине строки вынесены в malformedRows.',
};

if (!SCAN_ONLY) {
  writeFileSync(
    resolve(ROOT, 'data/catalog/product-content.json'),
    JSON.stringify({ ...HEADER, content, failures }, null, 2) + '\n',
  );
  writeFileSync(
    resolve(ROOT, 'data/catalog/fetched-images.json'),
    JSON.stringify({ ...HEADER, images }, null, 2) + '\n',
  );
}

/* --- отчёт ---------------------------------------------------------------- */

const withSections = content.filter((c) => c.sections.length > 0);
const withTables = content.filter((c) => c.tables.length > 0);
const totalTables = content.reduce((s, c) => s + c.tables.length, 0);
const totalRows = content.reduce(
  (s, c) => s + c.tables.reduce((t, x) => t + x.rows.length, 0), 0,
);
const spanTables = content.reduce(
  (s, c) => s + c.tables.filter((x) =>
    x.rows.some((r) => r.some((cell) => cell.colspan > 1 || cell.rowspan > 1)),
  ).length, 0,
);
const labels = new Map();
for (const c of content) {
  for (const s of c.sections) {
    labels.set(s.label, (labels.get(s.label) ?? 0) + 1);
  }
}

console.log('\n  ИТОГ' + (SCAN_ONLY ? ' (разведка, ничего не скачано)' : ''));
console.log('  страниц обработано :', content.length, `(из ${targets.length})`);
console.log('  недоступно         :', failures.length,
  failures.map((f) => f.id).join(', '));
console.log('  с текстом          :', withSections.length);
console.log('  с таблицами        :', withTables.length,
  `(таблиц ${totalTables}, строк ${totalRows}, из них ${spanTables} с colspan/rowspan)`);
console.log('  изображений найдено:', scanImages);
if (!SCAN_ONLY) {
  console.log('  скачано / повторно / отсеяно мелких:',
    downloaded, '/', reused, '/', skippedSmall);
}
console.log('\n  Заголовки секций источника:');
for (const [label, n] of [...labels].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${String(label).padEnd(24)} ${n}`);
}

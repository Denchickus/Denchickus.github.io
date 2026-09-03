/**
 * check-links.mjs
 * ---------------
 * Статическая проверка внутренних ссылок в собранном dist/ (браузерные
 * инструменты в проекте не используются).
 *
 * На этапе foundation построена только главная. Ссылки на ещё не реализованные
 * маршруты (каталог, типы техники, инфо-страницы, товары) — ОЖИДАЕМЫ и
 * сверяются с планом из docs/SITE_STRUCTURE.md. Такая ссылка -> статус PLANNED.
 * Любая другая несуществующая внутренняя ссылка -> BROKEN (ненулевой exit).
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');
const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));

if (!existsSync(DIST)) {
  console.error('dist/ не найден — сначала `npm run build`.');
  process.exit(1);
}

const { products } = read('data/catalog/products.json');
const { categories } = read('data/catalog/categories.json');
const { machineTypes } = read('data/catalog/machine-types.json');

/**
 * Маршруты, запланированные, но ещё не реализованные (SITE_STRUCTURE.md §1).
 *
 * ВАЖНО: пока маршрут числится здесь, ссылка на несуществующую страницу
 * засчитывается как «по плану» и проверка остаётся зелёной. Поэтому список
 * сокращается по мере реализации — иначе он превращается в глушитель ошибок.
 */
const PLANNED = new Set([
  '/oplata-i-dostavka',
  '/contacts',
]);

/**
 * Обратная проверка: каждый реализованный маршрут обязан реально присутствовать
 * в dist/. Проверка ссылок сама по себе этого не ловит — если страница не
 * сгенерировалась и ссылок на неё нет, отчёт останется зелёным при пропавшем
 * разделе каталога.
 *
 * Товарных маршрутов — 50, а не 49: видимые товары + скрытый дубль
 * (kryukovoj-podves, DR-01), доступный только по прямому URL — решение №10.
 */
const EXPECTED_ROUTES = [
  '/',
  '/catalog',
  '/machines',
  ...categories.map((c) => `/catalog/category/${c.slug}`),
  ...products.map((p) => `/catalog/${p.slug}`),
  ...machineTypes.filter((m) => m.confirmed).map((m) => `/machines/${m.slug}`),
];

/* --- собрать список построенных страниц -------------------------------- */
const htmlFiles = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (name.endsWith('.html')) htmlFiles.push(full);
  }
})(DIST);

const builtRoutes = new Set(['/']);
for (const f of htmlFiles) {
  let r = f.slice(DIST.length).replace(/\\/g, '/');
  r = r.replace(/index\.html$/, '').replace(/\.html$/, '');
  if (r !== '/' && r.endsWith('/')) r = r.slice(0, -1);
  builtRoutes.add(r || '/');
}

/* --- извлечь внутренние ссылки --------------------------------------- */
const results = { ok: [], planned: [], external: [], broken: [] };
const linkRe = /(?:href|src)="([^"]+)"/g;

for (const f of htmlFiles) {
  const html = readFileSync(f, 'utf8');
  const page = f.slice(DIST.length).replace(/\\/g, '/');
  let m;
  while ((m = linkRe.exec(html))) {
    const raw = m[1];
    if (/^(https?:|mailto:|tel:|data:|#)/.test(raw)) {
      if (/^https?:/.test(raw)) results.external.push({ page, raw });
      continue;
    }
    const path = raw.split('#')[0].split('?')[0].replace(/\/$/, '') || '/';
    if (path.startsWith('/_astro/') || /\.(css|js|svg|png|jpe?g|webp|ico|woff2?|webmanifest)$/.test(path)) {
      if (existsSync(join(DIST, path))) results.ok.push({ page, raw });
      else results.broken.push({ page, raw, why: 'asset отсутствует' });
      continue;
    }
    if (builtRoutes.has(path)) results.ok.push({ page, raw });
    else if (PLANNED.has(path)) results.planned.push({ page, raw });
    else results.broken.push({ page, raw, why: 'маршрут не построен и не запланирован' });
  }
}

/* --- отчёт --------------------------------------------------------- */
const uniq = (a) => [...new Set(a.map((x) => x.raw))].sort();
console.log('\n  ПРОВЕРКА ВНУТРЕННИХ ССЫЛОК (dist/)\n  ' + '-'.repeat(48));
console.log(`  Построено страниц : ${htmlFiles.length}`);
console.log(`  OK (существуют)   : ${results.ok.length}`);
console.log(`  PLANNED (по плану): ${results.planned.length}  ->`, uniq(results.planned).join(', ') || '—');
console.log(`  Внешние ссылки    : ${results.external.length}  ->`, uniq(results.external).join(', ') || '—');
console.log(`  BROKEN            : ${results.broken.length}`);
for (const b of results.broken) console.log(`    ✗ ${b.page}  ->  ${b.raw}  (${b.why})`);

const missingRoutes = EXPECTED_ROUTES.filter((r) => !builtRoutes.has(r));
console.log(`  Ожидаемых маршрутов: ${EXPECTED_ROUTES.length}, не построено: ${missingRoutes.length}`);
for (const r of missingRoutes) console.log(`    ✗ не сгенерирован: ${r}`);
console.log('  ' + '-'.repeat(48));

if (missingRoutes.length) {
  console.error(`  РЕЗУЛЬТАТ: FAIL (не построено маршрутов: ${missingRoutes.length})\n`);
  process.exit(1);
}
if (results.broken.length) {
  console.error('  РЕЗУЛЬТАТ: FAIL\n');
  process.exit(1);
}
console.log('  РЕЗУЛЬТАТ: PASS (битых внутренних ссылок нет)\n');

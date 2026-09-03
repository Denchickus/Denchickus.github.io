// @ts-check
import { defineConfig } from 'astro/config';

// Прототип СТ-ТЕХНИКС: полностью статическая сборка, без адаптеров и SSR.
// Слой данных читается из локального JSON на этапе сборки (src/data/*).
export default defineConfig({
  output: 'static',
  site: 'https://example.invalid', // PLACEHOLDER: домен прототипа не определён
  trailingSlash: 'ignore',
  build: {
    format: 'directory',
  },
  devToolbar: {
    enabled: false,
  },
});

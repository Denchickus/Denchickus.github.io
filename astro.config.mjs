// @ts-check
import { defineConfig } from 'astro/config';

// Прототип СТ-ТЕХНИКС: полностью статическая сборка, без адаптеров и SSR.
// Слой данных читается из локального JSON на этапе сборки (src/data/*).
export default defineConfig({
  output: 'static',
  site: 'https://denchickus.github.io', // GitHub Pages, корень домена (User Pages repo)
  trailingSlash: 'ignore',
  build: {
    format: 'directory',
  },
  devToolbar: {
    enabled: false,
  },
});

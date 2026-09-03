---
paths:
  - "src/**/*"
  - "app/**/*"
  - "pages/**/*"
  - "components/**/*"
  - "tests/**/*"
  - "e2e/**/*"
  - "package.json"
---

# Testing

Никогда не утверждай, что проверка пройдена, если она реально не запускалась.

Перед тестированием изучи:

* package.json;
* lockfile;
* существующие scripts.

Если доступны, запускай:

* lint;
* typecheck;
* tests;
* production build.

Для UI одной сборки недостаточно.

После реализации web-интерфейса:

1. запусти приложение;
2. открой страницу в браузере;
3. проверь desktop;
4. проверь mobile;
5. navigation;
6. links;
7. images;
8. overflow;
9. forms;
10. browser console;
11. runtime errors.

Если доступен Playwright/Puppeteer/browser automation — используй.

Если browser verification невозможно:

NOT VERIFIED: browser

При исправлении:

FIX
→ RETEST

Для catalog data проверяй:

* duplicate IDs;
* duplicate slugs;
* missing required fields;
* invalid category relations;
* invalid machine type relations;
* broken product relations.

В отчёте:

CHECK — PASS / FAIL / NOT VERIFIED

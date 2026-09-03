---
paths:
  - "data/**/*"
  - "content/**/*"
  - "src/data/**/*"
  - "src/content/**/*"
---

# Catalog Data

Каталог должен быть структурированными данными.

Один товар = один canonical Product.

Product может иметь:

Product → Category
Product → one or more MachineTypes

Не дублируй Product из-за нескольких типов техники.

Сохраняй:

* sourceUrl;
* source image URLs;
* dataReviewRequired.

Если данных нет:

null
[]
UNKNOWN

в зависимости от структуры.

Не допускай:

* duplicate IDs;
* duplicate slugs;
* потерянные товары;
* invalid category refs;
* invalid machine type refs.

/** Русское склонение существительных по числу. */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

export const pluralPozitsiya = (n: number): string =>
  plural(n, 'позиция', 'позиции', 'позиций');

export const pluralTip = (n: number): string =>
  plural(n, 'тип', 'типа', 'типов');

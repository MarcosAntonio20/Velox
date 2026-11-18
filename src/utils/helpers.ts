/**
 * VELOX — Utilitários genéricos de texto e objetos.
 */

/** Remove acentos, converte para minúsculas e apara espaços (útil em buscas). */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Converte um texto em slug de URL (ex.: "Mouse Gamer V1" -> "mouse-gamer-v1"). */
export function slugify(value: string): string {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Retorna uma cópia do objeto sem as propriedades com valor `undefined`. */
export function removeUndefined<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

export function classNames(
  ...classes: Array<string | boolean | undefined | null>
): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * VELOX — Helper de persistência em localStorage.
 *
 * Lê e grava JSON com "seed" automático: quando a chave ainda não existe (ou
 * está corrompida), o valor inicial é gerado a partir dos dados de mockData,
 * gravado no storage e devolvido.
 *
 * Se o localStorage estiver indisponível (modo privado restrito, SSR etc.), os
 * dados passam a viver apenas em memória, mantendo a aplicação funcional.
 */

export const STORAGE_PREFIX = 'velox:';

/**
 * Versão do formato dos dados persistidos. Ao alterar o mockData ou o formato
 * das entidades, incremente este valor para descartar dados antigos do navegador.
 */
const STORAGE_VERSION = '1';
const STORAGE_VERSION_KEY = `${STORAGE_PREFIX}storageVersion`;

export const STORAGE_KEYS = {
  products: `${STORAGE_PREFIX}products`,
  categories: `${STORAGE_PREFIX}categories`,
  banners: `${STORAGE_PREFIX}banners`,
  coupons: `${STORAGE_PREFIX}coupons`,
  reviews: `${STORAGE_PREFIX}reviews`,
  orders: `${STORAGE_PREFIX}orders`,
  users: `${STORAGE_PREFIX}users`,
  addresses: `${STORAGE_PREFIX}addresses`,
  credentials: `${STORAGE_PREFIX}credentials`,
  session: `${STORAGE_PREFIX}session`,
  cart: `${STORAGE_PREFIX}cart`,
  cartCoupon: `${STORAGE_PREFIX}cartCoupon`,
} as const;

/* --------------------------------------------------------------------------
   Acesso de baixo nível (localStorage com fallback em memória)
   -------------------------------------------------------------------------- */

const memoryStorage = new Map<string, string>();

function detectLocalStorage(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return false;
    }

    const probeKey = `${STORAGE_PREFIX}probe`;
    window.localStorage.setItem(probeKey, '1');
    window.localStorage.removeItem(probeKey);
    return true;
  } catch {
    return false;
  }
}

const hasLocalStorage = detectLocalStorage();

function rawGetItem(key: string): string | null {
  if (!hasLocalStorage) {
    return memoryStorage.get(key) ?? null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function rawSetItem(key: string, value: string): void {
  if (!hasLocalStorage) {
    memoryStorage.set(key, value);
    return;
  }

  try {
    window.localStorage.setItem(key, value);
  } catch {
    throw new Error(
      'Não foi possível salvar os dados no navegador (armazenamento cheio ou bloqueado).',
    );
  }
}

function rawRemoveItem(key: string): void {
  if (!hasLocalStorage) {
    memoryStorage.delete(key);
    return;
  }

  try {
    window.localStorage.removeItem(key);
  } catch {
    throw new Error('Não foi possível remover os dados do navegador.');
  }
}

function rawKeys(): string[] {
  if (!hasLocalStorage) {
    return Array.from(memoryStorage.keys());
  }

  const keys: string[] = [];

  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);

      if (key !== null) {
        keys.push(key);
      }
    }
  } catch {
    return keys;
  }

  return keys;
}

/* --------------------------------------------------------------------------
   API pública
   -------------------------------------------------------------------------- */

/** Cria uma cópia profunda de um valor serializável em JSON. */
export function cloneData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Lê um valor JSON do storage. Se a chave não existir (ou estiver corrompida),
 * executa `seed`, grava o resultado e o devolve.
 */
export function readStorage<T>(key: string, seed: () => T): T {
  const raw = rawGetItem(key);

  if (raw !== null) {
    try {
      return JSON.parse(raw) as T;
    } catch {
      // JSON corrompido: ignora o valor salvo e recria a partir do seed.
    }
  }

  const seeded = cloneData(seed());
  writeStorage(key, seeded);
  return seeded;
}

/** Grava um valor como JSON no storage. */
export function writeStorage<T>(key: string, value: T): void {
  rawSetItem(key, JSON.stringify(value));
}

/** Remove uma chave do storage. */
export function removeStorage(key: string): void {
  rawRemoveItem(key);
}

/** Remove todas as chaves da aplicação (prefixo "velox:") do storage. */
export function clearAppStorage(): void {
  rawKeys()
    .filter((key) => key.startsWith(STORAGE_PREFIX))
    .forEach((key) => rawRemoveItem(key));
}

/** Gera o próximo id numérico de uma coleção (equivalente a AUTO_INCREMENT). */
export function generateNextId<T extends { id: number }>(items: T[]): number {
  return items.reduce((highest, item) => Math.max(highest, item.id), 0) + 1;
}

/* --------------------------------------------------------------------------
   Controle de versão do storage
   -------------------------------------------------------------------------- */

function ensureStorageVersion(): void {
  if (rawGetItem(STORAGE_VERSION_KEY) === STORAGE_VERSION) {
    return;
  }

  clearAppStorage();
  rawSetItem(STORAGE_VERSION_KEY, STORAGE_VERSION);
}

ensureStorageVersion();

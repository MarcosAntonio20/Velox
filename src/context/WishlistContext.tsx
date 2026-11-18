/**
 * VELOX — Contexto da lista de desejos.
 *
 * Guarda os ids dos produtos favoritados, persistidos no localStorage por
 * usuário (visitantes usam a lista "guest"). Ao fazer login, a lista de
 * visitante é mesclada na lista do usuário. O WishlistProvider deve ficar
 * dentro do AuthProvider.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { STORAGE_PREFIX, readStorage, writeStorage } from '../services/storage';
import { useAuth } from './AuthContext';

const GUEST_OWNER_KEY = 'guest';

const getWishlistStorageKey = (ownerKey: string): string =>
  `${STORAGE_PREFIX}wishlist:${ownerKey}`;

const readWishlist = (ownerKey: string): number[] =>
  readStorage<number[]>(getWishlistStorageKey(ownerKey), () => []);

/** Carrega a lista do dono e, se for um usuário logado, mescla a lista de visitante nela. */
function loadWishlistForOwner(ownerKey: string): number[] {
  const ownList = readWishlist(ownerKey);

  if (ownerKey === GUEST_OWNER_KEY) {
    return ownList;
  }

  const guestList = readWishlist(GUEST_OWNER_KEY);

  if (guestList.length === 0) {
    return ownList;
  }

  const merged = Array.from(new Set([...ownList, ...guestList]));
  writeStorage(getWishlistStorageKey(ownerKey), merged);
  writeStorage(getWishlistStorageKey(GUEST_OWNER_KEY), []);
  return merged;
}

interface WishlistState {
  ownerKey: string;
  productIds: number[];
}

export interface WishlistContextValue {
  /** Ids dos produtos favoritados, na ordem em que foram adicionados. */
  productIds: number[];
  totalItems: number;
  isInWishlist: (productId: number) => boolean;
  addToWishlist: (productId: number) => void;
  removeFromWishlist: (productId: number) => void;
  /** Adiciona se não estiver na lista; remove se já estiver. */
  toggleWishlist: (productId: number) => void;
  clearWishlist: () => void;
}

const WishlistContext = createContext<WishlistContextValue | undefined>(undefined);

interface WishlistProviderProps {
  children: ReactNode;
}

export function WishlistProvider({ children }: WishlistProviderProps) {
  const { user, isLoading } = useAuth();
  const ownerKey = user ? String(user.id) : GUEST_OWNER_KEY;

  const [state, setState] = useState<WishlistState>(() => ({
    ownerKey: GUEST_OWNER_KEY,
    productIds: readWishlist(GUEST_OWNER_KEY),
  }));

  // Chave do dono da lista atualmente exibida (usada ao gravar no storage).
  const activeOwnerKeyRef = useRef<string>(state.ownerKey);

  // Quando a sessão termina de carregar (ou o usuário muda), troca para a lista do novo dono.
  if (!isLoading && state.ownerKey !== ownerKey) {
    activeOwnerKeyRef.current = ownerKey;
    setState({ ownerKey, productIds: loadWishlistForOwner(ownerKey) });
  }

  const { productIds } = state;

  const persist = useCallback((nextProductIds: number[]): void => {
    setState((previous) => ({ ...previous, productIds: nextProductIds }));
    writeStorage(getWishlistStorageKey(activeOwnerKeyRef.current), nextProductIds);
  }, []);

  const isInWishlist = useCallback(
    (productId: number): boolean => productIds.includes(productId),
    [productIds],
  );

  const addToWishlist = useCallback(
    (productId: number): void => {
      if (!productIds.includes(productId)) {
        persist([...productIds, productId]);
      }
    },
    [productIds, persist],
  );

  const removeFromWishlist = useCallback(
    (productId: number): void => {
      if (productIds.includes(productId)) {
        persist(productIds.filter((id) => id !== productId));
      }
    },
    [productIds, persist],
  );

  const toggleWishlist = useCallback(
    (productId: number): void => {
      if (productIds.includes(productId)) {
        persist(productIds.filter((id) => id !== productId));
      } else {
        persist([...productIds, productId]);
      }
    },
    [productIds, persist],
  );

  const clearWishlist = useCallback((): void => {
    persist([]);
  }, [persist]);

  const value = useMemo<WishlistContextValue>(
    () => ({
      productIds,
      totalItems: productIds.length,
      isInWishlist,
      addToWishlist,
      removeFromWishlist,
      toggleWishlist,
      clearWishlist,
    }),
    [productIds, isInWishlist, addToWishlist, removeFromWishlist, toggleWishlist, clearWishlist],
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist(): WishlistContextValue {
  const context = useContext(WishlistContext);

  if (!context) {
    throw new Error('useWishlist deve ser usado dentro de um WishlistProvider.');
  }

  return context;
}

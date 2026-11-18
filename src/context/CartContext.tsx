/**
 * VELOX — Contexto do carrinho.
 *
 * Estado global do carrinho persistido no localStorage. O cupom aplicado
 * também é persistido. O CartProvider deve ficar dentro do AuthProvider.
 *
 * Observações:
 * - `subtotal` e `total` NÃO incluem frete (calculado no checkout a partir do
 *   endereço). Cupons do tipo "frete" só têm efeito no checkout.
 * - A validação final de estoque e cupom acontece no orderService.createOrder.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { validateCoupon } from '../services/productService';
import { STORAGE_KEYS, generateNextId, readStorage, writeStorage } from '../services/storage';
import type { CartItem, Coupon, Product } from '../types';
import { calculateCouponDiscount, roundCurrency } from '../utils/pricing';
import { useAuth } from './AuthContext';

/** Quantidade máxima de uma mesma unidade no carrinho. */
const MAX_QUANTITY_PER_ITEM = 99;

/** userId usado em CartItem enquanto não há usuário logado. */
const GUEST_USER_ID = 0;

export interface CartContextValue {
  items: CartItem[];
  /** Soma das quantidades de todos os itens. */
  totalItems: number;
  /** Soma de preço x quantidade dos itens (sem desconto e sem frete). */
  subtotal: number;
  /** Cupom aplicado (null se não houver ou se o carrinho estiver vazio). */
  coupon: Coupon | null;
  /** Desconto do cupom sobre os produtos (cupons de frete resultam em 0 aqui). */
  discountAmount: number;
  /** subtotal - discountAmount (sem frete). */
  total: number;
  /** Retorna false se o produto estiver inativo, sem estoque ou com quantidade inválida. */
  addToCart: (product: Product, quantity?: number) => boolean;
  removeFromCart: (productId: number) => void;
  /** Define a quantidade; valores menores que 1 removem o item. */
  updateQuantity: (productId: number, quantity: number) => void;
  clearCart: () => void;
  /** Valida e aplica o cupom. Lança Error com o motivo caso seja recusado. */
  applyCoupon: (code: string) => Promise<Coupon>;
  removeCoupon: () => void;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

interface CartProviderProps {
  children: ReactNode;
}

export function CartProvider({ children }: CartProviderProps) {
  const { user } = useAuth();
  const currentUserId = user ? user.id : GUEST_USER_ID;

  const [storedItems, setStoredItems] = useState<CartItem[]>(() =>
    readStorage<CartItem[]>(STORAGE_KEYS.cart, () => []),
  );
  const [storedCoupon, setStoredCoupon] = useState<Coupon | null>(() =>
    readStorage<Coupon | null>(STORAGE_KEYS.cartCoupon, () => null),
  );

  // Os itens sempre refletem o usuário atual (visitante = 0; ao logar, passam a ser dele).
  const items = useMemo<CartItem[]>(
    () =>
      storedItems.map((item) =>
        item.userId === currentUserId ? item : { ...item, userId: currentUserId },
      ),
    [storedItems, currentUserId],
  );

  useEffect(() => {
    writeStorage(STORAGE_KEYS.cart, items);
  }, [items]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.cartCoupon, storedCoupon);
  }, [storedCoupon]);

  const totalItems = useMemo(
    () => items.reduce((total, item) => total + item.quantity, 0),
    [items],
  );

  const subtotal = useMemo(
    () => roundCurrency(items.reduce((total, item) => total + item.unitPrice * item.quantity, 0)),
    [items],
  );

  const coupon = items.length > 0 ? storedCoupon : null;

  const discountAmount = useMemo(
    () => calculateCouponDiscount(coupon, subtotal, 0),
    [coupon, subtotal],
  );

  const total = roundCurrency(subtotal - discountAmount);

  const addToCart = useCallback(
    (product: Product, quantity = 1): boolean => {
      const amount = Math.floor(quantity);
      const maxQuantity = Math.min(product.stock, MAX_QUANTITY_PER_ITEM);

      if (!product.isActive || maxQuantity <= 0 || amount < 1) {
        return false;
      }

      setStoredItems((previous) => {
        const existing = previous.find((item) => item.productId === product.id);

        if (existing) {
          return previous.map((item) =>
            item.productId === product.id
              ? {
                  ...item,
                  quantity: Math.min(item.quantity + amount, maxQuantity),
                  unitPrice: product.price,
                }
              : item,
          );
        }

        return [
          ...previous,
          {
            id: generateNextId(previous),
            userId: currentUserId,
            productId: product.id,
            quantity: Math.min(amount, maxQuantity),
            unitPrice: product.price,
            addedAt: new Date().toISOString(),
          },
        ];
      });

      return true;
    },
    [currentUserId],
  );

  const removeFromCart = useCallback((productId: number): void => {
    setStoredItems((previous) => previous.filter((item) => item.productId !== productId));
  }, []);

  const updateQuantity = useCallback((productId: number, quantity: number): void => {
    const amount = Math.floor(quantity);

    setStoredItems((previous) => {
      if (!Number.isFinite(amount) || amount < 1) {
        return previous.filter((item) => item.productId !== productId);
      }

      return previous.map((item) =>
        item.productId === productId
          ? { ...item, quantity: Math.min(amount, MAX_QUANTITY_PER_ITEM) }
          : item,
      );
    });
  }, []);

  const clearCart = useCallback((): void => {
    setStoredItems([]);
    setStoredCoupon(null);
  }, []);

  const applyCoupon = useCallback(
    async (code: string): Promise<Coupon> => {
      const validCoupon = await validateCoupon(code, {
        subtotal,
        userId: user ? user.id : null,
      });

      setStoredCoupon(validCoupon);
      return validCoupon;
    },
    [subtotal, user],
  );

  const removeCoupon = useCallback((): void => {
    setStoredCoupon(null);
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      totalItems,
      subtotal,
      coupon,
      discountAmount,
      total,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      applyCoupon,
      removeCoupon,
    }),
    [
      items,
      totalItems,
      subtotal,
      coupon,
      discountAmount,
      total,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      applyCoupon,
      removeCoupon,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error('useCart deve ser usado dentro de um CartProvider.');
  }

  return context;
}

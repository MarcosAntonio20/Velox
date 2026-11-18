/**
 * VELOX — Utilitários de preço.
 *
 * Funções puras (síncronas) usadas tanto pelos serviços quanto pelos contextos,
 * garantindo que carrinho, checkout e pedido calculem os valores da mesma forma.
 */

import type { Coupon } from '../types';

export interface OrderTotals {
  subtotal: number;
  shippingCost: number;
  discountAmount: number;
  total: number;
}

/** Arredonda um valor monetário para 2 casas decimais. */
export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Formata um valor em reais (ex.: "R$ 149,90"). */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

/**
 * Calcula o desconto de um cupom.
 *
 * - `percentage`: porcentagem sobre o subtotal dos produtos.
 * - `fixed`: valor fixo abatido do subtotal.
 * - `shipping`: porcentagem sobre o valor do frete.
 *
 * Retorna 0 quando não há cupom ou quando o pedido mínimo não é atingido.
 * O desconto nunca ultrapassa a base sobre a qual é aplicado.
 */
export function calculateCouponDiscount(
  coupon: Coupon | null,
  subtotal: number,
  shippingCost = 0,
): number {
  if (!coupon || subtotal < coupon.minOrderValue) {
    return 0;
  }

  let discount = 0;
  let maxDiscount = subtotal;

  switch (coupon.discountType) {
    case 'percentage':
      discount = subtotal * (coupon.discountValue / 100);
      maxDiscount = subtotal;
      break;
    case 'fixed':
      discount = coupon.discountValue;
      maxDiscount = subtotal;
      break;
    case 'shipping':
      discount = shippingCost * (coupon.discountValue / 100);
      maxDiscount = shippingCost;
      break;
  }

  return roundCurrency(Math.min(discount, maxDiscount));
}

/** Calcula os totais de um pedido: total = subtotal + frete - desconto. */
export function calculateOrderTotals(
  subtotal: number,
  shippingCost: number,
  coupon: Coupon | null,
): OrderTotals {
  const roundedSubtotal = roundCurrency(subtotal);
  const roundedShippingCost = roundCurrency(shippingCost);
  const discountAmount = calculateCouponDiscount(coupon, roundedSubtotal, roundedShippingCost);

  return {
    subtotal: roundedSubtotal,
    shippingCost: roundedShippingCost,
    discountAmount,
    total: roundCurrency(roundedSubtotal + roundedShippingCost - discountAmount),
  };
}

export const formatPrice = formatCurrency;

export function calculateDiscountPercentage(
  priceA: number,
  priceB?: number | null
): number {
  if (!priceB || priceA <= 0 || priceB <= 0 || priceA === priceB) {
    return 0;
  }

  const original = Math.max(priceA, priceB);
  const current = Math.min(priceA, priceB);

  return Math.round(((original - current) / original) * 100);
}

export function formatInstallments(
  price: number,
  installments = 12
): string {
  const installmentValue = price / installments;
  return `ou ${installments}x de ${formatCurrency(installmentValue)} sem juros`;
}
/**
 * VELOX — Serviço de pedidos.
 *
 * Criação do pedido no checkout, listagem do usuário, listagem geral (admin) e
 * atualização de status.
 *
 * Todos os métodos retornam Promise<T> e persistem no localStorage. Ao integrar
 * o back-end Node.js + MySQL, troque o corpo das funções por `fetch()`.
 *
 * O pedido é sempre recalculado a partir dos dados atuais de produtos, endereço
 * e cupom (preços, frete e desconto nunca vêm do cliente), como o back-end fará.
 */

import { orders as seedOrders } from '../data/mockData';
import type { Order, OrderItem, OrderStatus, PaymentMethod } from '../types';
import { normalizeText } from '../utils/helpers';
import { calculateOrderTotals } from '../utils/pricing';
import { getAddressById } from './authService';
import {
  adjustProductStock,
  decrementCouponUsage,
  getProductById,
  incrementCouponUsage,
  validateCoupon,
} from './productService';
import { STORAGE_KEYS, generateNextId, readStorage, writeStorage } from './storage';

/* ==========================================================================
   Tipos
   ========================================================================== */

export interface CreateOrderItemInput {
  productId: number;
  quantity: number;
}

export interface CreateOrderInput {
  userId: number;
  addressId: number;
  paymentMethod: PaymentMethod;
  items: CreateOrderItemInput[];
  couponCode?: string | null;
}

export interface OrderQuery {
  status?: OrderStatus;
  userId?: number;
  /** Busca por número do pedido (com ou sem "#") ou código de rastreio. */
  search?: string;
  /** Data inicial (ISO 8601), inclusiva. */
  dateFrom?: string;
  /** Data final (ISO 8601), inclusiva. */
  dateTo?: string;
}

export interface UpdateOrderStatusOptions {
  trackingCode?: string | null;
}

/* ==========================================================================
   Regras de negócio
   ========================================================================== */

/** Próximos status permitidos a partir de cada status (estados finais não mudam). */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  'Em processamento': ['Pagamento aprovado', 'Preparando', 'Enviado', 'Entregue', 'Cancelado'],
  'Pagamento aprovado': ['Preparando', 'Enviado', 'Entregue', 'Cancelado'],
  Preparando: ['Enviado', 'Entregue', 'Cancelado'],
  Enviado: ['Entregue'],
  Entregue: [],
  Cancelado: [],
};

/** Status em que o próprio cliente ainda pode cancelar o pedido. */
const CUSTOMER_CANCELABLE_STATUSES: OrderStatus[] = ['Em processamento', 'Pagamento aprovado'];

/** Frete por UF (mock). Estados não listados usam o valor padrão. */
const SHIPPING_COST_BY_STATE: Record<string, number> = {
  SP: 19.9,
  RJ: 24.9,
  MG: 24.9,
  ES: 24.9,
  PR: 29.9,
  SC: 29.9,
  RS: 29.9,
  DF: 39.9,
  GO: 39.9,
  MT: 39.9,
  MS: 39.9,
};

const DEFAULT_SHIPPING_COST = 49.9;

/* ==========================================================================
   Funções internas
   ========================================================================== */

const loadOrders = (): Order[] => readStorage<Order[]>(STORAGE_KEYS.orders, () => seedOrders);
const saveOrders = (value: Order[]): void => writeStorage(STORAGE_KEYS.orders, value);

const formatOrderNumber = (id: number): string => `#${String(id).padStart(6, '0')}`;

const generateTrackingCode = (orderId: number): string =>
  `VLX${String(orderId).padStart(8, '0')}BR`;

function sortByNewest(orders: Order[]): Order[] {
  return orders.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() || b.id - a.id,
  );
}

/** Aplica a mudança de status, restaurando estoque e cupom quando o pedido é cancelado. */
async function applyStatusChange(
  orderId: number,
  status: OrderStatus,
  trackingCode?: string | null,
): Promise<Order> {
  const orders = loadOrders();
  const index = orders.findIndex((order) => order.id === orderId);

  if (index === -1) {
    throw new Error('Pedido não encontrado.');
  }

  const current = orders[index];

  if (current.status === status) {
    return current;
  }

  if (!ORDER_STATUS_TRANSITIONS[current.status].includes(status)) {
    throw new Error(`Não é possível alterar o pedido de "${current.status}" para "${status}".`);
  }

  let nextTrackingCode = current.trackingCode;

  if (trackingCode && trackingCode.trim()) {
    nextTrackingCode = trackingCode.trim();
  }

  if ((status === 'Enviado' || status === 'Entregue') && !nextTrackingCode) {
    nextTrackingCode = generateTrackingCode(current.id);
  }

  if (status === 'Cancelado') {
    for (const item of current.items) {
      try {
        await adjustProductStock(item.productId, item.quantity);
      } catch {
        // Produto removido do catálogo: não há estoque a restaurar.
      }
    }

    if (current.couponId !== null) {
      try {
        await decrementCouponUsage(current.couponId);
      } catch {
        // Cupom removido: não há uso a liberar.
      }
    }
  }

  const updated: Order = {
    ...current,
    status,
    trackingCode: nextTrackingCode,
    updatedAt: new Date().toISOString(),
  };

  const latestOrders = loadOrders();
  const latestIndex = latestOrders.findIndex((order) => order.id === orderId);
  latestOrders[latestIndex] = updated;
  saveOrders(latestOrders);

  return updated;
}

/* ==========================================================================
   Frete
   ========================================================================== */

/** Calcula o frete (antes de descontos) a partir da UF do endereço de entrega. */
export async function calculateShippingCost(state: string): Promise<number> {
  return SHIPPING_COST_BY_STATE[state.trim().toUpperCase()] ?? DEFAULT_SHIPPING_COST;
}

/* ==========================================================================
   Checkout
   ========================================================================== */

/**
 * Cria um pedido a partir do carrinho: valida endereço, produtos, estoque e
 * cupom, calcula os totais, baixa o estoque e registra o uso do cupom.
 */
export async function createOrder(input: CreateOrderInput): Promise<Order> {
  if (input.items.length === 0) {
    throw new Error('O carrinho está vazio.');
  }

  const address = await getAddressById(input.addressId);

  if (!address || address.userId !== input.userId) {
    throw new Error('Selecione um endereço de entrega válido.');
  }

  // Une linhas repetidas do mesmo produto e valida as quantidades.
  const quantities = new Map<number, number>();

  for (const item of input.items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new Error('A quantidade de cada produto deve ser um número inteiro maior que zero.');
    }

    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
  }

  const lines: Array<{ productId: number; productName: string; quantity: number; unitPrice: number }> =
    [];

  for (const [productId, quantity] of quantities) {
    const product = await getProductById(productId);

    if (!product) {
      throw new Error('Um dos produtos do carrinho não está mais disponível.');
    }

    if (product.stock < quantity) {
      throw new Error(
        product.stock === 0
          ? `"${product.name}" está sem estoque.`
          : `Estoque insuficiente para "${product.name}". Disponível: ${product.stock}.`,
      );
    }

    lines.push({
      productId: product.id,
      productName: product.name,
      quantity,
      unitPrice: product.price,
    });
  }

  const rawSubtotal = lines.reduce((total, line) => total + line.unitPrice * line.quantity, 0);
  const shippingCost = await calculateShippingCost(address.state);
  const coupon = input.couponCode
    ? await validateCoupon(input.couponCode, { subtotal: rawSubtotal, userId: input.userId })
    : null;
  const totals = calculateOrderTotals(rawSubtotal, shippingCost, coupon);

  const appliedAdjustments: Array<{ productId: number; quantity: number }> = [];
  let couponUsageRegistered = false;

  try {
    for (const line of lines) {
      await adjustProductStock(line.productId, -line.quantity);
      appliedAdjustments.push({ productId: line.productId, quantity: line.quantity });
    }

    if (coupon) {
      await incrementCouponUsage(coupon.id);
      couponUsageRegistered = true;
    }

    const orders = loadOrders();
    const orderId = generateNextId(orders);
    const firstItemId = generateNextId(orders.flatMap((order) => order.items));
    const now = new Date().toISOString();

    const items: OrderItem[] = lines.map((line, position) => ({
      id: firstItemId + position,
      orderId,
      productId: line.productId,
      productName: line.productName,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      subtotal: Math.round(line.unitPrice * line.quantity * 100) / 100,
    }));

    const order: Order = {
      id: orderId,
      orderNumber: formatOrderNumber(orderId),
      userId: input.userId,
      addressId: address.id,
      couponId: coupon ? coupon.id : null,
      status: 'Em processamento',
      paymentMethod: input.paymentMethod,
      subtotal: totals.subtotal,
      shippingCost: totals.shippingCost,
      discountAmount: totals.discountAmount,
      total: totals.total,
      trackingCode: null,
      items,
      createdAt: now,
      updatedAt: now,
    };

    saveOrders([...orders, order]);
    return order;
  } catch (error) {
    // Desfaz estoque e cupom caso algo falhe no meio do processo.
    for (const adjustment of appliedAdjustments) {
      await adjustProductStock(adjustment.productId, adjustment.quantity);
    }

    if (coupon && couponUsageRegistered) {
      await decrementCouponUsage(coupon.id);
    }

    throw error;
  }
}

/* ==========================================================================
   Consultas
   ========================================================================== */

/** Pedidos de um usuário, do mais recente para o mais antigo. */
export async function getOrdersByUser(userId: number): Promise<Order[]> {
  return sortByNewest(loadOrders().filter((order) => order.userId === userId));
}

/** Todos os pedidos (admin), com filtros opcionais. */
export async function getAllOrders(query: OrderQuery = {}): Promise<Order[]> {
  const { status, userId, search, dateFrom, dateTo } = query;
  const normalizedSearch = search ? normalizeText(search).replace('#', '') : '';
  const fromTime = dateFrom ? new Date(dateFrom).getTime() : null;
  const toTime = dateTo ? new Date(dateTo).getTime() : null;

  return sortByNewest(
    loadOrders().filter((order) => {
      if (status && order.status !== status) {
        return false;
      }

      if (userId !== undefined && order.userId !== userId) {
        return false;
      }

      const createdTime = new Date(order.createdAt).getTime();

      if (fromTime !== null && createdTime < fromTime) {
        return false;
      }

      if (toTime !== null && createdTime > toTime) {
        return false;
      }

      if (normalizedSearch) {
        const haystack = normalizeText(`${order.orderNumber} ${order.trackingCode ?? ''}`).replace(
          '#',
          '',
        );

        return haystack.includes(normalizedSearch);
      }

      return true;
    }),
  );
}

/** Busca um pedido. Se `userId` for informado, o pedido precisa pertencer a ele. */
export async function getOrderById(orderId: number, userId?: number): Promise<Order | null> {
  const order = loadOrders().find((item) => item.id === orderId);

  if (!order || (userId !== undefined && order.userId !== userId)) {
    return null;
  }

  return order;
}

/* ==========================================================================
   Atualização de status
   ========================================================================== */

/** Atualiza o status do pedido (admin). Ao enviar/entregar sem código, gera o rastreio. */
export async function updateOrderStatus(
  orderId: number,
  status: OrderStatus,
  options: UpdateOrderStatusOptions = {},
): Promise<Order> {
  return applyStatusChange(orderId, status, options.trackingCode);
}

/** Cancelamento pelo cliente: permitido apenas antes de o pedido entrar em preparação. */
export async function cancelOrder(orderId: number, userId: number): Promise<Order> {
  const order = loadOrders().find((item) => item.id === orderId);

  if (!order || order.userId !== userId) {
    throw new Error('Pedido não encontrado.');
  }

  if (!CUSTOMER_CANCELABLE_STATUSES.includes(order.status)) {
    throw new Error(
      'Este pedido não pode mais ser cancelado. Entre em contato com o suporte VELOX.',
    );
  }

  return applyStatusChange(orderId, 'Cancelado');
}

/**
 * VELOX — Tipos e entidades do domínio.
 *
 * Todas as interfaces seguem camelCase e estão estruturadas como entidades
 * relacionais (chaves primárias `id` e chaves estrangeiras `xxxId`), prontas
 * para o mapeamento futuro em tabelas MySQL via back-end Node.js.
 *
 * Convenções:
 * - `id` é um número inteiro (AUTO_INCREMENT no MySQL).
 * - Datas trafegam como string ISO 8601 (ex.: "2026-11-17T14:30:00.000Z").
 * - Valores monetários são números em reais (ex.: 149.9).
 */

/** Data/hora em formato ISO 8601. */
export type IsoDateString = string;

/* ==========================================================================
   Usuários
   ========================================================================== */

export type UserRole = 'customer' | 'admin';

/** Tabela: users */
export interface User {
  id: number;
  name: string;
  email: string;
  cpf: string;
  phone: string;
  birthDate: IsoDateString;
  role: UserRole;
  isActive: boolean;
  createdAt: IsoDateString;
}

/** Tabela: user_addresses (N:1 com users) */
export interface UserAddress {
  id: number;
  userId: number;
  label: string;
  recipientName: string;
  zipCode: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  isDefault: boolean;
}

/* ==========================================================================
   Catálogo
   ========================================================================== */

/** Tabela: categories */
export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string;
  imageUrl: string;
  isActive: boolean;
}

/** Atributo técnico livre (ex.: { label: 'Taxa de atualização', value: '144 Hz' }). */
export interface ProductSpecAttribute {
  label: string;
  value: string;
}

/** Tabela: product_specs (1:1 com products) */
export interface ProductSpecs {
  id: number;
  productId: number;
  brand: string;
  model: string;
  color: string;
  weightKg: number;
  dimensions: string;
  connectionType: string;
  warrantyMonths: number;
  highlights: string[];
  attributes: ProductSpecAttribute[];
}

/** Tabela: products (N:1 com categories, 1:1 com product_specs) */
export interface Product {
  id: number;
  categoryId: number;
  name: string;
  slug: string;
  sku: string;
  shortDescription: string;
  description: string;
  price: number;
  oldPrice: number | null;
  stock: number;
  imageUrl: string;
  gallery: string[];
  rating: number;
  reviewCount: number;
  isFeatured: boolean;
  isActive: boolean;
  specs: ProductSpecs;
  createdAt: IsoDateString;
}

/* ==========================================================================
   Carrinho
   ========================================================================== */

/** Tabela: cart_items (N:1 com users, N:1 com products) */
export interface CartItem {
  id: number;
  userId: number;
  productId: number;
  quantity: number;
  unitPrice: number;
  addedAt: IsoDateString;
}

/* ==========================================================================
   Pedidos
   ========================================================================== */

export type OrderStatus =
  | 'Em processamento'
  | 'Pagamento aprovado'
  | 'Preparando'
  | 'Enviado'
  | 'Entregue'
  | 'Cancelado';

export type PaymentMethod = 'Pix' | 'Cartão de crédito' | 'Boleto';

/** Tabela: order_items (N:1 com orders, N:1 com products) */
export interface OrderItem {
  id: number;
  orderId: number;
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

/**
 * Tabela: orders (N:1 com users, N:1 com user_addresses, N:1 opcional com coupons)
 *
 * Regra de cálculo: total = subtotal + shippingCost - discountAmount
 */
export interface Order {
  id: number;
  orderNumber: string;
  userId: number;
  addressId: number;
  couponId: number | null;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  subtotal: number;
  shippingCost: number;
  discountAmount: number;
  total: number;
  trackingCode: string | null;
  items: OrderItem[];
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

/* ==========================================================================
   Marketing
   ========================================================================== */

export type CouponDiscountType = 'percentage' | 'fixed' | 'shipping';

/**
 * Tabela: coupons
 *
 * - `percentage`: discountValue é a porcentagem aplicada sobre o subtotal.
 * - `fixed`: discountValue é um valor em reais abatido do subtotal.
 * - `shipping`: discountValue é a porcentagem aplicada sobre o frete.
 */
export interface Coupon {
  id: number;
  code: string;
  description: string;
  discountType: CouponDiscountType;
  discountValue: number;
  minOrderValue: number;
  maxUses: number;
  usedCount: number;
  isFirstPurchaseOnly: boolean;
  isActive: boolean;
  expiresAt: IsoDateString;
  createdAt: IsoDateString;
}

export type BannerPosition = 'hero' | 'secondary';

/** Tabela: banners */
export interface Banner {
  id: number;
  title: string;
  subtitle: string;
  imageUrl: string;
  linkUrl: string;
  buttonLabel: string;
  position: BannerPosition;
  displayOrder: number;
  isActive: boolean;
}

/* ==========================================================================
   Avaliações
   ========================================================================== */

/** Tabela: reviews (N:1 com products, N:1 com users) */
export interface Review {
  id: number;
  productId: number;
  userId: number;
  rating: number;
  title: string;
  comment: string;
  isVerifiedPurchase: boolean;
  createdAt: IsoDateString;
}

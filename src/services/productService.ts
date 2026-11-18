/**
 * VELOX — Serviço de catálogo.
 *
 * CRUD de produtos, categorias, banners, cupons e avaliações (loja e admin).
 *
 * Todos os métodos retornam Promise<T> e persistem no localStorage. Quando o
 * back-end Node.js + MySQL existir, basta trocar o corpo de cada função por um
 * `fetch()` mantendo as mesmas assinaturas.
 */

import {
  banners as seedBanners,
  categories as seedCategories,
  coupons as seedCoupons,
  orders as seedOrders,
  products as seedProducts,
  reviews as seedReviews,
} from '../data/mockData';
import type {
  Banner,
  BannerPosition,
  Category,
  Coupon,
  Order,
  Product,
  ProductSpecs,
  Review,
} from '../types';
import { normalizeText, removeUndefined, slugify } from '../utils/helpers';
import { formatCurrency } from '../utils/pricing';
import { STORAGE_KEYS, generateNextId, readStorage, writeStorage } from './storage';

/* ==========================================================================
   Tipos de entrada / consulta
   ========================================================================== */

export type ProductSpecsInput = Omit<ProductSpecs, 'id' | 'productId'>;

export type ProductInput = Omit<
  Product,
  'id' | 'slug' | 'rating' | 'reviewCount' | 'createdAt' | 'specs'
> & {
  slug?: string;
  specs: ProductSpecsInput;
};

export type ProductUpdateInput = Partial<Omit<ProductInput, 'specs'>> & {
  specs?: Partial<ProductSpecsInput>;
};

export type ProductSortOption =
  | 'featured'
  | 'newest'
  | 'priceAsc'
  | 'priceDesc'
  | 'rating'
  | 'name';

export interface ProductQuery {
  categoryId?: number;
  search?: string;
  featuredOnly?: boolean;
  includeInactive?: boolean;
  sortBy?: ProductSortOption;
}

export type CategoryInput = Omit<Category, 'id' | 'slug'> & { slug?: string };

export type BannerInput = Omit<Banner, 'id'>;

export interface BannerQuery {
  position?: BannerPosition;
  includeInactive?: boolean;
}

export type CouponInput = Omit<Coupon, 'id' | 'usedCount' | 'createdAt'>;

export interface CouponValidationContext {
  subtotal: number;
  userId?: number | null;
}

export type ReviewInput = Pick<Review, 'productId' | 'userId' | 'rating' | 'title' | 'comment'>;

export type ReviewUpdateInput = Partial<Pick<Review, 'rating' | 'title' | 'comment'>>;

/* ==========================================================================
   Acesso ao storage (seed automático a partir do mockData)
   ========================================================================== */

const loadProducts = (): Product[] =>
  readStorage<Product[]>(STORAGE_KEYS.products, () => seedProducts);
const saveProducts = (value: Product[]): void => writeStorage(STORAGE_KEYS.products, value);

const loadCategories = (): Category[] =>
  readStorage<Category[]>(STORAGE_KEYS.categories, () => seedCategories);
const saveCategories = (value: Category[]): void => writeStorage(STORAGE_KEYS.categories, value);

const loadBanners = (): Banner[] => readStorage<Banner[]>(STORAGE_KEYS.banners, () => seedBanners);
const saveBanners = (value: Banner[]): void => writeStorage(STORAGE_KEYS.banners, value);

const loadCoupons = (): Coupon[] => readStorage<Coupon[]>(STORAGE_KEYS.coupons, () => seedCoupons);
const saveCoupons = (value: Coupon[]): void => writeStorage(STORAGE_KEYS.coupons, value);

const loadReviews = (): Review[] => readStorage<Review[]>(STORAGE_KEYS.reviews, () => seedReviews);
const saveReviews = (value: Review[]): void => writeStorage(STORAGE_KEYS.reviews, value);

const loadOrders = (): Order[] => readStorage<Order[]>(STORAGE_KEYS.orders, () => seedOrders);

/* ==========================================================================
   Produtos
   ========================================================================== */

function assertValidProductValues(price: number, oldPrice: number | null, stock: number): void {
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('O preço do produto deve ser maior que zero.');
  }

  if (oldPrice !== null && (!Number.isFinite(oldPrice) || oldPrice <= price)) {
    throw new Error('O preço antigo deve ser maior que o preço atual.');
  }

  if (!Number.isInteger(stock) || stock < 0) {
    throw new Error('O estoque deve ser um número inteiro maior ou igual a zero.');
  }
}

function compareProducts(sortBy: ProductSortOption): (a: Product, b: Product) => number {
  switch (sortBy) {
    case 'newest':
      return (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    case 'priceAsc':
      return (a, b) => a.price - b.price;
    case 'priceDesc':
      return (a, b) => b.price - a.price;
    case 'rating':
      return (a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount;
    case 'name':
      return (a, b) => a.name.localeCompare(b.name, 'pt-BR');
    case 'featured':
    default:
      return (a, b) =>
        Number(b.isFeatured) - Number(a.isFeatured) || b.rating - a.rating || a.id - b.id;
  }
}

/** Lista produtos. Na loja, apenas ativos (e de categorias ativas); no admin, use `includeInactive`. */
export async function getProducts(query: ProductQuery = {}): Promise<Product[]> {
  const { categoryId, search, featuredOnly = false, includeInactive = false, sortBy = 'featured' } =
    query;

  const activeCategoryIds = new Set(
    loadCategories()
      .filter((category) => category.isActive)
      .map((category) => category.id),
  );
  const normalizedSearch = search ? normalizeText(search) : '';

  return loadProducts()
    .filter((product) => {
      if (!includeInactive && (!product.isActive || !activeCategoryIds.has(product.categoryId))) {
        return false;
      }

      if (categoryId !== undefined && product.categoryId !== categoryId) {
        return false;
      }

      if (featuredOnly && !product.isFeatured) {
        return false;
      }

      if (normalizedSearch) {
        const haystack = normalizeText(
          [
            product.name,
            product.shortDescription,
            product.sku,
            product.specs.brand,
            product.specs.model,
          ].join(' '),
        );

        return haystack.includes(normalizedSearch);
      }

      return true;
    })
    .sort(compareProducts(sortBy));
}

export async function getProductById(
  id: number,
  includeInactive = false,
): Promise<Product | null> {
  const product = loadProducts().find((item) => item.id === id);

  if (!product || (!includeInactive && !product.isActive)) {
    return null;
  }

  return product;
}

export async function getProductBySlug(
  slug: string,
  includeInactive = false,
): Promise<Product | null> {
  const product = loadProducts().find((item) => item.slug === slug);

  if (!product || (!includeInactive && !product.isActive)) {
    return null;
  }

  return product;
}

/** Produtos ativos da mesma categoria (exceto o próprio), para "Você também pode gostar". */
export async function getRelatedProducts(productId: number, limit = 4): Promise<Product[]> {
  const products = loadProducts();
  const current = products.find((item) => item.id === productId);

  if (!current) {
    return [];
  }

  return products
    .filter((item) => item.categoryId === current.categoryId && item.id !== current.id && item.isActive)
    .sort(compareProducts('featured'))
    .slice(0, limit);
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const products = loadProducts();

  if (!input.name.trim()) {
    throw new Error('Informe o nome do produto.');
  }

  if (!loadCategories().some((category) => category.id === input.categoryId)) {
    throw new Error('Categoria não encontrada.');
  }

  assertValidProductValues(input.price, input.oldPrice, input.stock);

  const slug = slugify(input.slug && input.slug.trim() ? input.slug : input.name);

  if (!slug) {
    throw new Error('Não foi possível gerar o slug do produto.');
  }

  if (products.some((product) => product.slug === slug)) {
    throw new Error('Já existe um produto com este slug.');
  }

  if (products.some((product) => product.sku.toLowerCase() === input.sku.trim().toLowerCase())) {
    throw new Error('Já existe um produto com este SKU.');
  }

  const id = generateNextId(products);
  const specsId = generateNextId(products.map((product) => product.specs));

  const product: Product = {
    ...input,
    id,
    slug,
    name: input.name.trim(),
    sku: input.sku.trim(),
    rating: 0,
    reviewCount: 0,
    specs: { ...input.specs, id: specsId, productId: id },
    createdAt: new Date().toISOString(),
  };

  saveProducts([...products, product]);
  return product;
}

export async function updateProduct(id: number, input: ProductUpdateInput): Promise<Product> {
  const products = loadProducts();
  const index = products.findIndex((product) => product.id === id);

  if (index === -1) {
    throw new Error('Produto não encontrado.');
  }

  const current = products[index];
  const { specs: specsInput, ...fieldsInput } = input;
  const fields = removeUndefined(fieldsInput);
  const specsChanges = specsInput ? removeUndefined(specsInput) : {};

  const updated: Product = {
    ...current,
    ...fields,
    id: current.id,
    rating: current.rating,
    reviewCount: current.reviewCount,
    createdAt: current.createdAt,
    specs: { ...current.specs, ...specsChanges, id: current.specs.id, productId: current.id },
  };

  if (!updated.name.trim()) {
    throw new Error('Informe o nome do produto.');
  }

  if (fields.categoryId !== undefined && !loadCategories().some((c) => c.id === updated.categoryId)) {
    throw new Error('Categoria não encontrada.');
  }

  assertValidProductValues(updated.price, updated.oldPrice, updated.stock);

  if (fields.slug !== undefined) {
    updated.slug = slugify(fields.slug);

    if (!updated.slug) {
      throw new Error('Slug inválido.');
    }
  }

  if (products.some((product) => product.id !== id && product.slug === updated.slug)) {
    throw new Error('Já existe um produto com este slug.');
  }

  if (
    products.some(
      (product) => product.id !== id && product.sku.toLowerCase() === updated.sku.trim().toLowerCase(),
    )
  ) {
    throw new Error('Já existe um produto com este SKU.');
  }

  products[index] = updated;
  saveProducts(products);
  return updated;
}

/** Exclui o produto e, em cascata, as avaliações dele (como um ON DELETE CASCADE). */
export async function deleteProduct(id: number): Promise<void> {
  const products = loadProducts();

  if (!products.some((product) => product.id === id)) {
    throw new Error('Produto não encontrado.');
  }

  saveProducts(products.filter((product) => product.id !== id));
  saveReviews(loadReviews().filter((review) => review.productId !== id));
}

/** Soma `delta` ao estoque (negativo para baixar). Falha se o estoque ficar negativo. */
export async function adjustProductStock(productId: number, delta: number): Promise<Product> {
  const products = loadProducts();
  const index = products.findIndex((product) => product.id === productId);

  if (index === -1) {
    throw new Error('Produto não encontrado.');
  }

  const nextStock = products[index].stock + delta;

  if (nextStock < 0) {
    throw new Error(`Estoque insuficiente para "${products[index].name}".`);
  }

  products[index] = { ...products[index], stock: nextStock };
  saveProducts(products);
  return products[index];
}

/* ==========================================================================
   Categorias
   ========================================================================== */

export async function getCategories(includeInactive = false): Promise<Category[]> {
  return loadCategories()
    .filter((category) => includeInactive || category.isActive)
    .sort((a, b) => a.id - b.id);
}

export async function getCategoryById(id: number): Promise<Category | null> {
  return loadCategories().find((category) => category.id === id) ?? null;
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  return loadCategories().find((category) => category.slug === slug) ?? null;
}

export async function createCategory(input: CategoryInput): Promise<Category> {
  const categories = loadCategories();

  if (!input.name.trim()) {
    throw new Error('Informe o nome da categoria.');
  }

  const slug = slugify(input.slug && input.slug.trim() ? input.slug : input.name);

  if (!slug) {
    throw new Error('Não foi possível gerar o slug da categoria.');
  }

  if (categories.some((category) => category.slug === slug)) {
    throw new Error('Já existe uma categoria com este slug.');
  }

  const category: Category = {
    ...input,
    id: generateNextId(categories),
    name: input.name.trim(),
    slug,
  };

  saveCategories([...categories, category]);
  return category;
}

export async function updateCategory(
  id: number,
  input: Partial<CategoryInput>,
): Promise<Category> {
  const categories = loadCategories();
  const index = categories.findIndex((category) => category.id === id);

  if (index === -1) {
    throw new Error('Categoria não encontrada.');
  }

  const fields = removeUndefined(input);
  const updated: Category = { ...categories[index], ...fields, id };

  if (!updated.name.trim()) {
    throw new Error('Informe o nome da categoria.');
  }

  if (fields.slug !== undefined) {
    updated.slug = slugify(fields.slug);
  }

  if (!updated.slug) {
    throw new Error('Slug inválido.');
  }

  if (categories.some((category) => category.id !== id && category.slug === updated.slug)) {
    throw new Error('Já existe uma categoria com este slug.');
  }

  categories[index] = updated;
  saveCategories(categories);
  return updated;
}

/** Bloqueia a exclusão enquanto houver produtos na categoria (como um ON DELETE RESTRICT). */
export async function deleteCategory(id: number): Promise<void> {
  const categories = loadCategories();

  if (!categories.some((category) => category.id === id)) {
    throw new Error('Categoria não encontrada.');
  }

  if (loadProducts().some((product) => product.categoryId === id)) {
    throw new Error('Esta categoria possui produtos. Mova ou exclua os produtos antes de removê-la.');
  }

  saveCategories(categories.filter((category) => category.id !== id));
}

/* ==========================================================================
   Banners
   ========================================================================== */

export async function getBanners(query: BannerQuery = {}): Promise<Banner[]> {
  const { position, includeInactive = false } = query;

  return loadBanners()
    .filter((banner) => (includeInactive || banner.isActive) && (!position || banner.position === position))
    .sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id);
}

export async function getBannerById(id: number): Promise<Banner | null> {
  return loadBanners().find((banner) => banner.id === id) ?? null;
}

export async function createBanner(input: BannerInput): Promise<Banner> {
  const banners = loadBanners();

  if (!input.title.trim()) {
    throw new Error('Informe o título do banner.');
  }

  const banner: Banner = { ...input, id: generateNextId(banners), title: input.title.trim() };

  saveBanners([...banners, banner]);
  return banner;
}

export async function updateBanner(id: number, input: Partial<BannerInput>): Promise<Banner> {
  const banners = loadBanners();
  const index = banners.findIndex((banner) => banner.id === id);

  if (index === -1) {
    throw new Error('Banner não encontrado.');
  }

  const updated: Banner = { ...banners[index], ...removeUndefined(input), id };

  if (!updated.title.trim()) {
    throw new Error('Informe o título do banner.');
  }

  banners[index] = updated;
  saveBanners(banners);
  return updated;
}

export async function deleteBanner(id: number): Promise<void> {
  const banners = loadBanners();

  if (!banners.some((banner) => banner.id === id)) {
    throw new Error('Banner não encontrado.');
  }

  saveBanners(banners.filter((banner) => banner.id !== id));
}

/* ==========================================================================
   Cupons
   ========================================================================== */

function assertValidCouponValues(coupon: Pick<Coupon, 'discountType' | 'discountValue' | 'minOrderValue' | 'maxUses'>): void {
  if (!Number.isFinite(coupon.discountValue) || coupon.discountValue <= 0) {
    throw new Error('O valor do desconto deve ser maior que zero.');
  }

  if (coupon.discountType !== 'fixed' && coupon.discountValue > 100) {
    throw new Error('O desconto percentual não pode ser maior que 100%.');
  }

  if (!Number.isFinite(coupon.minOrderValue) || coupon.minOrderValue < 0) {
    throw new Error('O pedido mínimo não pode ser negativo.');
  }

  if (!Number.isInteger(coupon.maxUses) || coupon.maxUses < 1) {
    throw new Error('O limite de usos deve ser um número inteiro maior que zero.');
  }
}

export async function getCoupons(): Promise<Coupon[]> {
  return loadCoupons().sort((a, b) => a.id - b.id);
}

export async function getCouponById(id: number): Promise<Coupon | null> {
  return loadCoupons().find((coupon) => coupon.id === id) ?? null;
}

export async function getCouponByCode(code: string): Promise<Coupon | null> {
  const normalizedCode = code.trim().toUpperCase();
  return loadCoupons().find((coupon) => coupon.code === normalizedCode) ?? null;
}

export async function createCoupon(input: CouponInput): Promise<Coupon> {
  const coupons = loadCoupons();
  const code = input.code.trim().toUpperCase();

  if (!code) {
    throw new Error('Informe o código do cupom.');
  }

  if (coupons.some((coupon) => coupon.code === code)) {
    throw new Error('Já existe um cupom com este código.');
  }

  assertValidCouponValues(input);

  const coupon: Coupon = {
    ...input,
    id: generateNextId(coupons),
    code,
    usedCount: 0,
    createdAt: new Date().toISOString(),
  };

  saveCoupons([...coupons, coupon]);
  return coupon;
}

export async function updateCoupon(id: number, input: Partial<CouponInput>): Promise<Coupon> {
  const coupons = loadCoupons();
  const index = coupons.findIndex((coupon) => coupon.id === id);

  if (index === -1) {
    throw new Error('Cupom não encontrado.');
  }

  const fields = removeUndefined(input);
  const updated: Coupon = { ...coupons[index], ...fields, id };

  if (fields.code !== undefined) {
    updated.code = fields.code.trim().toUpperCase();
  }

  if (!updated.code) {
    throw new Error('Informe o código do cupom.');
  }

  if (coupons.some((coupon) => coupon.id !== id && coupon.code === updated.code)) {
    throw new Error('Já existe um cupom com este código.');
  }

  assertValidCouponValues(updated);

  coupons[index] = updated;
  saveCoupons(coupons);
  return updated;
}

/** Cupons já usados em pedidos não podem ser excluídos; desative-os. */
export async function deleteCoupon(id: number): Promise<void> {
  const coupons = loadCoupons();

  if (!coupons.some((coupon) => coupon.id === id)) {
    throw new Error('Cupom não encontrado.');
  }

  if (loadOrders().some((order) => order.couponId === id)) {
    throw new Error('Este cupom já foi usado em pedidos. Desative-o em vez de excluí-lo.');
  }

  saveCoupons(coupons.filter((coupon) => coupon.id !== id));
}

/**
 * Valida um cupom para o contexto informado (subtotal dos produtos e usuário).
 * Retorna o cupom ou lança um Error com a mensagem de motivo da recusa.
 */
export async function validateCoupon(
  code: string,
  context: CouponValidationContext,
): Promise<Coupon> {
  const normalizedCode = code.trim().toUpperCase();

  if (!normalizedCode) {
    throw new Error('Informe o código do cupom.');
  }

  const coupon = loadCoupons().find((item) => item.code === normalizedCode);

  if (!coupon || !coupon.isActive) {
    throw new Error('Cupom inválido ou inativo.');
  }

  if (new Date(coupon.expiresAt).getTime() < Date.now()) {
    throw new Error('Este cupom está expirado.');
  }

  if (coupon.usedCount >= coupon.maxUses) {
    throw new Error('Este cupom atingiu o limite de usos.');
  }

  if (context.subtotal < coupon.minOrderValue) {
    throw new Error(
      `Este cupom exige um pedido mínimo de ${formatCurrency(coupon.minOrderValue)}.`,
    );
  }

  if (coupon.isFirstPurchaseOnly) {
    if (!context.userId) {
      throw new Error('Faça login para usar este cupom de primeira compra.');
    }

    const userId = context.userId;
    const hasPreviousOrders = loadOrders().some(
      (order) => order.userId === userId && order.status !== 'Cancelado',
    );

    if (hasPreviousOrders) {
      throw new Error('Este cupom é válido apenas na primeira compra.');
    }
  }

  return coupon;
}

/** Registra o uso de um cupom (chamado pelo orderService ao criar um pedido). */
export async function incrementCouponUsage(couponId: number): Promise<Coupon> {
  const coupons = loadCoupons();
  const index = coupons.findIndex((coupon) => coupon.id === couponId);

  if (index === -1) {
    throw new Error('Cupom não encontrado.');
  }

  coupons[index] = { ...coupons[index], usedCount: coupons[index].usedCount + 1 };
  saveCoupons(coupons);
  return coupons[index];
}

/** Libera um uso do cupom (chamado pelo orderService ao cancelar um pedido). */
export async function decrementCouponUsage(couponId: number): Promise<Coupon> {
  const coupons = loadCoupons();
  const index = coupons.findIndex((coupon) => coupon.id === couponId);

  if (index === -1) {
    throw new Error('Cupom não encontrado.');
  }

  coupons[index] = { ...coupons[index], usedCount: Math.max(0, coupons[index].usedCount - 1) };
  saveCoupons(coupons);
  return coupons[index];
}

/* ==========================================================================
   Avaliações
   ========================================================================== */

/** Recalcula nota média e quantidade de avaliações do produto (campos agregados). */
function refreshProductRating(productId: number): void {
  const products = loadProducts();
  const index = products.findIndex((product) => product.id === productId);

  if (index === -1) {
    return;
  }

  const productReviews = loadReviews().filter((review) => review.productId === productId);
  const sum = productReviews.reduce((total, review) => total + review.rating, 0);
  const average = productReviews.length > 0 ? Math.round((sum / productReviews.length) * 10) / 10 : 0;

  products[index] = { ...products[index], rating: average, reviewCount: productReviews.length };
  saveProducts(products);
}

function assertValidReviewValues(rating: number, title: string, comment: string): void {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error('A nota deve ser um número inteiro de 1 a 5.');
  }

  if (!title.trim()) {
    throw new Error('Informe um título para a avaliação.');
  }

  if (!comment.trim()) {
    throw new Error('Escreva um comentário para a avaliação.');
  }
}

function sortReviewsByNewest(reviews: Review[]): Review[] {
  return reviews.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() || b.id - a.id,
  );
}

/** Todas as avaliações (admin). */
export async function getReviews(): Promise<Review[]> {
  return sortReviewsByNewest(loadReviews());
}

export async function getReviewsByProduct(productId: number): Promise<Review[]> {
  return sortReviewsByNewest(loadReviews().filter((review) => review.productId === productId));
}

export async function getReviewsByUser(userId: number): Promise<Review[]> {
  return sortReviewsByNewest(loadReviews().filter((review) => review.userId === userId));
}

/** Cria uma avaliação (uma por usuário/produto). A compra é verificada pelos pedidos entregues. */
export async function createReview(input: ReviewInput): Promise<Review> {
  const reviews = loadReviews();

  if (!loadProducts().some((product) => product.id === input.productId)) {
    throw new Error('Produto não encontrado.');
  }

  assertValidReviewValues(input.rating, input.title, input.comment);

  if (reviews.some((review) => review.productId === input.productId && review.userId === input.userId)) {
    throw new Error('Você já avaliou este produto.');
  }

  const isVerifiedPurchase = loadOrders().some(
    (order) =>
      order.userId === input.userId &&
      order.status === 'Entregue' &&
      order.items.some((item) => item.productId === input.productId),
  );

  const review: Review = {
    ...input,
    id: generateNextId(reviews),
    title: input.title.trim(),
    comment: input.comment.trim(),
    isVerifiedPurchase,
    createdAt: new Date().toISOString(),
  };

  saveReviews([...reviews, review]);
  refreshProductRating(review.productId);
  return review;
}

/** Atualiza uma avaliação. Se `requesterId` for informado, ele precisa ser o autor. */
export async function updateReview(
  id: number,
  input: ReviewUpdateInput,
  requesterId?: number,
): Promise<Review> {
  const reviews = loadReviews();
  const index = reviews.findIndex((review) => review.id === id);

  if (index === -1) {
    throw new Error('Avaliação não encontrada.');
  }

  if (requesterId !== undefined && reviews[index].userId !== requesterId) {
    throw new Error('Você não tem permissão para editar esta avaliação.');
  }

  const updated: Review = { ...reviews[index], ...removeUndefined(input), id };

  assertValidReviewValues(updated.rating, updated.title, updated.comment);

  reviews[index] = updated;
  saveReviews(reviews);
  refreshProductRating(updated.productId);
  return updated;
}

/** Exclui uma avaliação. Se `requesterId` for informado, ele precisa ser o autor. */
export async function deleteReview(id: number, requesterId?: number): Promise<void> {
  const reviews = loadReviews();
  const review = reviews.find((item) => item.id === id);

  if (!review) {
    throw new Error('Avaliação não encontrada.');
  }

  if (requesterId !== undefined && review.userId !== requesterId) {
    throw new Error('Você não tem permissão para excluir esta avaliação.');
  }

  saveReviews(reviews.filter((item) => item.id !== id));
  refreshProductRating(review.productId);
}

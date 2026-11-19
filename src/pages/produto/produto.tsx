/**
 * VELOX — Tela Produto (rota "/produto/:slug").
 *
 * Carrega o produto pelo slug (apenas produtos ativos), a categoria para o
 * breadcrumb e os produtos relacionados. A compra usa o CartContext.addToCart,
 * que valida estoque e produto inativo.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check } from 'lucide-react';
import { ShoppingCart } from 'lucide-react';
import { StoreLayout } from '../../layouts/StoreLayout/StoreLayout';
import { Breadcrumb } from '../../components/Ui/Breadcrumb/Breadcrumb';
import { Button } from '../../components/Ui/Button/Button';
import { ProductCard } from '../../components/Ui/ProductCard/ProductCard';
import { QuantityStepper } from '../../components/Ui/QuantityStepper/QuantityStepper';
import { StarRating } from '../../components/Ui/StarRating/StarRating';
import { StatusBadge } from '../../components/Ui/StatusBadge/StatusBadge';
import { useCart } from '../../context/CartContext';
import {
  getCategoryById,
  getProductBySlug,
  getRelatedProducts,
} from '../../services/productService';
import type { Category, Product, ProductSpecAttribute } from '../../types';
import { formatCurrency, roundCurrency } from '../../utils/pricing';
import './produto.css';

/** Quantidade máxima de uma mesma unidade no carrinho (igual ao CartContext). */
const MAX_QUANTITY_PER_ITEM = 99;

/** Parcelamento sem juros exibido na página. */
const INSTALLMENTS = 12;

/** Desconto (%) para pagamento via Pix. */
const PIX_DISCOUNT_PERCENT = 5;

/** Valor mínimo (em reais) para frete grátis. */
const FREE_SHIPPING_MIN_VALUE = 299;

/** Prazo de entrega exibido (dias úteis). */
const DELIVERY_BUSINESS_DAYS = 5;

/** Estoque a partir do qual o produto é considerado "últimas unidades". */
const LOW_STOCK_THRESHOLD = 5;

/** Quantidade de produtos relacionados exibidos. */
const RELATED_LIMIT = 4;

/** Tempo (ms) que a mensagem de feedback do carrinho fica visível. */
const FEEDBACK_DURATION_MS = 3000;

type BadgeVariant = 'success' | 'warning' | 'danger';

interface StockInfo {
  label: string;
  variant: BadgeVariant;
}

function getStockInfo(stock: number): StockInfo {
  if (stock <= 0) {
    return { label: 'Esgotado', variant: 'danger' };
  }

  if (stock <= LOW_STOCK_THRESHOLD) {
    return { label: 'Últimas unidades', variant: 'warning' };
  }

  return { label: 'Em estoque', variant: 'success' };
}

interface CartFeedback {
  type: 'success' | 'error';
  message: string;
}

/** Monta as linhas da tabela de especificações (atributos livres ou dados básicos). */
function buildSpecRows(product: Product): ProductSpecAttribute[] {
  if (product.specs.attributes.length > 0) {
    return product.specs.attributes;
  }

  const { brand, model, color, connectionType, weightKg, dimensions, warrantyMonths } =
    product.specs;

  return [
    { label: 'Marca', value: brand },
    { label: 'Modelo', value: model },
    { label: 'Cor', value: color },
    { label: 'Conexão', value: connectionType },
    { label: 'Peso', value: `${String(weightKg).replace('.', ',')} kg` },
    { label: 'Dimensões', value: dimensions },
    { label: 'Garantia', value: `${warrantyMonths} meses` },
  ].filter((row) => row.value.trim().length > 0);
}

export function Produto() {
  const { slug } = useParams<{ slug: string }>();
  const { addToCart } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isNotFound, setIsNotFound] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [feedback, setFeedback] = useState<CartFeedback | null>(null);

  /* ------------------------------------------------------------------------
     Carga de dados
     ------------------------------------------------------------------------ */
  useEffect(() => {
    let isCancelled = false;

    async function loadProduct(): Promise<void> {
      setIsLoading(true);
      setIsNotFound(false);
      setErrorMessage(null);
      setActiveImageIndex(0);
      setQuantity(1);
      setFeedback(null);

      if (!slug) {
        setProduct(null);
        setIsNotFound(true);
        setIsLoading(false);
        return;
      }

      try {
        const loadedProduct = await getProductBySlug(slug);

        if (isCancelled) {
          return;
        }

        if (!loadedProduct) {
          setProduct(null);
          setCategory(null);
          setRelatedProducts([]);
          setIsNotFound(true);
          return;
        }

        const [loadedCategory, loadedRelated] = await Promise.all([
          getCategoryById(loadedProduct.categoryId),
          getRelatedProducts(loadedProduct.id, RELATED_LIMIT),
        ]);

        if (!isCancelled) {
          setProduct(loadedProduct);
          setCategory(loadedCategory);
          setRelatedProducts(loadedRelated);
          window.scrollTo({ top: 0 });
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : 'Não foi possível carregar o produto.',
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadProduct();

    return () => {
      isCancelled = true;
    };
  }, [slug]);

  // A mensagem de feedback some sozinha.
  useEffect(() => {
    if (!feedback) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setFeedback(null), FEEDBACK_DURATION_MS);

    return () => window.clearTimeout(timeoutId);
  }, [feedback]);

  /* ------------------------------------------------------------------------
     Derivações
     ------------------------------------------------------------------------ */
  const images = useMemo<string[]>(
    () =>
      product
        ? Array.from(new Set([product.imageUrl, ...product.gallery].filter((url) => url)))
        : [],
    [product],
  );

  const specRows = useMemo<ProductSpecAttribute[]>(
    () => (product ? buildSpecRows(product) : []),
    [product],
  );

  const maxQuantity = product ? Math.max(1, Math.min(product.stock, MAX_QUANTITY_PER_ITEM)) : 1;
  const isAvailable = product !== null && product.isActive && product.stock > 0;

  /* ------------------------------------------------------------------------
     Handlers
     ------------------------------------------------------------------------ */
  const handleChangeQuantity = (value: number): void => {
    if (!Number.isFinite(value)) {
      return;
    }

    setQuantity(Math.min(Math.max(1, Math.floor(value)), maxQuantity));
  };

  const handleAddToCart = (): void => {
    if (!product) {
      return;
    }

    const wasAdded = addToCart(product, quantity);

    setFeedback(
      wasAdded
        ? { type: 'success', message: 'Produto adicionado ao carrinho.' }
        : { type: 'error', message: 'Não foi possível adicionar este produto ao carrinho.' },
    );
  };

  const handleAddRelatedToCart = useCallback(
    (relatedProduct: Product): void => {
      addToCart(relatedProduct, 1);
    },
    [addToCart],
  );

  /* ------------------------------------------------------------------------
     Estados de carregamento / erro
     ------------------------------------------------------------------------ */
  if (isLoading || isNotFound || errorMessage || !product) {
    let message = 'Carregando produto...';
    let isError = false;

    if (errorMessage) {
      message = errorMessage;
      isError = true;
    } else if (isNotFound) {
      message = 'Produto não encontrado ou indisponível.';
    }

    return (
      <StoreLayout>
        <div className="produto">
          <p
            className={isError ? 'produto__feedback produto__feedback--error' : 'produto__feedback'}
            role={isError ? 'alert' : 'status'}
          >
            {message}
          </p>
        </div>
      </StoreLayout>
    );
  }

  /* ------------------------------------------------------------------------
     Valores de exibição
     ------------------------------------------------------------------------ */
  const stockInfo = getStockInfo(product.stock);

  // oldPrice é `number | null`: só há desconto quando está preenchido.
  const discountPercent =
    product.oldPrice !== null && product.oldPrice > product.price
      ? Math.round((1 - product.price / product.oldPrice) * 100)
      : null;

  const installmentValue = roundCurrency(product.price / INSTALLMENTS);
  const pixPrice = Math.floor(product.price * (100 - PIX_DISCOUNT_PERCENT)) / 100;

  const ratingLabel =
    product.reviewCount > 0
      ? `${product.rating.toFixed(1).replace('.', ',')} · ${product.reviewCount} avaliações`
      : 'Sem avaliações';

  const breadcrumbItems = [
    { label: 'Home', to: '/' },
    ...(category
      ? [{ label: category.name, to: `/catalogo?categoria=${category.slug}` }]
      : []),
    { label: product.name },
  ];

  const activeImage = images[activeImageIndex] ?? product.imageUrl;

  /* ------------------------------------------------------------------------
     Render
     ------------------------------------------------------------------------ */
  return (
    <StoreLayout>
      <div className="produto">
        <Breadcrumb items={breadcrumbItems} />

        <div className="produto__top">
          {/* Galeria */}
          <section className="produto-gallery" aria-label="Imagens do produto">
            <div className="produto-gallery__main">
              <img className="produto-gallery__image" src={activeImage} alt={product.name} />
            </div>

            {images.length > 1 && (
              <ul className="produto-gallery__thumbs">
                {images.map((imageUrl, index) => (
                  <li key={imageUrl} className="produto-gallery__thumb-item">
                    <button
                      type="button"
                      className={
                        index === activeImageIndex
                          ? 'produto-gallery__thumb produto-gallery__thumb--active'
                          : 'produto-gallery__thumb'
                      }
                      aria-label={`Ver imagem ${index + 1} de ${images.length}`}
                      aria-current={index === activeImageIndex}
                      onClick={() => setActiveImageIndex(index)}
                    >
                      <img
                        className="produto-gallery__thumb-image"
                        src={imageUrl}
                        alt=""
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Informações e compra */}
          <section className="produto-info" aria-label="Informações de compra">
            <div className="produto-info__badge">
              <StatusBadge tone={stockInfo.variant}>{stockInfo.label}</StatusBadge>
            </div>

            <h1 className="produto-info__title">{product.name}</h1>

            <div className="produto-info__rating">
              <StarRating rating={product.rating} />
              <span className="produto-info__rating-text">{ratingLabel}</span>
            </div>

            <div className="produto-info__prices">
              {product.oldPrice !== null && (
                <div className="produto-info__old-price-row">
                  <span className="produto-info__old-price">{formatCurrency(product.oldPrice)}</span>
                  {discountPercent !== null && (
                    <span className="produto-info__discount">-{discountPercent}%</span>
                  )}
                </div>
              )}

              <p className="produto-info__price">{formatCurrency(product.price)}</p>

              <p className="produto-info__installments">
                ou {INSTALLMENTS}x de {formatCurrency(installmentValue)} sem juros ·{' '}
                <strong className="produto-info__pix">{formatCurrency(pixPrice)} no PIX</strong>
              </p>
            </div>

            <div className="produto-info__quantity">
              <span className="produto-info__quantity-label">Quantidade</span>
              <QuantityStepper
                value={quantity}
                min={1}
                max={maxQuantity}
                onChange={handleChangeQuantity}
              />
            </div>

            <div className="produto-info__buy">
              <Button onClick={handleAddToCart} disabled={!isAvailable}>
                <ShoppingCart size={20} aria-hidden="true" />
                {isAvailable ? 'Adicionar ao carrinho' : 'Produto indisponível'}
              </Button>

              {feedback && (
                <p
                  className={
                    feedback.type === 'success'
                      ? 'produto-info__feedback produto-info__feedback--success'
                      : 'produto-info__feedback produto-info__feedback--error'
                  }
                  role="status"
                >
                  {feedback.message}
                </p>
              )}
            </div>

            <ul className="produto-info__benefits">
              <li className="produto-info__benefit">
                <Check size={14} aria-hidden="true" />
                <span>
                  <strong className="produto-info__benefit-strong">Frete grátis</strong> acima de{' '}
                  {formatCurrency(FREE_SHIPPING_MIN_VALUE)}
                </span>
              </li>
              <li className="produto-info__benefit">
                <Check size={14} aria-hidden="true" />
                <span>Entrega em até {DELIVERY_BUSINESS_DAYS} dias úteis</span>
              </li>
              <li className="produto-info__benefit">
                <Check size={14} aria-hidden="true" />
                <span>Garantia de {product.specs.warrantyMonths} meses do fabricante</span>
              </li>
            </ul>
          </section>
        </div>

        {/* Descrição e especificações */}
        <div className="produto__details">
          <section className="produto-panel" aria-labelledby="produto-description-title">
            <h2 id="produto-description-title" className="produto-panel__title">
              Descrição
            </h2>
            <p className="produto-panel__text">{product.description}</p>
          </section>

          {specRows.length > 0 && (
            <section className="produto-panel" aria-labelledby="produto-specs-title">
              <h2 id="produto-specs-title" className="produto-panel__title">
                Especificações técnicas
              </h2>
              <table className="produto-specs">
                <tbody>
                  {specRows.map((row) => (
                    <tr key={row.label} className="produto-specs__row">
                      <th className="produto-specs__label" scope="row">
                        {row.label}
                      </th>
                      <td className="produto-specs__value">{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>

        {/* Produtos relacionados */}
        {relatedProducts.length > 0 && (
          <section className="produto-related" aria-labelledby="produto-related-title">
            <h2 id="produto-related-title" className="produto-related__title">
              Produtos relacionados
            </h2>
            <ul className="produto-related__grid">
              {relatedProducts.map((relatedProduct) => (
                <li key={relatedProduct.id} className="produto-related__item">
                  <ProductCard product={relatedProduct} onAddToCart={handleAddRelatedToCart} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </StoreLayout>
  );
}

export default Produto;
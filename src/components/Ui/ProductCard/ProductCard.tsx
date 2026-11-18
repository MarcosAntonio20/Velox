import { Heart, ShoppingCart, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../../../context/CartContext';
import { useWishlist } from '../../../context/WishlistContext';
import type { Product } from '../../../types';
import { classNames } from '../../../utils/helpers';
import {
  calculateDiscountPercentage,
  formatCurrency,
  formatInstallments,
} from '../../../utils/pricing';
import { Button } from '../Button/Button';
import { StarRating } from '../StarRating/StarRating';
import './ProductCard.css';

/** Tempo (ms) em que o botão exibe "Adicionado!" após adicionar ao carrinho. */
const ADDED_FEEDBACK_DURATION = 1600;

export interface ProductCardProps {
  product: Product;
  /** Exibe o selo de desconto (ex.: "-20%") quando o produto tem preço antigo. */
  showDiscountBadge?: boolean;
  /** Exibe o botão de coração (favoritar) sobre a imagem. */
  showFavoriteButton?: boolean;
  /** Exibe o botão "Remover dos favoritos" (uso na página de favoritos). */
  showRemoveFromWishlist?: boolean;
  /** Chamado após o produto ser adicionado ao carrinho com sucesso. */
  onAddToCart?: (product: Product) => void;
  className?: string;
}

export function ProductCard({
  product,
  showDiscountBadge = true,
  showFavoriteButton = false,
  showRemoveFromWishlist = false,
  onAddToCart,
  className,
}: ProductCardProps) {
  const { addToCart } = useCart();
  const { isInWishlist, toggleWishlist, removeFromWishlist } = useWishlist();
  const [justAdded, setJustAdded] = useState<boolean>(false);
  const feedbackTimeoutRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (feedbackTimeoutRef.current !== null) {
        window.clearTimeout(feedbackTimeoutRef.current);
      }
    },
    [],
  );

  const productUrl = `/produto/${product.slug}`;
  const discountPercentage = calculateDiscountPercentage(product.price, product.oldPrice);
  const isAvailable = product.isActive && product.stock > 0;
  const isFavorite = isInWishlist(product.id);

  const handleAddToCart = (): void => {
    const wasAdded = addToCart(product, 1);

    if (!wasAdded) {
      return;
    }

    setJustAdded(true);

    if (feedbackTimeoutRef.current !== null) {
      window.clearTimeout(feedbackTimeoutRef.current);
    }

    feedbackTimeoutRef.current = window.setTimeout(() => {
      setJustAdded(false);
      feedbackTimeoutRef.current = null;
    }, ADDED_FEEDBACK_DURATION);

    if (onAddToCart) {
      onAddToCart(product);
    }
  };

  const addToCartLabel = !isAvailable
    ? 'Indisponível'
    : justAdded
      ? 'Adicionado!'
      : 'Adicionar ao carrinho';

  return (
    <article className={classNames('product-card', !isAvailable && 'product-card--unavailable', className)}>
      <div className="product-card__media">
        {showDiscountBadge && discountPercentage > 0 ? (
          <span className="product-card__discount">-{discountPercentage}%</span>
        ) : null}

        {showFavoriteButton ? (
          <button
            type="button"
            className={classNames(
              'product-card__favorite',
              isFavorite && 'product-card__favorite--active',
            )}
            onClick={() => toggleWishlist(product.id)}
            aria-pressed={isFavorite}
            aria-label={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
          >
            <Heart className="product-card__favorite-icon" />
          </button>
        ) : null}

        <Link className="product-card__image-link" to={productUrl} tabIndex={-1} aria-hidden="true">
          <img
            className="product-card__image"
            src={product.imageUrl}
            alt=""
            loading="lazy"
          />
        </Link>
      </div>

      <div className="product-card__body">
        <h3 className="product-card__name">
          <Link className="product-card__name-link" to={productUrl}>
            {product.name}
          </Link>
        </h3>

        <StarRating rating={product.rating} reviewCount={product.reviewCount} size="sm" />

        <div className="product-card__prices">
          {product.oldPrice !== null && product.oldPrice > product.price ? (
            <span className="product-card__old-price">{formatCurrency(product.oldPrice)}</span>
          ) : null}
          <span className="product-card__price">{formatCurrency(product.price)}</span>
          <span className="product-card__installments">{formatInstallments(product.price)}</span>
        </div>

        <div className="product-card__actions">
          <Button
            variant="primary"
            fullWidth
            leftIcon={ShoppingCart}
            onClick={handleAddToCart}
            disabled={!isAvailable}
          >
            {addToCartLabel}
          </Button>

          {showRemoveFromWishlist ? (
            <Button
              variant="outline-danger"
              size="sm"
              fullWidth
              leftIcon={Trash2}
              onClick={() => removeFromWishlist(product.id)}
            >
              Remover dos favoritos
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
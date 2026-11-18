import { Star } from 'lucide-react';
import { classNames } from '../../../utils/helpers';
import './StarRating.css';

const TOTAL_STARS = 5;

type StarFill = 'full' | 'half' | 'empty';

export type StarRatingSize = 'sm' | 'md' | 'lg';

export interface StarRatingProps {
  /** Nota de 0 a 5 (aceita decimais; é exibida em passos de meia estrela). */
  rating: number;
  /** Quantidade de avaliações, exibida entre parênteses quando informada. */
  reviewCount?: number;
  size?: StarRatingSize;
  className?: string;
}

function getStarFill(rating: number, position: number): StarFill {
  const remaining = rating - (position - 1);

  if (remaining >= 0.75) {
    return 'full';
  }

  if (remaining >= 0.25) {
    return 'half';
  }

  return 'empty';
}

function buildAriaLabel(rating: number, reviewCount?: number): string {
  const ratingText = rating.toFixed(1).replace('.', ',');
  const base = `Avaliação ${ratingText} de ${TOTAL_STARS}`;

  if (reviewCount === undefined) {
    return base;
  }

  return `${base}, ${reviewCount} ${reviewCount === 1 ? 'avaliação' : 'avaliações'}`;
}

export function StarRating({ rating, reviewCount, size = 'md', className }: StarRatingProps) {
  const safeRating = Number.isFinite(rating) ? Math.min(Math.max(rating, 0), TOTAL_STARS) : 0;

  return (
    <span
      className={classNames(
        'star-rating',
        size === 'sm' && 'star-rating--sm',
        size === 'lg' && 'star-rating--lg',
        className,
      )}
      role="img"
      aria-label={buildAriaLabel(safeRating, reviewCount)}
    >
      <span className="star-rating__stars" aria-hidden="true">
        {Array.from({ length: TOTAL_STARS }, (_, index) => {
          const fill = getStarFill(safeRating, index + 1);

          return (
            <span key={index} className="star-rating__star">
              <Star className="star-rating__icon star-rating__icon--empty" />
              {fill !== 'empty' ? (
                <span className={`star-rating__fill star-rating__fill--${fill}`}>
                  <Star className="star-rating__icon star-rating__icon--filled" />
                </span>
              ) : null}
            </span>
          );
        })}
      </span>
      {reviewCount !== undefined ? (
        <span className="star-rating__count" aria-hidden="true">
          ({reviewCount})
        </span>
      ) : null}
    </span>
  );
}

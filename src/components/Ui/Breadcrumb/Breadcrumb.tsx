import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { classNames } from '../../../utils/helpers';
import './Breadcrumb.css';

export interface BreadcrumbItem {
  label: string;
  /** Rota do item. O último item (página atual) não precisa de `to`. */
  to?: string;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  return (
    <nav className={classNames('breadcrumb', className)} aria-label="Navegação estrutural">
      <ol className="breadcrumb__list">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={`${item.label}-${index}`} className="breadcrumb__item">
              {isLast || !item.to ? (
                <span
                  className="breadcrumb__current"
                  aria-current={isLast ? 'page' : undefined}
                >
                  {item.label}
                </span>
              ) : (
                <Link className="breadcrumb__link" to={item.to}>
                  {item.label}
                </Link>
              )}
              {!isLast ? <ChevronRight className="breadcrumb__separator" aria-hidden="true" /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

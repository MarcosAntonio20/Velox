import { ChevronLeft, ChevronRight } from 'lucide-react';
import { classNames } from '../../../utils/helpers';
import './Pagination.css';

/** Até esta quantidade de páginas, todas são exibidas sem reticências. */
const MAX_PAGES_WITHOUT_ELLIPSIS = 7;

type PageItem = { type: 'page'; page: number } | { type: 'ellipsis'; key: string };

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Quantidade de páginas exibidas de cada lado da página atual. */
  siblingCount?: number;
  className?: string;
}

/** Monta a lista de itens: primeira, última, vizinhas da atual e reticências nos intervalos. */
function buildPageItems(currentPage: number, totalPages: number, siblingCount: number): PageItem[] {
  // Com poucas páginas, mostra todas (reticências escondendo 1 ou 2 páginas não ajudam).
  if (totalPages <= MAX_PAGES_WITHOUT_ELLIPSIS) {
    return Array.from({ length: totalPages }, (_, index) => ({
      type: 'page' as const,
      page: index + 1,
    }));
  }

  const pages = new Set<number>([1, totalPages]);

  for (let page = currentPage - siblingCount; page <= currentPage + siblingCount; page += 1) {
    if (page >= 1 && page <= totalPages) {
      pages.add(page);
    }
  }

  const sortedPages = Array.from(pages).sort((a, b) => a - b);
  const items: PageItem[] = [];

  sortedPages.forEach((page, index) => {
    if (index > 0) {
      const previousPage = sortedPages[index - 1];
      const gap = page - previousPage;

      if (gap === 2) {
        items.push({ type: 'page', page: previousPage + 1 });
      } else if (gap > 2) {
        items.push({ type: 'ellipsis', key: `ellipsis-${page}` });
      }
    }

    items.push({ type: 'page', page });
  });

  return items;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  siblingCount = 1,
  className,
}: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  const safeCurrentPage = Math.min(Math.max(currentPage, 1), totalPages);
  const items = buildPageItems(safeCurrentPage, totalPages, siblingCount);

  return (
    <nav className={classNames('pagination', className)} aria-label="Paginação">
      <ul className="pagination__list">
        <li className="pagination__item">
          <button
            type="button"
            className="pagination__button"
            onClick={() => onPageChange(safeCurrentPage - 1)}
            disabled={safeCurrentPage === 1}
            aria-label="Página anterior"
          >
            <ChevronLeft className="pagination__icon" />
          </button>
        </li>

        {items.map((item) =>
          item.type === 'ellipsis' ? (
            <li key={item.key} className="pagination__item">
              <span className="pagination__ellipsis" aria-hidden="true">
                …
              </span>
            </li>
          ) : (
            <li key={item.page} className="pagination__item">
              <button
                type="button"
                className={classNames(
                  'pagination__button',
                  item.page === safeCurrentPage && 'pagination__button--active',
                )}
                onClick={() => onPageChange(item.page)}
                aria-label={`Página ${item.page}`}
                aria-current={item.page === safeCurrentPage ? 'page' : undefined}
              >
                {item.page}
              </button>
            </li>
          ),
        )}

        <li className="pagination__item">
          <button
            type="button"
            className="pagination__button"
            onClick={() => onPageChange(safeCurrentPage + 1)}
            disabled={safeCurrentPage === totalPages}
            aria-label="Próxima página"
          >
            <ChevronRight className="pagination__icon" />
          </button>
        </li>
      </ul>
    </nav>
  );
}

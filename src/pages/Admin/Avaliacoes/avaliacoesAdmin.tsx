/**
 * VELOX — Admin / Avaliações (rota "/admin/avaliacoes").
 *
 * Renderizada dentro do AdminLayout (via <Outlet />), por isso não usa layout próprio.
 *
 * Regras:
 * - O tipo Review não possui status de moderação: o status de cada avaliação
 *   ("Aguardando aprovação", "Aprovada" ou "Oculta") fica no localStorage. Avaliações
 *   sem status salvo contam como DEFAULT_STATUS.
 * - As pílulas de status filtram na hora; a busca (cliente ou produto) vale no "Filtrar".
 * - Ver abre um modal com a avaliação completa; Aprovar e Ocultar mudam o status;
 *   Excluir pede confirmação e remove a avaliação (o service recalcula a nota do produto).
 */

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Check, Eye, EyeOff, Search, Trash2 } from 'lucide-react';
import { Button } from '../../../components/Ui/Button/Button';
import { Pagination } from '../../../components/Ui/Pagination/Pagination';
import { StarRating } from '../../../components/Ui/StarRating/StarRating';
import { StatusBadge, type BadgeTone } from '../../../components/Ui/StatusBadge/StatusBadge';
import { getUsersByIds } from '../../../services/authService';
import { deleteReview, getProducts, getReviews } from '../../../services/productService';
import { STORAGE_PREFIX, readStorage, writeStorage } from '../../../services/storage';
import type { Product, Review } from '../../../types';
import { normalizeText } from '../../../utils/helpers';
import './avaliacoesAdmin.css';

/** Quantidade de avaliações por página. */
const PAGE_SIZE = 5;

/** Tempo (ms) que a mensagem de sucesso fica visível. */
const FEEDBACK_DURATION_MS = 4000;

/** Chave do localStorage com o status de moderação por avaliação. */
const MODERATION_STORAGE_KEY = `${STORAGE_PREFIX}review-moderation`;

type ReviewStatus = 'pending' | 'approved' | 'hidden';
type StatusFilter = 'all' | ReviewStatus;

/** Status das avaliações que ainda não passaram pela moderação. */
const DEFAULT_STATUS: ReviewStatus = 'pending';

interface StatusMeta {
  label: string;
  tone: BadgeTone;
}

const STATUS_META: Record<ReviewStatus, StatusMeta> = {
  pending: { label: 'Aguardando aprovação', tone: 'warning' },
  approved: { label: 'Aprovada', tone: 'success' },
  hidden: { label: 'Oculta', tone: 'neutral' },
};

interface FilterPill {
  value: StatusFilter;
  label: string;
}

const FILTER_PILLS: FilterPill[] = [
  { value: 'all', label: 'Todas' },
  { value: 'pending', label: 'Aguardando aprovação' },
  { value: 'approved', label: 'Aprovadas' },
  { value: 'hidden', label: 'Ocultas' },
];

type StatusesMap = Record<number, ReviewStatus>;

/** Avaliação já combinada com cliente, produto e status (usada na tabela e no modal). */
interface ReviewRow {
  review: Review;
  customerName: string;
  product: Product | null;
  status: ReviewStatus;
}

/* ==========================================================================
   Helpers
   ========================================================================== */

/** Lê os status salvos, descartando valores inválidos. */
function loadStatuses(): StatusesMap {
  const stored = readStorage<Record<string, string>>(MODERATION_STORAGE_KEY, () => ({}));
  const statuses: StatusesMap = {};

  Object.entries(stored).forEach(([reviewId, value]) => {
    if (value === 'pending' || value === 'approved' || value === 'hidden') {
      statuses[Number(reviewId)] = value;
    }
  });

  return statuses;
}

const formatDate = (iso: string): string => new Date(iso).toLocaleDateString('pt-BR');

/* ==========================================================================
   Tela
   ========================================================================== */

export function AvaliacoesAdmin() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerNames, setCustomerNames] = useState<Record<number, string>>({});
  const [statuses, setStatuses] = useState<StatusesMap>(loadStatuses);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  /* Filtros: a busca só vale no "Filtrar"; as pílulas filtram na hora. */
  const [searchDraft, setSearchDraft] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [currentPage, setCurrentPage] = useState(1);

  /* Modais. */
  const [viewedReviewId, setViewedReviewId] = useState<number | null>(null);
  const [reviewToDelete, setReviewToDelete] = useState<ReviewRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  /* ------------------------------------------------------------------------
     Carga de dados
     ------------------------------------------------------------------------ */
  useEffect(() => {
    let isCancelled = false;

    async function loadData(): Promise<void> {
      try {
        const [loadedReviews, loadedProducts] = await Promise.all([
          getReviews(),
          getProducts({ includeInactive: true }),
        ]);

        const users = await getUsersByIds(
          Array.from(new Set(loadedReviews.map((review) => review.userId))),
        );

        if (isCancelled) {
          return;
        }

        const names: Record<number, string> = {};

        users.forEach((user) => {
          names[user.id] = user.name;
        });

        setReviews(loadedReviews);
        setProducts(loadedProducts);
        setCustomerNames(names);
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : 'Não foi possível carregar as avaliações.',
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadData();

    return () => {
      isCancelled = true;
    };
  }, []);

  // A mensagem de sucesso some sozinha.
  useEffect(() => {
    if (!successMessage) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setSuccessMessage(null), FEEDBACK_DURATION_MS);

    return () => window.clearTimeout(timeoutId);
  }, [successMessage]);

  // Esc fecha o modal aberto (a exclusão em andamento não pode ser cancelada).
  useEffect(() => {
    if (viewedReviewId === null && !reviewToDelete) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') {
        return;
      }

      setViewedReviewId(null);

      if (!isDeleting) {
        setReviewToDelete(null);
        setDeleteError(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewedReviewId, reviewToDelete, isDeleting]);

  /* ------------------------------------------------------------------------
     Derivações
     ------------------------------------------------------------------------ */
  const rows = useMemo<ReviewRow[]>(() => {
    const productsById = new Map<number, Product>(
      products.map((product) => [product.id, product]),
    );

    return reviews.map((review) => ({
      review,
      customerName: customerNames[review.userId] ?? `Cliente #${review.userId}`,
      product: productsById.get(review.productId) ?? null,
      status: statuses[review.id] ?? DEFAULT_STATUS,
    }));
  }, [reviews, products, customerNames, statuses]);

  const filteredRows = useMemo<ReviewRow[]>(() => {
    const normalizedSearch = normalizeText(appliedSearch);

    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) {
        return false;
      }

      if (normalizedSearch) {
        const productName = row.product ? row.product.name : '';

        if (!normalizeText(`${row.customerName} ${productName}`).includes(normalizedSearch)) {
          return false;
        }
      }

      return true;
    });
  }, [rows, statusFilter, appliedSearch]);

  const totalReviews = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalReviews / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  const pageRows = useMemo<ReviewRow[]>(
    () => filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredRows, safePage],
  );

  const rangeStart = totalReviews === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, totalReviews);

  const viewedRow = useMemo<ReviewRow | null>(
    () => rows.find((row) => row.review.id === viewedReviewId) ?? null,
    [rows, viewedReviewId],
  );

  /* ------------------------------------------------------------------------
     Handlers: filtros
     ------------------------------------------------------------------------ */
  const handleApplySearch = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    setAppliedSearch(searchDraft.trim());
    setCurrentPage(1);
  };

  const handleSelectPill = (value: StatusFilter): void => {
    setStatusFilter(value);
    setCurrentPage(1);
  };

  /* ------------------------------------------------------------------------
     Handlers: moderação e exclusão
     ------------------------------------------------------------------------ */
  const handleSetStatus = (row: ReviewRow, status: ReviewStatus): void => {
    if (row.status === status) {
      return;
    }

    const nextStatuses: StatusesMap = { ...statuses, [row.review.id]: status };

    setStatuses(nextStatuses);
    writeStorage(MODERATION_STORAGE_KEY, nextStatuses);
    setSuccessMessage(
      status === 'approved'
        ? `Avaliação de ${row.customerName} aprovada.`
        : `Avaliação de ${row.customerName} ocultada.`,
    );
  };

  const handleCloseDelete = (): void => {
    if (isDeleting) {
      return;
    }

    setReviewToDelete(null);
    setDeleteError(null);
  };

  const handleConfirmDelete = async (): Promise<void> => {
    if (!reviewToDelete) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      await deleteReview(reviewToDelete.review.id);

      const nextStatuses: StatusesMap = { ...statuses };

      delete nextStatuses[reviewToDelete.review.id];
      setStatuses(nextStatuses);
      writeStorage(MODERATION_STORAGE_KEY, nextStatuses);

      setReviews((previous) =>
        previous.filter((review) => review.id !== reviewToDelete.review.id),
      );
      setSuccessMessage(`Avaliação de ${reviewToDelete.customerName} excluída.`);
      setReviewToDelete(null);
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : 'Não foi possível excluir a avaliação.',
      );
    } finally {
      setIsDeleting(false);
    }
  };

  /* ------------------------------------------------------------------------
     Render
     ------------------------------------------------------------------------ */
  return (
    <div className="avaliacoes-admin">
      <header className="avaliacoes-admin__header">
        <h2 className="avaliacoes-admin__title">Avaliações</h2>
      </header>

      <section className="avaliacoes-admin__card">
        {/* Busca */}
        <form className="avaliacoes-admin-filters" onSubmit={handleApplySearch}>
          <label className="avaliacoes-admin-filters__search">
            <Search className="avaliacoes-admin-filters__search-icon" aria-hidden="true" />
            <input
              type="search"
              className="avaliacoes-admin-filters__input"
              placeholder="Pesquisar por cliente ou produto..."
              aria-label="Pesquisar avaliação por cliente ou produto"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
            />
          </label>

          <div className="avaliacoes-admin-filters__submit">
            <Button type="submit" variant="primary">
              Filtrar
            </Button>
          </div>
        </form>

        {/* Pílulas de status */}
        <div className="avaliacoes-admin-pills" role="group" aria-label="Filtrar por status">
          <span className="avaliacoes-admin-pills__label">Status:</span>
          {FILTER_PILLS.map((pill) => (
            <button
              key={pill.value}
              type="button"
              className={
                statusFilter === pill.value
                  ? 'avaliacoes-admin-pills__pill avaliacoes-admin-pills__pill--active'
                  : 'avaliacoes-admin-pills__pill'
              }
              aria-pressed={statusFilter === pill.value}
              onClick={() => handleSelectPill(pill.value)}
            >
              {pill.label}
            </button>
          ))}
        </div>

        {successMessage && (
          <p className="avaliacoes-admin__feedback avaliacoes-admin__feedback--success" role="status">
            {successMessage}
          </p>
        )}

        {errorMessage && (
          <p className="avaliacoes-admin__feedback avaliacoes-admin__feedback--error" role="alert">
            {errorMessage}
          </p>
        )}

        {isLoading && !errorMessage && (
          <p className="avaliacoes-admin__feedback" role="status">
            Carregando avaliações...
          </p>
        )}

        {!isLoading && !errorMessage && (
          <>
            {pageRows.length === 0 ? (
              <p className="avaliacoes-admin__feedback">Nenhuma avaliação encontrada.</p>
            ) : (
              <div className="avaliacoes-admin__table-wrapper">
                <table className="avaliacoes-admin-table">
                  <thead>
                    <tr className="avaliacoes-admin-table__head-row">
                      <th className="avaliacoes-admin-table__head-cell" scope="col">
                        Cliente
                      </th>
                      <th className="avaliacoes-admin-table__head-cell" scope="col">
                        Produto
                      </th>
                      <th className="avaliacoes-admin-table__head-cell" scope="col">
                        Nota
                      </th>
                      <th className="avaliacoes-admin-table__head-cell" scope="col">
                        Comentário
                      </th>
                      <th className="avaliacoes-admin-table__head-cell" scope="col">
                        Status
                      </th>
                      <th className="avaliacoes-admin-table__head-cell" scope="col">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row) => (
                      <tr key={row.review.id} className="avaliacoes-admin-table__row">
                        <td className="avaliacoes-admin-table__cell">
                          <span className="avaliacoes-admin-table__customer">
                            {row.customerName}
                          </span>
                          <span className="avaliacoes-admin-table__date">
                            {formatDate(row.review.createdAt)}
                          </span>
                        </td>
                        <td className="avaliacoes-admin-table__cell">
                          <div className="avaliacoes-admin-table__product">
                            <span className="avaliacoes-admin-table__thumb">
                              {row.product && (
                                <img
                                  className="avaliacoes-admin-table__thumb-image"
                                  src={row.product.imageUrl}
                                  alt=""
                                  loading="lazy"
                                />
                              )}
                            </span>
                            <span className="avaliacoes-admin-table__product-name">
                              {row.product ? row.product.name : 'Produto removido'}
                            </span>
                          </div>
                        </td>
                        <td className="avaliacoes-admin-table__cell">
                          <StarRating rating={row.review.rating} />
                        </td>
                        <td className="avaliacoes-admin-table__cell">
                          <p className="avaliacoes-admin-table__comment">
                            “{row.review.comment}”
                          </p>
                        </td>
                        <td className="avaliacoes-admin-table__cell avaliacoes-admin-table__cell--status">
                          <StatusBadge tone={STATUS_META[row.status].tone}>
                            {STATUS_META[row.status].label}
                          </StatusBadge>
                        </td>
                        <td className="avaliacoes-admin-table__cell">
                          <div className="avaliacoes-admin-table__actions">
                            <Button
                              variant="outline-neutral"
                              size="sm"
                              leftIcon={Eye}
                              onClick={() => setViewedReviewId(row.review.id)}
                            >
                              Ver
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              leftIcon={Check}
                              onClick={() => handleSetStatus(row, 'approved')}
                              disabled={row.status === 'approved'}
                            >
                              Aprovar
                            </Button>
                            <Button
                              variant="outline-neutral"
                              size="sm"
                              leftIcon={EyeOff}
                              onClick={() => handleSetStatus(row, 'hidden')}
                              disabled={row.status === 'hidden'}
                            >
                              Ocultar
                            </Button>
                            <Button
                              variant="outline-danger"
                              size="sm"
                              leftIcon={Trash2}
                              onClick={() => setReviewToDelete(row)}
                            >
                              Excluir
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <footer className="avaliacoes-admin__footer">
              <p className="avaliacoes-admin__summary">
                Exibindo {rangeStart}–{rangeEnd} de {totalReviews}{' '}
                {totalReviews === 1 ? 'avaliação' : 'avaliações'}
              </p>
              <Pagination
                currentPage={safePage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </footer>
          </>
        )}
      </section>

      {/* Modal: ver avaliação */}
      {viewedRow && (
        <div
          className="avaliacoes-admin-modal"
          role="presentation"
          onClick={() => setViewedReviewId(null)}
        >
          <div
            className="avaliacoes-admin-modal__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="avaliacoes-admin-view-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="avaliacoes-admin-modal__heading">
              <h3 id="avaliacoes-admin-view-title" className="avaliacoes-admin-modal__title">
                Avaliação de {viewedRow.customerName}
              </h3>
              <StatusBadge tone={STATUS_META[viewedRow.status].tone}>
                {STATUS_META[viewedRow.status].label}
              </StatusBadge>
            </div>

            <div className="avaliacoes-admin-modal__product">
              <span className="avaliacoes-admin-table__thumb">
                {viewedRow.product && (
                  <img
                    className="avaliacoes-admin-table__thumb-image"
                    src={viewedRow.product.imageUrl}
                    alt=""
                  />
                )}
              </span>
              <div className="avaliacoes-admin-modal__product-text">
                <span className="avaliacoes-admin-table__product-name">
                  {viewedRow.product ? viewedRow.product.name : 'Produto removido'}
                </span>
                <span className="avaliacoes-admin-modal__meta">
                  {formatDate(viewedRow.review.createdAt)}
                  {viewedRow.review.isVerifiedPurchase ? ' · Compra verificada' : ''}
                </span>
              </div>
              <StarRating rating={viewedRow.review.rating} />
            </div>

            <div className="avaliacoes-admin-modal__content">
              <h4 className="avaliacoes-admin-modal__review-title">{viewedRow.review.title}</h4>
              <p className="avaliacoes-admin-modal__comment">{viewedRow.review.comment}</p>
            </div>

            <div className="avaliacoes-admin-modal__actions">
              <Button variant="outline-neutral" onClick={() => setViewedReviewId(null)}>
                Fechar
              </Button>
              <Button
                variant="outline-neutral"
                leftIcon={EyeOff}
                onClick={() => handleSetStatus(viewedRow, 'hidden')}
                disabled={viewedRow.status === 'hidden'}
              >
                Ocultar
              </Button>
              <Button
                variant="primary"
                leftIcon={Check}
                onClick={() => handleSetStatus(viewedRow, 'approved')}
                disabled={viewedRow.status === 'approved'}
              >
                Aprovar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: confirmação de exclusão */}
      {reviewToDelete && (
        <div className="avaliacoes-admin-modal" role="presentation" onClick={handleCloseDelete}>
          <div
            className="avaliacoes-admin-modal__dialog avaliacoes-admin-modal__dialog--narrow"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="avaliacoes-admin-delete-title"
            aria-describedby="avaliacoes-admin-delete-text"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="avaliacoes-admin-delete-title" className="avaliacoes-admin-modal__title">
              Excluir avaliação
            </h3>
            <p id="avaliacoes-admin-delete-text" className="avaliacoes-admin-modal__text">
              Tem certeza que deseja excluir a avaliação de{' '}
              <strong>{reviewToDelete.customerName}</strong>? Esta ação não pode ser desfeita e a
              nota do produto será recalculada.
            </p>

            {deleteError && (
              <p
                className="avaliacoes-admin__feedback avaliacoes-admin__feedback--error"
                role="alert"
              >
                {deleteError}
              </p>
            )}

            <div className="avaliacoes-admin-modal__actions">
              <Button variant="outline-neutral" onClick={handleCloseDelete} disabled={isDeleting}>
                Cancelar
              </Button>
              <Button
                variant="outline-danger"
                leftIcon={Trash2}
                onClick={() => void handleConfirmDelete()}
                disabled={isDeleting}
              >
                {isDeleting ? 'Excluindo...' : 'Excluir'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AvaliacoesAdmin;
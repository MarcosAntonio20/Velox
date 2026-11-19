/**
 * VELOX — Admin / Produtos (rota "/admin/produtos").
 *
 * Renderizada dentro do AdminLayout (via <Outlet />), por isso não usa layout
 * próprio. Lista todos os produtos (inclusive inativos) com busca por nome,
 * filtros de categoria e status (aplicados no botão "Filtrar"), modal de
 * visualização rápida, exclusão com confirmação e paginação.
 */

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '../../../components/Ui/Button/Button';
import { Pagination } from '../../../components/Ui/Pagination/Pagination';
import { StatusBadge } from '../../../components/Ui/StatusBadge/StatusBadge';
import { deleteProduct, getCategories, getProducts } from '../../../services/productService';
import type { Category, Product } from '../../../types';
import { normalizeText } from '../../../utils/helpers';
import { formatCurrency } from '../../../utils/pricing';
import './produto.css';

/** Quantidade de produtos por página. */
const PAGE_SIZE = 6;

/** Estoque até o qual o valor aparece em laranja (0 aparece em vermelho). */
const LOW_STOCK_LIMIT = 10;

const ALL_CATEGORIES = 'all';

type StatusFilter = 'all' | 'active' | 'inactive';

interface StatusOption {
  value: StatusFilter;
  label: string;
}

const STATUS_OPTIONS: StatusOption[] = [
  { value: 'all', label: 'Status: Todos' },
  { value: 'active', label: 'Status: Ativos' },
  { value: 'inactive', label: 'Status: Inativos' },
];

interface AppliedFilters {
  search: string;
  categoryId: string;
  status: StatusFilter;
}

const INITIAL_FILTERS: AppliedFilters = {
  search: '',
  categoryId: ALL_CATEGORIES,
  status: 'all',
};

/** Formata o id como "#001". */
const formatProductId = (id: number): string => `#${String(id).padStart(3, '0')}`;

/** Modificador de cor do estoque: vermelho se 0, laranja se <= 10. */
function getStockModifier(stock: number): string {
  if (stock <= 0) {
    return 'produtos__stock-value--out';
  }

  if (stock <= LOW_STOCK_LIMIT) {
    return 'produtos__stock-value--low';
  }

  return '';
}

export function Produtos() {
  const navigate = useNavigate();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /* Filtros: o que está sendo digitado x o que foi aplicado no "Filtrar". */
  const [searchDraft, setSearchDraft] = useState('');
  const [categoryDraft, setCategoryDraft] = useState(ALL_CATEGORIES);
  const [statusDraft, setStatusDraft] = useState<StatusFilter>('all');
  const [appliedFilters, setAppliedFilters] = useState<AppliedFilters>(INITIAL_FILTERS);
  const [currentPage, setCurrentPage] = useState(1);

  /* Modais. */
  const [productToView, setProductToView] = useState<Product | null>(null);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  /* ------------------------------------------------------------------------
     Carga de dados
     ------------------------------------------------------------------------ */
  useEffect(() => {
    let isCancelled = false;

    async function loadData(): Promise<void> {
      try {
        const [loadedProducts, loadedCategories] = await Promise.all([
          getProducts({ includeInactive: true }),
          getCategories(true),
        ]);

        if (!isCancelled) {
          setProducts([...loadedProducts].sort((a, b) => a.id - b.id));
          setCategories(loadedCategories);
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : 'Não foi possível carregar os produtos.',
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

  // Esc fecha qualquer modal aberto (a exclusão em andamento não pode ser cancelada).
  useEffect(() => {
    if (!productToView && !productToDelete) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') {
        return;
      }

      setProductToView(null);

      if (!isDeleting) {
        setProductToDelete(null);
        setDeleteError(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [productToView, productToDelete, isDeleting]);

  /* ------------------------------------------------------------------------
     Derivações
     ------------------------------------------------------------------------ */
  const categoryNameById = useMemo<Map<number, string>>(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );

  const getCategoryName = (categoryId: number): string =>
    categoryNameById.get(categoryId) ?? '—';

  const filteredProducts = useMemo<Product[]>(() => {
    const normalizedSearch = normalizeText(appliedFilters.search);

    return products.filter((product) => {
      if (normalizedSearch && !normalizeText(product.name).includes(normalizedSearch)) {
        return false;
      }

      if (
        appliedFilters.categoryId !== ALL_CATEGORIES &&
        product.categoryId !== Number(appliedFilters.categoryId)
      ) {
        return false;
      }

      if (appliedFilters.status === 'active' && !product.isActive) {
        return false;
      }

      if (appliedFilters.status === 'inactive' && product.isActive) {
        return false;
      }

      return true;
    });
  }, [products, appliedFilters]);

  const totalProducts = filteredProducts.length;
  const totalPages = Math.max(1, Math.ceil(totalProducts / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  const pageProducts = useMemo<Product[]>(
    () => filteredProducts.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredProducts, safePage],
  );

  const rangeStart = totalProducts === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, totalProducts);

  /* ------------------------------------------------------------------------
     Handlers
     ------------------------------------------------------------------------ */
  const handleApplyFilters = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    setAppliedFilters({
      search: searchDraft.trim(),
      categoryId: categoryDraft,
      status: statusDraft,
    });
    setCurrentPage(1);
  };

  const handleChangeStatus = (value: string): void => {
    const selected = STATUS_OPTIONS.find((option) => option.value === value);

    if (selected) {
      setStatusDraft(selected.value);
    }
  };

  const handleCloseDeleteModal = (): void => {
    if (isDeleting) {
      return;
    }

    setProductToDelete(null);
    setDeleteError(null);
  };

  const handleConfirmDelete = async (): Promise<void> => {
    if (!productToDelete) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      await deleteProduct(productToDelete.id);
      setProducts((previous) => previous.filter((product) => product.id !== productToDelete.id));
      setProductToDelete(null);
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : 'Não foi possível excluir o produto.',
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEditFromModal = (product: Product): void => {
    setProductToView(null);
    navigate(`/admin/produtos/${product.id}/editar`);
  };

  /* ------------------------------------------------------------------------
     Render
     ------------------------------------------------------------------------ */
  return (
    <div className="produtos">
      <header className="produtos__header">
        <h2 className="produtos__title">Produtos</h2>
        <Button variant="primary" leftIcon={Plus} onClick={() => navigate('/admin/produtos/novo')}>
          Novo produto
        </Button>
      </header>

      <section className="produtos__card">
        {/* Filtros */}
        <form className="produtos-filters" onSubmit={handleApplyFilters}>
          <label className="produtos-filters__search">
            <Search className="produtos-filters__search-icon" aria-hidden="true" />
            <input
              type="search"
              className="produtos-filters__input"
              placeholder="Pesquisar produto..."
              aria-label="Pesquisar produto por nome"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
            />
          </label>

          <select
            className="produtos-filters__select"
            aria-label="Filtrar por categoria"
            value={categoryDraft}
            onChange={(event) => setCategoryDraft(event.target.value)}
          >
            <option value={ALL_CATEGORIES}>Categoria: Todas</option>
            {categories.map((category) => (
              <option key={category.id} value={String(category.id)}>
                {category.name}
              </option>
            ))}
          </select>

          <select
            className="produtos-filters__select"
            aria-label="Filtrar por status"
            value={statusDraft}
            onChange={(event) => handleChangeStatus(event.target.value)}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <div className="produtos-filters__submit">
            <Button type="submit" variant="primary">
              Filtrar
            </Button>
          </div>
        </form>

        {errorMessage && (
          <p className="produtos__feedback produtos__feedback--error" role="alert">
            {errorMessage}
          </p>
        )}

        {isLoading && !errorMessage && (
          <p className="produtos__feedback" role="status">
            Carregando produtos...
          </p>
        )}

        {!isLoading && !errorMessage && (
          <>
            {pageProducts.length === 0 ? (
              <p className="produtos__feedback">Nenhum produto encontrado.</p>
            ) : (
              <div className="produtos__table-wrapper">
                <table className="produtos-table">
                  <thead>
                    <tr className="produtos-table__head-row">
                      <th className="produtos-table__head-cell" scope="col">
                        ID
                      </th>
                      <th className="produtos-table__head-cell" scope="col">
                        Produto
                      </th>
                      <th className="produtos-table__head-cell" scope="col">
                        Categoria
                      </th>
                      <th className="produtos-table__head-cell" scope="col">
                        Preço
                      </th>
                      <th className="produtos-table__head-cell" scope="col">
                        Estoque
                      </th>
                      <th className="produtos-table__head-cell" scope="col">
                        Status
                      </th>
                      <th className="produtos-table__head-cell" scope="col">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageProducts.map((product) => (
                      <tr key={product.id} className="produtos-table__row">
                        <td className="produtos-table__cell produtos-table__cell--id">
                          {formatProductId(product.id)}
                        </td>
                        <td className="produtos-table__cell">
                          <div className="produtos-table__product">
                            <span className="produtos-table__thumb">
                              <img
                                className="produtos-table__thumb-image"
                                src={product.imageUrl}
                                alt=""
                                loading="lazy"
                              />
                            </span>
                            <span className="produtos-table__name">{product.name}</span>
                          </div>
                        </td>
                        <td className="produtos-table__cell">{getCategoryName(product.categoryId)}</td>
                        <td className="produtos-table__cell produtos-table__cell--price">
                          {formatCurrency(product.price)}
                        </td>
                        <td className="produtos-table__cell">
                          <span className={`produtos__stock-value ${getStockModifier(product.stock)}`}>
                            {product.stock}
                          </span>{' '}
                          <span className="produtos__stock-unit">un.</span>
                        </td>
                        <td className="produtos-table__cell">
                          <StatusBadge tone={product.isActive ? 'success' : 'neutral'}>
                            {product.isActive ? 'Ativo' : 'Inativo'}
                          </StatusBadge>
                        </td>
                        <td className="produtos-table__cell">
                          <div className="produtos-table__actions">
                            <Button
                              variant="outline-neutral"
                              size="sm"
                              leftIcon={Eye}
                              onClick={() => setProductToView(product)}
                            >
                              Ver
                            </Button>
                            <Button
                              variant="outline-neutral"
                              size="sm"
                              leftIcon={Pencil}
                              onClick={() => navigate(`/admin/produtos/${product.id}/editar`)}
                            >
                              Editar
                            </Button>
                            <Button
                              variant="outline-danger"
                              size="sm"
                              leftIcon={Trash2}
                              onClick={() => setProductToDelete(product)}
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

            <footer className="produtos__footer">
              <p className="produtos__summary">
                Exibindo {rangeStart}–{rangeEnd} de {totalProducts}{' '}
                {totalProducts === 1 ? 'produto' : 'produtos'}
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

      {/* Modal: visualização rápida */}
      {productToView && (
        <div
          className="produtos-modal"
          role="presentation"
          onClick={() => setProductToView(null)}
        >
          <div
            className="produtos-modal__dialog produtos-modal__dialog--wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="produtos-view-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="produtos-modal__media">
              <img
                className="produtos-modal__image"
                src={productToView.imageUrl}
                alt={productToView.name}
              />
            </div>

            <div className="produtos-modal__body">
              <div className="produtos-modal__heading">
                <h3 id="produtos-view-title" className="produtos-modal__title">
                  {productToView.name}
                </h3>
                <StatusBadge tone={productToView.isActive ? 'success' : 'neutral'}>
                  {productToView.isActive ? 'Ativo' : 'Inativo'}
                </StatusBadge>
              </div>

              <p className="produtos-modal__text">{productToView.shortDescription}</p>

              <dl className="produtos-modal__details">
                <div className="produtos-modal__detail">
                  <dt className="produtos-modal__detail-label">ID</dt>
                  <dd className="produtos-modal__detail-value">{formatProductId(productToView.id)}</dd>
                </div>
                <div className="produtos-modal__detail">
                  <dt className="produtos-modal__detail-label">SKU</dt>
                  <dd className="produtos-modal__detail-value">{productToView.sku}</dd>
                </div>
                <div className="produtos-modal__detail">
                  <dt className="produtos-modal__detail-label">Categoria</dt>
                  <dd className="produtos-modal__detail-value">
                    {getCategoryName(productToView.categoryId)}
                  </dd>
                </div>
                <div className="produtos-modal__detail">
                  <dt className="produtos-modal__detail-label">Marca</dt>
                  <dd className="produtos-modal__detail-value">{productToView.specs.brand}</dd>
                </div>
                <div className="produtos-modal__detail">
                  <dt className="produtos-modal__detail-label">Preço</dt>
                  <dd className="produtos-modal__detail-value">
                    {formatCurrency(productToView.price)}
                    {productToView.oldPrice !== null && (
                      <span className="produtos-modal__old-price">
                        {formatCurrency(productToView.oldPrice)}
                      </span>
                    )}
                  </dd>
                </div>
                <div className="produtos-modal__detail">
                  <dt className="produtos-modal__detail-label">Estoque</dt>
                  <dd className="produtos-modal__detail-value">
                    <span className={`produtos__stock-value ${getStockModifier(productToView.stock)}`}>
                      {productToView.stock}
                    </span>{' '}
                    <span className="produtos__stock-unit">un.</span>
                  </dd>
                </div>
                <div className="produtos-modal__detail">
                  <dt className="produtos-modal__detail-label">Avaliação</dt>
                  <dd className="produtos-modal__detail-value">
                    {productToView.reviewCount > 0
                      ? `${productToView.rating.toFixed(1).replace('.', ',')} (${productToView.reviewCount})`
                      : 'Sem avaliações'}
                  </dd>
                </div>
                <div className="produtos-modal__detail">
                  <dt className="produtos-modal__detail-label">Destaque</dt>
                  <dd className="produtos-modal__detail-value">
                    {productToView.isFeatured ? 'Sim' : 'Não'}
                  </dd>
                </div>
              </dl>

              <div className="produtos-modal__actions">
                <Button variant="outline-neutral" onClick={() => setProductToView(null)}>
                  Fechar
                </Button>
                <Button variant="primary" leftIcon={Pencil} onClick={() => handleEditFromModal(productToView)}>
                  Editar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: confirmação de exclusão */}
      {productToDelete && (
        <div className="produtos-modal" role="presentation" onClick={handleCloseDeleteModal}>
          <div
            className="produtos-modal__dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="produtos-delete-title"
            aria-describedby="produtos-delete-text"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="produtos-modal__body">
              <h3 id="produtos-delete-title" className="produtos-modal__title">
                Excluir produto
              </h3>
              <p id="produtos-delete-text" className="produtos-modal__text">
                Tem certeza que deseja excluir <strong>{productToDelete.name}</strong>? Esta ação
                não pode ser desfeita.
              </p>

              {deleteError && (
                <p className="produtos__feedback produtos__feedback--error" role="alert">
                  {deleteError}
                </p>
              )}

              <div className="produtos-modal__actions">
                <Button variant="outline-neutral" onClick={handleCloseDeleteModal} disabled={isDeleting}>
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
        </div>
      )}
    </div>
  );
}

export default Produtos;
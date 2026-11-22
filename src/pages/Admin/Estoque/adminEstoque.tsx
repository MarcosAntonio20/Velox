/**
 * VELOX — Admin / Estoque (rota "/admin/estoque").
 *
 * Renderizada dentro do AdminLayout (via <Outlet />), por isso não usa layout próprio.
 *
 * Regras:
 * - Status: estoque 0 = "Esgotado"; estoque <= mínimo = "Estoque baixo"; senão "Disponível".
 * - O tipo Product não possui estoque mínimo: o mínimo de cada produto é guardado no
 *   localStorage (padrão: DEFAULT_MIN_STOCK) e pode ser alterado no modal de ajuste.
 * - O ajuste de quantidade usa adjustProductStock(productId, delta):
 *     "Somar"   -> delta = quantidade informada;
 *     "Definir" -> delta = quantidade informada - estoque atual.
 * - Busca e filtros (categoria e nível de estoque) são aplicados no botão "Filtrar".
 */

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Pencil, Search } from 'lucide-react';
import { Button } from '../../../components/Ui/Button/Button';
import { Pagination } from '../../../components/Ui/Pagination/Pagination';
import { StatusBadge, type BadgeTone } from '../../../components/Ui/StatusBadge/StatusBadge';
import {
  adjustProductStock,
  getCategories,
  getProducts,
} from '../../../services/productService';
import { STORAGE_PREFIX, readStorage, writeStorage } from '../../../services/storage';
import type { Category, Product } from '../../../types';
import { normalizeText } from '../../../utils/helpers';
import './adminEstoque.css';

/** Quantidade de produtos por página. */
const PAGE_SIZE = 6;

/** Estoque mínimo usado quando o produto ainda não tem um mínimo definido. */
const DEFAULT_MIN_STOCK = 10;

/** Chave do localStorage com os mínimos por produto ({ [productId]: mínimo }). */
const MIN_STOCK_STORAGE_KEY = `${STORAGE_PREFIX}stock-minimums`;

/** Tempo (ms) que a mensagem de sucesso fica visível. */
const FEEDBACK_DURATION_MS = 4000;

const ALL_CATEGORIES = 'all';

type StockLevel = 'available' | 'low' | 'out';
type LevelFilter = 'all' | StockLevel;
type AdjustMode = 'add' | 'set';

interface LevelMeta {
  label: string;
  tone: BadgeTone;
}

const LEVEL_META: Record<StockLevel, LevelMeta> = {
  available: { label: 'Disponível', tone: 'success' },
  low: { label: 'Estoque baixo', tone: 'warning' },
  out: { label: 'Esgotado', tone: 'danger' },
};

const LEVEL_ORDER: StockLevel[] = ['available', 'low', 'out'];

interface LevelFilterOption {
  value: LevelFilter;
  label: string;
}

const LEVEL_FILTER_OPTIONS: LevelFilterOption[] = [
  { value: 'all', label: 'Estoque: Todos' },
  { value: 'available', label: 'Estoque: Disponível' },
  { value: 'low', label: 'Estoque: Baixo' },
  { value: 'out', label: 'Estoque: Esgotado' },
];

interface AppliedFilters {
  search: string;
  categoryId: string;
  level: LevelFilter;
}

const INITIAL_FILTERS: AppliedFilters = {
  search: '',
  categoryId: ALL_CATEGORIES,
  level: 'all',
};

type MinimumsMap = Record<number, number>;

/* ==========================================================================
   Helpers
   ========================================================================== */

function getStockLevel(stock: number, minimum: number): StockLevel {
  if (stock <= 0) {
    return 'out';
  }

  if (stock <= minimum) {
    return 'low';
  }

  return 'available';
}

/** Lê os mínimos salvos, descartando valores inválidos. */
function loadMinimums(): MinimumsMap {
  const stored = readStorage<Record<string, number>>(MIN_STOCK_STORAGE_KEY, () => ({}));
  const minimums: MinimumsMap = {};

  Object.entries(stored).forEach(([productId, value]) => {
    if (Number.isInteger(value) && value >= 0) {
      minimums[Number(productId)] = value;
    }
  });

  return minimums;
}

/** Converte um texto em inteiro >= 0, ou null se for inválido. */
function parseWholeNumber(value: string): number | null {
  const trimmed = value.trim();

  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

/* ==========================================================================
   Tela
   ========================================================================== */

export function AdminEstoque() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [minimums, setMinimums] = useState<MinimumsMap>(loadMinimums);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  /* Filtros: o que está sendo digitado x o que foi aplicado no "Filtrar". */
  const [searchDraft, setSearchDraft] = useState('');
  const [categoryDraft, setCategoryDraft] = useState(ALL_CATEGORIES);
  const [levelDraft, setLevelDraft] = useState<LevelFilter>('all');
  const [appliedFilters, setAppliedFilters] = useState<AppliedFilters>(INITIAL_FILTERS);
  const [currentPage, setCurrentPage] = useState(1);

  /* Modal de ajuste. */
  const [productToAdjust, setProductToAdjust] = useState<Product | null>(null);
  const [adjustMode, setAdjustMode] = useState<AdjustMode>('add');
  const [quantityDraft, setQuantityDraft] = useState('');
  const [minimumDraft, setMinimumDraft] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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
            error instanceof Error ? error.message : 'Não foi possível carregar o estoque.',
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

  // Esc fecha o modal (exceto durante o salvamento).
  useEffect(() => {
    if (!productToAdjust) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !isSaving) {
        setProductToAdjust(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [productToAdjust, isSaving]);

  /* ------------------------------------------------------------------------
     Derivações
     ------------------------------------------------------------------------ */
  const getMinimum = (productId: number): number =>
    minimums[productId] ?? DEFAULT_MIN_STOCK;

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

      if (appliedFilters.level !== 'all') {
        const minimum = minimums[product.id] ?? DEFAULT_MIN_STOCK;

        if (getStockLevel(product.stock, minimum) !== appliedFilters.level) {
          return false;
        }
      }

      return true;
    });
  }, [products, minimums, appliedFilters]);

  const totalProducts = filteredProducts.length;
  const totalPages = Math.max(1, Math.ceil(totalProducts / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  const pageProducts = useMemo<Product[]>(
    () => filteredProducts.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredProducts, safePage],
  );

  const rangeStart = totalProducts === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, totalProducts);

  // Pré-visualização do estoque após o ajuste (null = quantidade ainda inválida/vazia).
  const parsedQuantity = parseWholeNumber(quantityDraft);
  let stockPreview: number | null = null;

  if (productToAdjust) {
    if (quantityDraft.trim() === '') {
      stockPreview = productToAdjust.stock;
    } else if (parsedQuantity !== null) {
      stockPreview =
        adjustMode === 'add' ? productToAdjust.stock + parsedQuantity : parsedQuantity;
    }
  }

  /* ------------------------------------------------------------------------
     Handlers
     ------------------------------------------------------------------------ */
  const handleApplyFilters = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    setAppliedFilters({
      search: searchDraft.trim(),
      categoryId: categoryDraft,
      level: levelDraft,
    });
    setCurrentPage(1);
  };

  const handleChangeLevel = (value: string): void => {
    const selected = LEVEL_FILTER_OPTIONS.find((option) => option.value === value);

    if (selected) {
      setLevelDraft(selected.value);
    }
  };

  const handleOpenAdjust = (product: Product): void => {
    setProductToAdjust(product);
    setAdjustMode('add');
    setQuantityDraft('');
    setMinimumDraft(String(getMinimum(product.id)));
    setModalError(null);
  };

  const handleCloseAdjust = (): void => {
    if (!isSaving) {
      setProductToAdjust(null);
    }
  };

  const handleChangeMode = (mode: AdjustMode): void => {
    setAdjustMode(mode);
    setQuantityDraft('');
    setModalError(null);
  };

  const handleSubmitAdjust = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (!productToAdjust || isSaving) {
      return;
    }

    const hasQuantity = quantityDraft.trim() !== '';
    const quantity = parseWholeNumber(quantityDraft);
    const minimum = parseWholeNumber(minimumDraft);

    if (hasQuantity && quantity === null) {
      setModalError('A quantidade deve ser um número inteiro maior ou igual a zero.');
      return;
    }

    if (minimum === null) {
      setModalError('O estoque mínimo deve ser um número inteiro maior ou igual a zero.');
      return;
    }

    let delta = 0;

    if (hasQuantity && quantity !== null) {
      delta = adjustMode === 'add' ? quantity : quantity - productToAdjust.stock;
    }

    const currentMinimum = getMinimum(productToAdjust.id);
    const minimumChanged = minimum !== currentMinimum;

    if (delta === 0 && !minimumChanged) {
      setModalError('Nenhuma alteração para salvar.');
      return;
    }

    setIsSaving(true);
    setModalError(null);

    try {
      let updatedProduct: Product = productToAdjust;

      if (delta !== 0) {
        updatedProduct = await adjustProductStock(productToAdjust.id, delta);
      }

      if (minimumChanged) {
        const nextMinimums: MinimumsMap = { ...minimums, [productToAdjust.id]: minimum };

        setMinimums(nextMinimums);
        writeStorage(MIN_STOCK_STORAGE_KEY, nextMinimums);
      }

      setProducts((previous) =>
        previous.map((product) => (product.id === updatedProduct.id ? updatedProduct : product)),
      );
      setSuccessMessage(
        delta !== 0
          ? `Estoque de "${updatedProduct.name}" atualizado para ${updatedProduct.stock} un.`
          : `Estoque mínimo de "${updatedProduct.name}" atualizado para ${minimum} un.`,
      );
      setProductToAdjust(null);
    } catch (error) {
      setModalError(
        error instanceof Error ? error.message : 'Não foi possível ajustar o estoque.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  /* ------------------------------------------------------------------------
     Render
     ------------------------------------------------------------------------ */
  return (
    <div className="admin-estoque">
      <header className="admin-estoque__header">
        <h2 className="admin-estoque__title">Estoque</h2>

        <ul className="admin-estoque__legend" aria-label="Legenda de status">
          {LEVEL_ORDER.map((level) => (
            <li key={level} className="admin-estoque__legend-item">
              <span
                className={`admin-estoque__dot admin-estoque__dot--${level}`}
                aria-hidden="true"
              />
              {LEVEL_META[level].label}
            </li>
          ))}
        </ul>
      </header>

      <section className="admin-estoque__card">
        {/* Filtros */}
        <form className="admin-estoque-filters" onSubmit={handleApplyFilters}>
          <label className="admin-estoque-filters__search">
            <Search className="admin-estoque-filters__search-icon" aria-hidden="true" />
            <input
              type="search"
              className="admin-estoque-filters__input"
              placeholder="Pesquisar produto..."
              aria-label="Pesquisar produto por nome"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
            />
          </label>

          <select
            className="admin-estoque-filters__select"
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
            className="admin-estoque-filters__select"
            aria-label="Filtrar por nível de estoque"
            value={levelDraft}
            onChange={(event) => handleChangeLevel(event.target.value)}
          >
            {LEVEL_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <div className="admin-estoque-filters__submit">
            <Button type="submit" variant="primary">
              Filtrar
            </Button>
          </div>
        </form>

        {successMessage && (
          <p className="admin-estoque__feedback admin-estoque__feedback--success" role="status">
            {successMessage}
          </p>
        )}

        {errorMessage && (
          <p className="admin-estoque__feedback admin-estoque__feedback--error" role="alert">
            {errorMessage}
          </p>
        )}

        {isLoading && !errorMessage && (
          <p className="admin-estoque__feedback" role="status">
            Carregando estoque...
          </p>
        )}

        {!isLoading && !errorMessage && (
          <>
            {pageProducts.length === 0 ? (
              <p className="admin-estoque__feedback">Nenhum produto encontrado.</p>
            ) : (
              <div className="admin-estoque__table-wrapper">
                <table className="admin-estoque-table">
                  <thead>
                    <tr className="admin-estoque-table__head-row">
                      <th className="admin-estoque-table__head-cell" scope="col">
                        Produto
                      </th>
                      <th className="admin-estoque-table__head-cell" scope="col">
                        Categoria
                      </th>
                      <th className="admin-estoque-table__head-cell" scope="col">
                        Estoque atual
                      </th>
                      <th className="admin-estoque-table__head-cell" scope="col">
                        Estoque mínimo
                      </th>
                      <th className="admin-estoque-table__head-cell" scope="col">
                        Status
                      </th>
                      <th className="admin-estoque-table__head-cell" scope="col">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageProducts.map((product) => {
                      const minimum = getMinimum(product.id);
                      const level = getStockLevel(product.stock, minimum);

                      return (
                        <tr key={product.id} className="admin-estoque-table__row">
                          <td className="admin-estoque-table__cell">
                            <div className="admin-estoque-table__product">
                              <span className="admin-estoque-table__thumb">
                                <img
                                  className="admin-estoque-table__thumb-image"
                                  src={product.imageUrl}
                                  alt=""
                                  loading="lazy"
                                />
                              </span>
                              <span className="admin-estoque-table__name">{product.name}</span>
                            </div>
                          </td>
                          <td className="admin-estoque-table__cell">
                            {getCategoryName(product.categoryId)}
                          </td>
                          <td className="admin-estoque-table__cell">
                            <span
                              className={`admin-estoque__stock-value admin-estoque__stock-value--${level}`}
                            >
                              {product.stock}
                            </span>{' '}
                            <span className="admin-estoque__stock-unit">un.</span>
                          </td>
                          <td className="admin-estoque-table__cell admin-estoque-table__cell--minimum">
                            {minimum} un.
                          </td>
                          <td className="admin-estoque-table__cell">
                            <StatusBadge tone={LEVEL_META[level].tone}>
                              <span className="admin-estoque__badge-content">
                                <span
                                  className={`admin-estoque__dot admin-estoque__dot--${level}`}
                                  aria-hidden="true"
                                />
                                {LEVEL_META[level].label}
                              </span>
                            </StatusBadge>
                          </td>
                          <td className="admin-estoque-table__cell">
                            <Button
                              variant="outline-neutral"
                              size="sm"
                              leftIcon={Pencil}
                              onClick={() => handleOpenAdjust(product)}
                            >
                              Ajustar estoque
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <footer className="admin-estoque__footer">
              <p className="admin-estoque__summary">
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

      {/* Modal: ajustar estoque */}
      {productToAdjust && (
        <div className="admin-estoque-modal" role="presentation" onClick={handleCloseAdjust}>
          <form
            className="admin-estoque-modal__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-estoque-modal-title"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => void handleSubmitAdjust(event)}
            noValidate
          >
            <h3 id="admin-estoque-modal-title" className="admin-estoque-modal__title">
              Ajustar estoque
            </h3>

            <div className="admin-estoque-modal__product">
              <span className="admin-estoque-table__thumb">
                <img
                  className="admin-estoque-table__thumb-image"
                  src={productToAdjust.imageUrl}
                  alt=""
                />
              </span>
              <div className="admin-estoque-modal__product-text">
                <span className="admin-estoque-table__name">{productToAdjust.name}</span>
                <span className="admin-estoque-modal__product-info">
                  Estoque atual: <strong>{productToAdjust.stock} un.</strong> · Mínimo:{' '}
                  <strong>{getMinimum(productToAdjust.id)} un.</strong>
                </span>
              </div>
            </div>

            <div className="admin-estoque-modal__modes" role="group" aria-label="Tipo de ajuste">
              <button
                type="button"
                className={
                  adjustMode === 'add'
                    ? 'admin-estoque-modal__mode admin-estoque-modal__mode--active'
                    : 'admin-estoque-modal__mode'
                }
                aria-pressed={adjustMode === 'add'}
                onClick={() => handleChangeMode('add')}
              >
                Somar ao estoque
              </button>
              <button
                type="button"
                className={
                  adjustMode === 'set'
                    ? 'admin-estoque-modal__mode admin-estoque-modal__mode--active'
                    : 'admin-estoque-modal__mode'
                }
                aria-pressed={adjustMode === 'set'}
                onClick={() => handleChangeMode('set')}
              >
                Definir quantidade
              </button>
            </div>

            <div className="admin-estoque-modal__field">
              <label className="admin-estoque-modal__label" htmlFor="admin-estoque-quantity">
                {adjustMode === 'add' ? 'Unidades a somar' : 'Nova quantidade em estoque'}
              </label>
              <input
                id="admin-estoque-quantity"
                type="text"
                inputMode="numeric"
                className="admin-estoque-modal__input"
                placeholder="0"
                value={quantityDraft}
                onChange={(event) => setQuantityDraft(event.target.value)}
                disabled={isSaving}
                autoFocus
              />
              <span className="admin-estoque-modal__hint">
                {stockPreview !== null ? (
                  <>
                    Estoque após o ajuste: <strong>{stockPreview} un.</strong>
                  </>
                ) : (
                  'Informe um número inteiro.'
                )}
              </span>
            </div>

            <div className="admin-estoque-modal__field">
              <label className="admin-estoque-modal__label" htmlFor="admin-estoque-minimum">
                Estoque mínimo
              </label>
              <input
                id="admin-estoque-minimum"
                type="text"
                inputMode="numeric"
                className="admin-estoque-modal__input"
                value={minimumDraft}
                onChange={(event) => setMinimumDraft(event.target.value)}
                disabled={isSaving}
              />
              <span className="admin-estoque-modal__hint">
                Abaixo ou igual a este valor, o produto aparece como &quot;Estoque baixo&quot;.
              </span>
            </div>

            {modalError && (
              <p className="admin-estoque__feedback admin-estoque__feedback--error" role="alert">
                {modalError}
              </p>
            )}

            <div className="admin-estoque-modal__actions">
              <Button type="button" variant="outline-neutral" onClick={handleCloseAdjust} disabled={isSaving}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" disabled={isSaving}>
                {isSaving ? 'Salvando...' : 'Salvar ajuste'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default AdminEstoque;
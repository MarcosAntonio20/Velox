/**
 * VELOX — Tela Catálogo (rota "/catalogo").
 *
 * Parâmetros de URL:
 * - `?categoria=<slug>`: filtra pela categoria (título e descrição vêm dela).
 * - `?busca=<texto>`: filtra pelo texto de busca.
 *
 * Filtros laterais (marca, faixa de preço, avaliação, disponibilidade) são
 * aplicados no cliente sobre os produtos carregados do productService.
 */

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { StoreLayout } from '../../layouts/StoreLayout/StoreLayout';
import { Breadcrumb } from '../../components/Ui/Breadcrumb/Breadcrumb';
import { Button } from '../../components/Ui/Button/Button';
import { Pagination } from '../../components/Ui/Pagination/Pagination';
import { ProductCard } from '../../components/Ui//ProductCard/ProductCard';
import { StarRating } from '../../components/Ui/StarRating/StarRating';
import { useCart } from '../../context/CartContext';
import {
  getCategoryBySlug,
  getProducts,
  type ProductSortOption,
} from '../../services/productService';
import type { Category, Product } from '../../types';
import './catalogo.css';

/** Quantidade de produtos por página (grade 3 x 3). */
const PAGE_SIZE = 9;

interface SortOptionItem {
  value: ProductSortOption;
  label: string;
}

const SORT_OPTIONS: SortOptionItem[] = [
  { value: 'featured', label: 'Mais relevantes' },
  { value: 'newest', label: 'Mais recentes' },
  { value: 'priceAsc', label: 'Menor preço' },
  { value: 'priceDesc', label: 'Maior preço' },
  { value: 'rating', label: 'Melhor avaliados' },
  { value: 'name', label: 'Nome (A-Z)' },
];

interface RatingOptionItem {
  value: number;
  suffix: string;
}

const RATING_OPTIONS: RatingOptionItem[] = [
  { value: 5, suffix: '' },
  { value: 4, suffix: 'ou mais' },
  { value: 3, suffix: 'ou mais' },
];

/** Faixa de preço aplicada. `null` significa "sem limite". */
interface AppliedPriceRange {
  min: number | null;
  max: number | null;
}

const EMPTY_PRICE_RANGE: AppliedPriceRange = { min: null, max: null };

/** Converte o texto digitado em número válido (>= 0) ou null. */
function parsePriceInput(value: string): number | null {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function Catalogo() {
  const { addToCart } = useCart();
  const [searchParams] = useSearchParams();

  const categorySlug = searchParams.get('categoria');
  const searchText = searchParams.get('busca');

  /* ------------------------------------------------------------------------
     Dados
     ------------------------------------------------------------------------ */
  const [category, setCategory] = useState<Category | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCategoryNotFound, setIsCategoryNotFound] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /* ------------------------------------------------------------------------
     Ordenação, filtros e paginação
     ------------------------------------------------------------------------ */
  const [sortBy, setSortBy] = useState<ProductSortOption>('featured');
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [minPriceDraft, setMinPriceDraft] = useState('');
  const [maxPriceDraft, setMaxPriceDraft] = useState('');
  const [appliedPrice, setAppliedPrice] = useState<AppliedPriceRange>(EMPTY_PRICE_RANGE);
  const [minRating, setMinRating] = useState<number | null>(null);
  const [onlyInStock, setOnlyInStock] = useState(true);
  const [onlyDiscount, setOnlyDiscount] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    let isCancelled = false;

    async function loadCatalog(): Promise<void> {
      setIsLoading(true);
      setErrorMessage(null);
      setIsCategoryNotFound(false);

      try {
        let currentCategory: Category | null = null;

        if (categorySlug) {
          currentCategory = await getCategoryBySlug(categorySlug);

          if (!currentCategory || !currentCategory.isActive) {
            if (!isCancelled) {
              setCategory(null);
              setProducts([]);
              setIsCategoryNotFound(true);
            }
            return;
          }
        }

        const loadedProducts = await getProducts({
          categoryId: currentCategory ? currentCategory.id : undefined,
          search: searchText ?? undefined,
          sortBy,
        });

        if (!isCancelled) {
          setCategory(currentCategory);
          setProducts(loadedProducts);
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

    void loadCatalog();

    return () => {
      isCancelled = true;
    };
  }, [categorySlug, searchText, sortBy]);

  // Qualquer mudança de filtro, ordenação ou categoria volta para a primeira página.
  useEffect(() => {
    setCurrentPage(1);
  }, [
    selectedBrands,
    appliedPrice,
    minRating,
    onlyInStock,
    onlyDiscount,
    sortBy,
    categorySlug,
    searchText,
  ]);

  /* ------------------------------------------------------------------------
     Derivações
     ------------------------------------------------------------------------ */
  const availableBrands = useMemo<string[]>(
    () =>
      Array.from(new Set(products.map((product) => product.specs.brand))).sort((a, b) =>
        a.localeCompare(b, 'pt-BR'),
      ),
    [products],
  );

  const filteredProducts = useMemo<Product[]>(
    () =>
      products.filter((product) => {
        if (selectedBrands.length > 0 && !selectedBrands.includes(product.specs.brand)) {
          return false;
        }

        if (appliedPrice.min !== null && product.price < appliedPrice.min) {
          return false;
        }

        if (appliedPrice.max !== null && product.price > appliedPrice.max) {
          return false;
        }

        if (minRating !== null && product.rating < minRating) {
          return false;
        }

        if (onlyInStock && product.stock <= 0) {
          return false;
        }

        // oldPrice é `number | null`: produto com desconto = oldPrice preenchido.
        if (onlyDiscount && product.oldPrice === null) {
          return false;
        }

        return true;
      }),
    [products, selectedBrands, appliedPrice, minRating, onlyInStock, onlyDiscount],
  );

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  const pageProducts = useMemo<Product[]>(
    () => filteredProducts.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredProducts, safePage],
  );

  const hasActiveFilters =
    selectedBrands.length > 0 ||
    appliedPrice.min !== null ||
    appliedPrice.max !== null ||
    minRating !== null ||
    onlyDiscount ||
    !onlyInStock;

  const pageTitle = category
    ? category.name
    : searchText
      ? `Resultados para "${searchText}"`
      : 'Todos os Produtos';

  const pageDescription = category ? category.description : null;

  const productsLabel = filteredProducts.length === 1 ? 'produto' : 'produtos';

  /* ------------------------------------------------------------------------
     Handlers
     ------------------------------------------------------------------------ */
  const handleToggleBrand = (brand: string): void => {
    setSelectedBrands((previous) =>
      previous.includes(brand) ? previous.filter((item) => item !== brand) : [...previous, brand],
    );
  };

  const handleApplyPrice = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    let min = parsePriceInput(minPriceDraft);
    let max = parsePriceInput(maxPriceDraft);

    if (min !== null && max !== null && min > max) {
      [min, max] = [max, min];
      setMinPriceDraft(String(min));
      setMaxPriceDraft(String(max));
    }

    setAppliedPrice({ min, max });
  };

  const handleClearFilters = (): void => {
    setSelectedBrands([]);
    setMinPriceDraft('');
    setMaxPriceDraft('');
    setAppliedPrice(EMPTY_PRICE_RANGE);
    setMinRating(null);
    setOnlyInStock(true);
    setOnlyDiscount(false);
  };

  const handleChangeSort = (value: string): void => {
    const selected = SORT_OPTIONS.find((option) => option.value === value);

    if (selected) {
      setSortBy(selected.value);
    }
  };

  const handleAddToCart = useCallback(
    (product: Product): void => {
      addToCart(product, 1);
    },
    [addToCart],
  );

  /* ------------------------------------------------------------------------
     Render
     ------------------------------------------------------------------------ */
  return (
    <StoreLayout>
      <div className="catalogo">
        <header className="catalogo__header">
          <Breadcrumb items={[{ label: 'Home', to: '/' }, { label: pageTitle }]} />
          <h1 className="catalogo__title">{pageTitle}</h1>
          {pageDescription && <p className="catalogo__description">{pageDescription}</p>}
        </header>

        {errorMessage && (
          <p className="catalogo__feedback catalogo__feedback--error" role="alert">
            {errorMessage}
          </p>
        )}

        {isCategoryNotFound ? (
          <p className="catalogo__feedback">Categoria não encontrada.</p>
        ) : (
          <div className="catalogo__body">
            {/* Filtros */}
            <aside className="catalogo-filters" aria-label="Filtros">
              {availableBrands.length > 0 && (
                <fieldset className="catalogo-filters__group">
                  <legend className="catalogo-filters__title">Marca</legend>
                  {availableBrands.map((brand) => (
                    <label key={brand} className="catalogo-filters__option">
                      <input
                        type="checkbox"
                        className="catalogo-filters__checkbox"
                        checked={selectedBrands.includes(brand)}
                        onChange={() => handleToggleBrand(brand)}
                      />
                      <span className="catalogo-filters__label">{brand}</span>
                    </label>
                  ))}
                </fieldset>
              )}

              <form className="catalogo-filters__group" onSubmit={handleApplyPrice}>
                <h2 className="catalogo-filters__title">Faixa de preço</h2>
                <div className="catalogo-filters__price">
                  <input
                    type="number"
                    min={0}
                    inputMode="decimal"
                    className="catalogo-filters__input"
                    placeholder="R$ 0"
                    aria-label="Preço mínimo"
                    value={minPriceDraft}
                    onChange={(event) => setMinPriceDraft(event.target.value)}
                  />
                  <input
                    type="number"
                    min={0}
                    inputMode="decimal"
                    className="catalogo-filters__input"
                    placeholder="R$ 500"
                    aria-label="Preço máximo"
                    value={maxPriceDraft}
                    onChange={(event) => setMaxPriceDraft(event.target.value)}
                  />
                </div>
                <Button type="submit">Aplicar</Button>
              </form>

              <fieldset className="catalogo-filters__group">
                <legend className="catalogo-filters__title">Avaliação</legend>
                {RATING_OPTIONS.map((option) => (
                  <label key={option.value} className="catalogo-filters__option">
                    <input
                      type="radio"
                      name="catalogo-rating"
                      className="catalogo-filters__radio"
                      checked={minRating === option.value}
                      onChange={() => setMinRating(option.value)}
                    />
                    <StarRating rating={option.value} />
                    {option.suffix && (
                      <span className="catalogo-filters__label">{option.suffix}</span>
                    )}
                  </label>
                ))}
              </fieldset>

              <fieldset className="catalogo-filters__group">
                <legend className="catalogo-filters__title">Disponibilidade</legend>
                <label className="catalogo-filters__option">
                  <input
                    type="checkbox"
                    className="catalogo-filters__checkbox"
                    checked={onlyInStock}
                    onChange={(event) => setOnlyInStock(event.target.checked)}
                  />
                  <span className="catalogo-filters__label">Em estoque</span>
                </label>
                <label className="catalogo-filters__option">
                  <input
                    type="checkbox"
                    className="catalogo-filters__checkbox"
                    checked={onlyDiscount}
                    onChange={(event) => setOnlyDiscount(event.target.checked)}
                  />
                  <span className="catalogo-filters__label">Somente com desconto</span>
                </label>
              </fieldset>

              {hasActiveFilters && (
                <button
                  type="button"
                  className="catalogo-filters__clear"
                  onClick={handleClearFilters}
                >
                  Limpar filtros
                </button>
              )}
            </aside>

            {/* Resultados */}
            <section className="catalogo-results" aria-label="Produtos">
              <div className="catalogo-results__toolbar">
                <p className="catalogo-results__count">
                  <strong>{filteredProducts.length}</strong> {productsLabel}
                </p>

                <select
                  className="catalogo-results__sort"
                  aria-label="Ordenar produtos"
                  value={sortBy}
                  onChange={(event) => handleChangeSort(event.target.value)}
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      Ordenar por: {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {isLoading && <p className="catalogo__feedback">Carregando...</p>}

              {!isLoading && pageProducts.length === 0 && (
                <div className="catalogo-results__empty">
                  <p className="catalogo-results__empty-text">
                    Nenhum produto encontrado com os filtros selecionados.
                  </p>
                  {hasActiveFilters && <Button onClick={handleClearFilters}>Limpar filtros</Button>}
                </div>
              )}

              {!isLoading && pageProducts.length > 0 && (
                <ul className="catalogo-results__grid">
                  {pageProducts.map((product) => (
                    <li key={product.id} className="catalogo-results__item">
                      <ProductCard product={product} onAddToCart={handleAddToCart} />
                    </li>
                  ))}
                </ul>
              )}

              {totalPages > 1 && (
                <div className="catalogo-results__pagination">
                  <Pagination
                    currentPage={safePage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                  />
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </StoreLayout>
  );
}

export default Catalogo;
/**
 * VELOX — Tela Busca (rota "/busca?q=<texto>").
 *
 * A pesquisa exige que TODOS os termos digitados apareçam (em qualquer ordem,
 * sem diferenciar acentos/maiúsculas) em nome, descrição curta, SKU, marca,
 * modelo ou nome da categoria do produto. Os filtros laterais são aplicados
 * sobre o resultado da busca, no cliente.
 */

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { StoreLayout } from '../../layouts/StoreLayout/StoreLayout';
import { Button } from '../../components/Ui/Button/Button';
import { Pagination } from '../../components/Ui/Pagination/Pagination';
import { ProductCard } from '../../components/Ui/ProductCard/ProductCard';
import { StarRating } from '../../components/Ui/StarRating/StarRating';
import {
  getCategories,
  getProducts,
  type ProductSortOption,
} from '../../services/productService';
import type { Category, Product } from '../../types';
import { normalizeText } from '../../utils/helpers';
import './busca.css';

/** Quantidade de produtos por página (grade 3 x 2). */
const PAGE_SIZE = 6;

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

/** Quebra o texto pesquisado em termos normalizados. */
function splitSearchTerms(text: string): string[] {
  return normalizeText(text)
    .split(/\s+/)
    .filter((term) => term.length > 0);
}

export function Busca() {
  const [searchParams] = useSearchParams();

  const query = (searchParams.get('q') ?? '').trim();

  /* ------------------------------------------------------------------------
     Dados
     ------------------------------------------------------------------------ */
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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

    async function loadProducts(): Promise<void> {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const [loadedProducts, loadedCategories] = await Promise.all([
          getProducts({ sortBy }),
          getCategories(),
        ]);

        if (!isCancelled) {
          setAllProducts(loadedProducts);
          setCategories(loadedCategories);
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : 'Não foi possível realizar a busca.',
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadProducts();

    return () => {
      isCancelled = true;
    };
  }, [sortBy]);

  // Nova pesquisa, filtro ou ordenação volta para a primeira página.
  useEffect(() => {
    setCurrentPage(1);
  }, [query, selectedBrands, appliedPrice, minRating, onlyInStock, onlyDiscount, sortBy]);

  /* ------------------------------------------------------------------------
     Derivações
     ------------------------------------------------------------------------ */
  const searchResults = useMemo<Product[]>(() => {
    const terms = splitSearchTerms(query);

    if (terms.length === 0) {
      return [];
    }

    const categoryNameById = new Map<number, string>(
      categories.map((category) => [category.id, category.name]),
    );

    const matches: { product: Product; nameScore: number }[] = [];

    allProducts.forEach((product) => {
      const normalizedName = normalizeText(product.name);
      const haystack = normalizeText(
        [
          product.name,
          product.shortDescription,
          product.sku,
          product.specs.brand,
          product.specs.model,
          categoryNameById.get(product.categoryId) ?? '',
        ].join(' '),
      );

      if (!terms.every((term) => haystack.includes(term))) {
        return;
      }

      matches.push({
        product,
        nameScore: terms.every((term) => normalizedName.includes(term)) ? 2 : 1,
      });
    });

    // Em "Mais relevantes", quem contém os termos no nome vem primeiro
    // (a ordenação é estável: a ordem do service é mantida dentro de cada grupo).
    if (sortBy === 'featured') {
      matches.sort((a, b) => b.nameScore - a.nameScore);
    }

    return matches.map((match) => match.product);
  }, [allProducts, categories, query, sortBy]);

  const availableBrands = useMemo<string[]>(
    () =>
      Array.from(new Set(searchResults.map((product) => product.specs.brand))).sort((a, b) =>
        a.localeCompare(b, 'pt-BR'),
      ),
    [searchResults],
  );

  const filteredProducts = useMemo<Product[]>(
    () =>
      searchResults.filter((product) => {
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
    [searchResults, selectedBrands, appliedPrice, minRating, onlyInStock, onlyDiscount],
  );

  const totalResults = filteredProducts.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  const pageProducts = useMemo<Product[]>(
    () => filteredProducts.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredProducts, safePage],
  );

  const rangeStart = totalResults === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, totalResults);

  const hasQuery = query.length > 0;

  const hasActiveFilters =
    selectedBrands.length > 0 ||
    appliedPrice.min !== null ||
    appliedPrice.max !== null ||
    minRating !== null ||
    onlyDiscount ||
    !onlyInStock;

  const resultsLabel = totalResults === 1 ? 'produto encontrado' : 'produtos encontrados';

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

  /* ------------------------------------------------------------------------
     Render
     ------------------------------------------------------------------------ */
  return (
    <StoreLayout>
      <div className="busca">
        <header className="busca__header">
          <h1 className="busca__title">
            {hasQuery ? `Resultados para: ${query}` : 'Buscar produtos'}
          </h1>
          <p className="busca__subtitle">
            {hasQuery
              ? `${totalResults} ${resultsLabel}`
              : 'Digite um termo na busca para encontrar produtos.'}
          </p>
        </header>

        {errorMessage && (
          <p className="busca__feedback busca__feedback--error" role="alert">
            {errorMessage}
          </p>
        )}

        {hasQuery && (
          <div className="busca__body">
            {/* Filtros */}
            <aside className="busca-filters" aria-label="Filtros">
              {availableBrands.length > 0 && (
                <fieldset className="busca-filters__group">
                  <legend className="busca-filters__title">Marca</legend>
                  {availableBrands.map((brand) => (
                    <label key={brand} className="busca-filters__option">
                      <input
                        type="checkbox"
                        className="busca-filters__checkbox"
                        checked={selectedBrands.includes(brand)}
                      />
                      <span className="busca-filters__label">{brand}</span>
                    </label>
                  ))}
                </fieldset>
              )}

              <form className="busca-filters__group" onSubmit={handleApplyPrice}>
                <h2 className="busca-filters__title">Faixa de preço</h2>
                <div className="busca-filters__price">
                  <input
                    type="number"
                    min={0}
                    inputMode="decimal"
                    className="busca-filters__input"
                    placeholder="R$ 0"
                    aria-label="Preço mínimo"
                    value={minPriceDraft}
                    onChange={(event) => setMinPriceDraft(event.target.value)}
                  />
                  <input
                    type="number"
                    min={0}
                    inputMode="decimal"
                    className="busca-filters__input"
                    placeholder="R$ 500"
                    aria-label="Preço máximo"
                    value={maxPriceDraft}
                    onChange={(event) => setMaxPriceDraft(event.target.value)}
                  />
                </div>
                <Button type="submit">Aplicar</Button>
              </form>

              <fieldset className="busca-filters__group">
                <legend className="busca-filters__title">Avaliação</legend>
                {RATING_OPTIONS.map((option) => (
                  <label key={option.value} className="busca-filters__option">
                    <input
                      type="radio"
                      name="busca-rating"
                      className="busca-filters__radio"
                      checked={minRating === option.value}
                      onChange={() => setMinRating(option.value)}
                    />
                    <StarRating rating={option.value} />
                    {option.suffix && <span className="busca-filters__label">{option.suffix}</span>}
                  </label>
                ))}
              </fieldset>

              <fieldset className="busca-filters__group">
                <legend className="busca-filters__title">Disponibilidade</legend>
                <label className="busca-filters__option">
                  <input
                    type="checkbox"
                    className="busca-filters__checkbox"
                    checked={onlyInStock}
                    onChange={(event) => setOnlyInStock(event.target.checked)}
                  />
                  <span className="busca-filters__label">Em estoque</span>
                </label>
                <label className="busca-filters__option">
                  <input
                    type="checkbox"
                    className="busca-filters__checkbox"
                    checked={onlyDiscount}
                    onChange={(event) => setOnlyDiscount(event.target.checked)}
                  />
                  <span className="busca-filters__label">Somente com desconto</span>
                </label>
              </fieldset>

              {hasActiveFilters && (
                <button
                  type="button"
                  className="busca-filters__clear"
                  onClick={handleClearFilters}
                >
                  Limpar filtros
                </button>
              )}
            </aside>

            {/* Resultados */}
            <section className="busca-results" aria-label="Resultados da busca">
              <div className="busca-results__toolbar">
                <p className="busca-results__range">
                  Exibindo {rangeStart}–{rangeEnd} de {totalResults}
                </p>

                <select
                  className="busca-results__sort"
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

              {isLoading && <p className="busca__feedback">Buscando produtos...</p>}

              {!isLoading && pageProducts.length === 0 && (
                <div className="busca-results__empty">
                  <p className="busca-results__empty-text">
                    {searchResults.length === 0
                      ? `Nenhum produto encontrado para "${query}". Verifique a digitação ou tente termos mais genéricos.`
                      : 'Nenhum produto encontrado com os filtros selecionados.'}
                  </p>
                  {hasActiveFilters && <Button onClick={handleClearFilters}>Limpar filtros</Button>}
                </div>
              )}

              {!isLoading && pageProducts.length > 0 && (
                <ul className="busca-results__grid">
                  {pageProducts.map((product) => (
                    <li key={product.id} className="busca-results__item">
                      <ProductCard product={product} />
                    </li>
                  ))}
                </ul>
              )}

              {totalPages > 1 && (
                <div className="busca-results__pagination">
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

export default Busca;
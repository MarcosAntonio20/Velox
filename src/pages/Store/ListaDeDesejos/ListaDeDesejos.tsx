/**
 * VELOX — Tela Lista de Desejos (rota "/ListaDeDesejos").
 *
 * Os ids favoritados vêm do WishlistContext; os produtos são carregados uma
 * única vez pelo productService e cruzados com esses ids. Ao remover um item
 * (botão "Remover dos favoritos" ou coração), o card sai da grade na hora, sem
 * nova consulta. Produtos inativos (ou de categorias inativas) não aparecem.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StoreLayout } from '../../../layouts/StoreLayout/StoreLayout';
import { Breadcrumb } from '../../../components/Ui/Breadcrumb/Breadcrumb';
import { Button } from '../../../components/Ui/Button/Button';
import { ProductCard } from '../../../components/Ui/ProductCard/ProductCard';
import { useWishlist } from '../../../context/WishlistContext';
import { getProducts } from '../../../services/productService';
import type { Product } from '../../../types';
import './listadedesejos.css';

export function ListaDeDesejos() {
  const navigate = useNavigate();
  const { productIds } = useWishlist();

  const [catalog, setCatalog] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /* ------------------------------------------------------------------------
     Carga de dados (uma única vez)
     ------------------------------------------------------------------------ */
  useEffect(() => {
    let isCancelled = false;

    async function loadProducts(): Promise<void> {
      try {
        const loadedProducts = await getProducts();

        if (!isCancelled) {
          setCatalog(loadedProducts);
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'Não foi possível carregar a lista de desejos.',
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
  }, []);

  /* ------------------------------------------------------------------------
     Derivações
     ------------------------------------------------------------------------ */
  // Mantém a ordem em que os produtos foram favoritados.
  const wishlistProducts = useMemo<Product[]>(() => {
    const productsById = new Map<number, Product>(
      catalog.map((product) => [product.id, product]),
    );

    return productIds
      .map((productId) => productsById.get(productId))
      .filter((product): product is Product => product !== undefined);
  }, [catalog, productIds]);

  const totalSaved = wishlistProducts.length;

  const subtitle =
    totalSaved === 0
      ? 'Você ainda não salvou nenhum produto.'
      : `${totalSaved} ${totalSaved === 1 ? 'produto salvo' : 'produtos salvos'} para comprar depois.`;

  /* ------------------------------------------------------------------------
     Render
     ------------------------------------------------------------------------ */
  return (
    <StoreLayout>
      <div className="lista-desejos">
        <Breadcrumb items={[{ label: 'Home', to: '/' }, { label: 'Lista de desejos' }]} />

        <header className="lista-desejos__header">
          <h1 className="lista-desejos__title">Minha Lista de Desejos</h1>
          {!isLoading && <p className="lista-desejos__subtitle">{subtitle}</p>}
        </header>

        {errorMessage && (
          <p className="lista-desejos__feedback lista-desejos__feedback--error" role="alert">
            {errorMessage}
          </p>
        )}

        {isLoading && !errorMessage && (
          <p className="lista-desejos__feedback" role="status">
            Carregando...
          </p>
        )}

        {!isLoading && !errorMessage && totalSaved === 0 && (
          <div className="lista-desejos__empty">
            <p className="lista-desejos__empty-text">
              Toque no coração dos produtos que você gostar para guardá-los aqui.
            </p>
            <Button variant="primary" onClick={() => navigate('/catalogo')}>
              Explorar produtos
            </Button>
          </div>
        )}

        {!isLoading && totalSaved > 0 && (
          <ul className="lista-desejos__grid">
            {wishlistProducts.map((product) => (
              <li key={product.id} className="lista-desejos__item">
                <ProductCard product={product} showFavoriteButton showRemoveFromWishlist />
              </li>
            ))}
          </ul>
        )}
      </div>
    </StoreLayout>
  );
}

export default ListaDeDesejos;
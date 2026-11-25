/**
 * VELOX — Meus pedidos (rota: /minha-conta/pedidos).
 *
 * A página se envolve no StoreLayout (header, navegação, container e footer
 * vêm do layout). Portanto, a rota deve ser registrada fora de uma rota-pai
 * que já use o StoreLayout.
 *
 * - Os pedidos vêm de orderService.getOrdersByUser(user.id), do mais recente
 *   para o mais antigo.
 * - A miniatura é a imagem do primeiro produto de cada pedido (o OrderItem
 *   guarda apenas productId e nome, então a imagem é buscada em productService).
 * - "itens" é a quantidade de produtos distintos do pedido (order.items.length).
 */

import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Breadcrumb, type BreadcrumbItem } from '../../../components/Ui/Breadcrumb/Breadcrumb';
import { Button } from '../../../components/Ui/Button/Button';
import { SectionCard } from '../../../components/Ui/SectionCard/SectionCard';
import { StatusBadge } from '../../../components/Ui/StatusBadge/StatusBadge';
import { useAuth } from '../../../context/AuthContext';
import { StoreLayout } from '../../../layouts/StoreLayout/StoreLayout';
import { getOrdersByUser } from '../../../services/orderService';
import { getProductById } from '../../../services/productService';
import type { Order, Product } from '../../../types';
import './meusPedidos.css';

/* ==========================================================================
   Constantes e utilitários
   ========================================================================== */

const LOGIN_ROUTE = '/login';
const HOME_ROUTE = '/';
const ACCOUNT_ROUTE = '/minha-conta';

const BREADCRUMB_ITEMS: BreadcrumbItem[] = [
  { label: 'Home', to: HOME_ROUTE },
  { label: 'Minha Conta', to: ACCOUNT_ROUTE },
  { label: 'Meus pedidos' },
];

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const formatCurrency = (value: number): string => currencyFormatter.format(value);

const formatItemsCount = (count: number): string => `${count} ${count === 1 ? 'item' : 'itens'}`;

/* ==========================================================================
   Página
   ========================================================================== */

export function MeusPedidos() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Record<number, Product | null>>({});
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const userId = user ? user.id : null;

  /* ------------------------------------------------------------------------
     Busca dos pedidos do usuário
     ------------------------------------------------------------------------ */
  useEffect(() => {
    if (userId === null) {
      return undefined;
    }

    let isCurrent = true;
    setIsLoadingOrders(true);
    setLoadError(null);

    getOrdersByUser(userId)
      .then((loaded) => {
        if (isCurrent) {
          setOrders(loaded);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setLoadError('Não foi possível carregar os seus pedidos.');
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoadingOrders(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [userId]);

  /* ------------------------------------------------------------------------
     Miniaturas: imagem do primeiro produto de cada pedido
     ------------------------------------------------------------------------ */
  useEffect(() => {
    let isCurrent = true;
    const ids = Array.from(
      new Set(
        orders
          .map((order) => (order.items.length > 0 ? order.items[0].productId : null))
          .filter((productId): productId is number => productId !== null),
      ),
    );

    Promise.all(ids.map((id) => getProductById(id).catch(() => null))).then((loaded) => {
      if (!isCurrent) {
        return;
      }

      const next: Record<number, Product | null> = {};
      ids.forEach((id, position) => {
        next[id] = loaded[position];
      });
      setProducts(next);
    });

    return () => {
      isCurrent = false;
    };
  }, [orders]);

  /* ------------------------------------------------------------------------
     Guardas de renderização
     ------------------------------------------------------------------------ */
  if (isLoading) {
    return null;
  }

  if (!user) {
    return <Navigate to={LOGIN_ROUTE} replace state={{ from: location.pathname }} />;
  }

  /* ------------------------------------------------------------------------
     Render
     ------------------------------------------------------------------------ */
  return (
    <StoreLayout>
      <div className="my-orders">
        <Breadcrumb className="my-orders__breadcrumb" items={BREADCRUMB_ITEMS} />

        <h1 className="my-orders__title">Meus Pedidos</h1>

        {isLoadingOrders ? (
          <div className="my-orders__feedback" aria-busy="true" />
        ) : loadError ? (
          <p className="my-orders__feedback my-orders__feedback--error" role="alert">
            {loadError}
          </p>
        ) : orders.length === 0 ? (
          <div className="my-orders__empty">
            <p className="my-orders__empty-text">Você ainda não fez nenhum pedido.</p>
            <Button type="button" onClick={() => navigate(HOME_ROUTE)}>
              Ir para a loja
            </Button>
          </div>
        ) : (
          <ul className="my-orders__list">
            {orders.map((order) => {
              const firstItem = order.items.length > 0 ? order.items[0] : null;
              const firstProduct = firstItem ? (products[firstItem.productId] ?? null) : null;

              return (
                <li key={order.id} className="my-orders__list-item">
                  <SectionCard className="my-orders__card">
                    <article className="my-orders__order">
                      <span className="my-orders__thumb">
                        {firstProduct ? (
                          <img
                            className="my-orders__thumb-image"
                            src={firstProduct.imageUrl}
                            alt={firstItem ? firstItem.productName : 'Produto do pedido'}
                          />
                        ) : null}
                      </span>

                      <div className="my-orders__identification">
                        <h2 className="my-orders__number">Pedido {order.orderNumber}</h2>
                        <time className="my-orders__date" dateTime={order.createdAt}>
                          {dateFormatter.format(new Date(order.createdAt))}
                        </time>
                      </div>

                      <dl className="my-orders__info">
                        <dt className="my-orders__info-label">Produtos</dt>
                        <dd className="my-orders__info-value">{formatItemsCount(order.items.length)}</dd>
                      </dl>

                      <dl className="my-orders__info">
                        <dt className="my-orders__info-label">Valor total</dt>
                        <dd className="my-orders__info-value">{formatCurrency(order.total)}</dd>
                      </dl>

                      <div className="my-orders__status">
                        <StatusBadge status={order.status} />
                      </div>

                      <div className="my-orders__action">
                        <Button
                          type="button"
                          variant="outline-neutral"
                          onClick={() => navigate(`/minha-conta/pedidos/${order.id}`)}
                        >
                          Ver pedido
                        </Button>
                      </div>
                    </article>
                  </SectionCard>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </StoreLayout>
  );
}

export default MeusPedidos;
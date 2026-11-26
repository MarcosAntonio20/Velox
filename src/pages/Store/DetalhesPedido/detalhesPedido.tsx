/**
 * VELOX — Detalhes do Pedido (rota "/minha-conta/pedidos/:id").
 *
 * Fontes de dados:
 * - orderService.getOrderById(orderId, userId): só devolve o pedido se ele pertencer ao
 *   usuário logado (useAuth).
 * - AuthContext.addresses: endereço de entrega (o pedido guarda apenas addressId).
 * - productService.getProductById (somente leitura): miniaturas dos itens, pois OrderItem
 *   guarda só o nome do produto.
 *
 * Linha do tempo: 5 etapas; destaca até o status atual. Pedidos cancelados não têm
 * linha do tempo, e sim um aviso de cancelamento.
 */

import { useEffect, useState, type JSX } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { Breadcrumb } from '../../../components/Ui/Breadcrumb/Breadcrumb';
import { Button } from '../../../components/Ui/Button/Button';
import { SectionCard } from '../../../components/Ui/SectionCard/SectionCard';
import { StatusBadge, type BadgeTone } from '../../../components/Ui/StatusBadge/StatusBadge';
import { useAuth } from '../../../context/AuthContext';
import { StoreLayout } from '../../../layouts/StoreLayout/StoreLayout';
import { getOrderById } from '../../../services/orderService';
import { getProductById } from '../../../services/productService';
import type { Order, OrderStatus, UserAddress } from '../../../types';
import { classNames } from '../../../utils/helpers';
import { formatCurrency, roundCurrency } from '../../../utils/pricing';
import './detalhesPedido.css';

const HOME_ROUTE = '/';
const ORDERS_ROUTE = '/meus-pedidos';
const LOGIN_ROUTE = '/login';

/** Etapas da linha do tempo, na ordem. */
const TIMELINE_STEPS: string[] = ['Pedido', 'Pagamento', 'Preparando', 'Enviado', 'Entregue'];

/** Última etapa alcançada (índice em TIMELINE_STEPS) para cada status. "Cancelado" não tem etapa. */
const STATUS_STEP: Record<Exclude<OrderStatus, 'Cancelado'>, number> = {
  'Em processamento': 0,
  'Pagamento aprovado': 1,
  Preparando: 2,
  Enviado: 3,
  Entregue: 4,
};

const STATUS_TONES: Record<OrderStatus, BadgeTone> = {
  'Em processamento': 'warning',
  'Pagamento aprovado': 'success',
  Preparando: 'warning',
  Enviado: 'success',
  Entregue: 'success',
  Cancelado: 'danger',
};

/** Parcelamento sem juros exibido para pagamentos no cartão. */
const INSTALLMENTS = 12;

/** Prazo estimado de entrega, em dias corridos a partir da data do pedido. */
const ESTIMATED_DELIVERY_DAYS = 15;

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/* ==========================================================================
   Helpers
   ========================================================================== */

const formatDate = (iso: string): string => new Date(iso).toLocaleDateString('pt-BR');

function getEstimatedDelivery(createdAt: string): string {
  const created = new Date(createdAt);

  return new Date(created.getTime() + ESTIMATED_DELIVERY_DAYS * MILLISECONDS_PER_DAY).toLocaleDateString(
    'pt-BR',
  );
}

function getPaymentDescription(order: Order): string {
  if (order.paymentMethod === 'Cartão de crédito') {
    return `${INSTALLMENTS}x de ${formatCurrency(roundCurrency(order.total / INSTALLMENTS))} sem juros`;
  }

  if (order.paymentMethod === 'Pix') {
    return 'Pagamento à vista via Pix';
  }

  return 'Pagamento à vista via boleto';
}

/* ==========================================================================
   Tela
   ========================================================================== */

export function DetalhesPedido() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, addresses, isLoading: isAuthLoading } = useAuth();

  const [order, setOrder] = useState<Order | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({});
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const userId = user ? user.id : null;

  /* ------------------------------------------------------------------------
     Carga de dados
     ------------------------------------------------------------------------ */
  useEffect(() => {
    if (isAuthLoading) {
      return undefined;
    }

    if (userId === null) {
      setIsPageLoading(false);
      return undefined;
    }

    let isCancelled = false;
    const orderId = Number(id);

    async function loadOrder(): Promise<void> {
      setIsPageLoading(true);
      setErrorMessage(null);
      setOrder(null);

      try {
        const loadedOrder =
          Number.isInteger(orderId) && userId !== null ? await getOrderById(orderId, userId) : null;

        if (isCancelled) {
          return;
        }

        setOrder(loadedOrder);

        if (loadedOrder) {
          // Miniaturas dos itens (opcional): remova este trecho para não usar o productService.
          const products = await Promise.all(
            loadedOrder.items.map((item) =>
              getProductById(item.productId, true).catch(() => null),
            ),
          );

          if (isCancelled) {
            return;
          }

          const images: Record<number, string> = {};

          products.forEach((product) => {
            if (product) {
              images[product.id] = product.imageUrl;
            }
          });

          setThumbnails(images);
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : 'Não foi possível carregar o pedido.',
          );
        }
      } finally {
        if (!isCancelled) {
          setIsPageLoading(false);
        }
      }
    }

    void loadOrder();

    return () => {
      isCancelled = true;
    };
  }, [id, userId, isAuthLoading]);

  /* ------------------------------------------------------------------------
     Estados sem pedido (carregando / sem login / erro / não encontrado)
     ------------------------------------------------------------------------ */
  if (isAuthLoading || isPageLoading || userId === null || errorMessage || !order) {
    let message = 'Carregando pedido...';
    let isError = false;
    let action: { label: string; route: string } | null = null;

    if (!isAuthLoading && userId === null) {
      message = 'Faça login para ver os detalhes dos seus pedidos.';
      action = { label: 'Entrar', route: LOGIN_ROUTE };
    } else if (errorMessage) {
      message = errorMessage;
      isError = true;
      action = { label: 'Voltar para meus pedidos', route: ORDERS_ROUTE };
    } else if (!isAuthLoading && !isPageLoading) {
      message = 'Pedido não encontrado.';
      action = { label: 'Voltar para meus pedidos', route: ORDERS_ROUTE };
    }

    return (
      <StoreLayout>
        <div className="detalhes-pedido">
          <p
            className={
              isError
                ? 'detalhes-pedido__feedback detalhes-pedido__feedback--error'
                : 'detalhes-pedido__feedback'
            }
            role={isError ? 'alert' : 'status'}
          >
            {message}
          </p>
          {action && (
            <div className="detalhes-pedido__feedback-action">
              <Button variant="primary" onClick={() => navigate(action.route)}>
                {action.label}
              </Button>
            </div>
          )}
        </div>
      </StoreLayout>
    );
  }

  /* ------------------------------------------------------------------------
     Valores de exibição
     ------------------------------------------------------------------------ */
  const isCancelled = order.status === 'Cancelado';
  const reachedStep = order.status === 'Cancelado' ? -1 : STATUS_STEP[order.status];
  const address: UserAddress | undefined = addresses.find((item) => item.id === order.addressId);
  const showDeliveryForecast = order.status !== 'Cancelado' && order.status !== 'Entregue';

  // Um pedido sempre tem endereço; lista vazia significa que os endereços ainda estão carregando.
  let addressContent: JSX.Element;

  if (address) {
    addressContent = (
      <>
        <p className="detalhes-pedido__line">{address.recipientName}</p>
        <p className="detalhes-pedido__line">
          {address.street}, {address.number}
          {address.complement ? ` - ${address.complement}` : ''}
        </p>
        <p className="detalhes-pedido__line">
          {address.neighborhood} · {address.city} / {address.state} · {address.zipCode}
        </p>
      </>
    );
  } else if (addresses.length === 0) {
    addressContent = <p className="detalhes-pedido__line">Carregando endereço...</p>;
  } else {
    addressContent = <p className="detalhes-pedido__line">Endereço não encontrado.</p>;
  }

  /* ------------------------------------------------------------------------
     Render
     ------------------------------------------------------------------------ */
  return (
    <StoreLayout>
      <div className="detalhes-pedido">
        <Breadcrumb
          items={[
            { label: 'Home', to: HOME_ROUTE },
            { label: 'Meus pedidos', to: ORDERS_ROUTE },
            { label: `Pedido ${order.orderNumber}` },
          ]}
        />

        <header className="detalhes-pedido__header">
          <h1 className="detalhes-pedido__title">Pedido {order.orderNumber}</h1>
          <StatusBadge tone={STATUS_TONES[order.status]}>{order.status}</StatusBadge>
        </header>

        {/* Linha do tempo */}
        {isCancelled ? (
          <section className="detalhes-pedido__cancelled" role="status">
            Este pedido foi cancelado em {formatDate(order.updatedAt)}.
          </section>
        ) : (
          <section className="detalhes-pedido-timeline" aria-label="Andamento do pedido">
            <ol className="detalhes-pedido-timeline__list">
              {TIMELINE_STEPS.map((label, index) => {
                const isReached = index <= reachedStep;
                const isCurrent = index === reachedStep;

                return (
                  <li
                    key={label}
                    className={classNames(
                      'detalhes-pedido-timeline__step',
                      isReached && 'detalhes-pedido-timeline__step--reached',
                      isCurrent && 'detalhes-pedido-timeline__step--current',
                    )}
                    aria-current={isCurrent ? 'step' : undefined}
                  >
                    <span className="detalhes-pedido-timeline__circle">
                      {isReached && (
                        <Check className="detalhes-pedido-timeline__icon" aria-hidden="true" />
                      )}
                    </span>
                    <span className="detalhes-pedido-timeline__label">{label}</span>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        <div className="detalhes-pedido__layout">
          {/* Produtos e totais */}
          <SectionCard title="Produtos">
            <ul className="detalhes-pedido__items">
              {order.items.map((item) => (
                <li key={item.id} className="detalhes-pedido__item">
                  <span className="detalhes-pedido__thumb">
                    {thumbnails[item.productId] && (
                      <img
                        className="detalhes-pedido__thumb-image"
                        src={thumbnails[item.productId]}
                        alt=""
                        loading="lazy"
                      />
                    )}
                  </span>
                  <div className="detalhes-pedido__item-text">
                    <span className="detalhes-pedido__item-name">{item.productName}</span>
                    <span className="detalhes-pedido__item-quantity">
                      Quantidade: {item.quantity}
                    </span>
                  </div>
                  <span className="detalhes-pedido__item-price">{formatCurrency(item.subtotal)}</span>
                </li>
              ))}
            </ul>

            <dl className="detalhes-pedido__totals">
              <div className="detalhes-pedido__total-row">
                <dt>Subtotal</dt>
                <dd>{formatCurrency(order.subtotal)}</dd>
              </div>
              <div className="detalhes-pedido__total-row">
                <dt>Frete</dt>
                <dd
                  className={
                    order.shippingCost === 0 ? 'detalhes-pedido__free-shipping' : undefined
                  }
                >
                  {order.shippingCost === 0 ? 'Grátis' : formatCurrency(order.shippingCost)}
                </dd>
              </div>
              {order.discountAmount > 0 && (
                <div className="detalhes-pedido__total-row">
                  <dt>Desconto</dt>
                  <dd className="detalhes-pedido__discount">
                    - {formatCurrency(order.discountAmount)}
                  </dd>
                </div>
              )}
              <div className="detalhes-pedido__total-row detalhes-pedido__total-row--grand">
                <dt>Total</dt>
                <dd>{formatCurrency(order.total)}</dd>
              </div>
            </dl>
          </SectionCard>

          {/* Endereço, pagamento e voltar */}
          <aside className="detalhes-pedido__aside">
            <SectionCard title="Endereço de entrega">{addressContent}</SectionCard>

            <SectionCard title="Forma de pagamento">
              <p className="detalhes-pedido__line">{order.paymentMethod}</p>
              <p className="detalhes-pedido__line">{getPaymentDescription(order)}</p>
              {order.trackingCode && (
                <p className="detalhes-pedido__note">
                  Código de rastreio: {order.trackingCode}
                </p>
              )}
              {showDeliveryForecast && (
                <p className="detalhes-pedido__note">
                  Previsão de entrega: até {getEstimatedDelivery(order.createdAt)}
                </p>
              )}
              {order.status === 'Entregue' && (
                <p className="detalhes-pedido__note">Entregue em {formatDate(order.updatedAt)}</p>
              )}
            </SectionCard>

            <Button
              variant="outline-neutral"
              fullWidth
              leftIcon={ArrowLeft}
              onClick={() => navigate(ORDERS_ROUTE)}
            >
              Voltar para meus pedidos
            </Button>
          </aside>
        </div>
      </div>
    </StoreLayout>
  );
}

export default DetalhesPedido;
/**
 * VELOX — Pedido confirmado (rota: /pedido-confirmado/:id).
 *
 * A página se envolve no StoreLayout (header, navegação, container e footer
 * vêm do layout). Portanto, a rota deve ser registrada fora de uma rota-pai
 * que já use o StoreLayout.
 *
 * - O pedido é buscado por orderService.getOrderById(id, userId), então só o
 *   dono do pedido consegue visualizá-lo.
 * - O endereço vem de authService.getAddressById(order.addressId).
 * - O modelo Order não possui previsão de entrega nem parcelamento: a previsão
 *   é estimada aqui (dias úteis por UF, a partir de createdAt) e o parcelamento
 *   não é exibido.
 */

import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../../components/Ui/Button/Button';
import { SectionCard } from '../../../components/Ui/SectionCard/SectionCard';
import { useAuth } from '../../../context/AuthContext';
import { StoreLayout } from '../../../layouts/StoreLayout/StoreLayout';
import { getAddressById } from '../../../services/authService';
import { getOrderById } from '../../../services/orderService';
import type { IsoDateString, Order, UserAddress } from '../../../types';
import './pedidoConfirmado.css';

/* ==========================================================================
   Constantes e tipos
   ========================================================================== */

const LOGIN_ROUTE = '/login';
const HOME_ROUTE = '/';

type LoadStatus = 'loading' | 'ready' | 'not-found';

/** Prazo de entrega (em dias úteis) por UF. Estados não listados usam o padrão. */
const DELIVERY_BUSINESS_DAYS_BY_STATE: Record<string, number> = {
  SP: 3,
  RJ: 5,
  MG: 5,
  ES: 5,
  PR: 6,
  SC: 6,
  RS: 6,
  DF: 7,
  GO: 7,
  MT: 7,
  MS: 7,
};

const DEFAULT_DELIVERY_BUSINESS_DAYS = 10;

/* ==========================================================================
   Utilitários locais
   ========================================================================== */

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const formatCurrency = (value: number): string => currencyFormatter.format(value);

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** Soma dias úteis (segunda a sexta) a uma data. */
function addBusinessDays(start: Date, businessDays: number): Date {
  const result = new Date(start.getTime());
  let remaining = businessDays;

  while (remaining > 0) {
    result.setDate(result.getDate() + 1);

    const weekday = result.getDay();

    if (weekday !== 0 && weekday !== 6) {
      remaining -= 1;
    }
  }

  return result;
}

function formatDeliveryEstimate(createdAt: IsoDateString, state: string | null): string {
  const days =
    state !== null
      ? (DELIVERY_BUSINESS_DAYS_BY_STATE[state.trim().toUpperCase()] ?? DEFAULT_DELIVERY_BUSINESS_DAYS)
      : DEFAULT_DELIVERY_BUSINESS_DAYS;

  return `até ${dateFormatter.format(addBusinessDays(new Date(createdAt), days))}`;
}

function formatAddress(address: UserAddress): string {
  const complement = address.complement ? ` - ${address.complement}` : '';

  return `${address.street}, ${address.number}${complement} · ${address.city}/${address.state} · ${address.zipCode}`;
}

/* ==========================================================================
   Página
   ========================================================================== */

export function PedidoConfirmado() {
  const { id } = useParams<{ id: string }>();
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [order, setOrder] = useState<Order | null>(null);
  const [address, setAddress] = useState<UserAddress | null>(null);
  const [status, setStatus] = useState<LoadStatus>('loading');

  const orderId = Number(id);
  const userId = user ? user.id : null;

  /* ------------------------------------------------------------------------
     Busca do pedido (do usuário logado) e do endereço de entrega
     ------------------------------------------------------------------------ */
  useEffect(() => {
    if (userId === null) {
      return undefined;
    }

    if (!Number.isInteger(orderId) || orderId < 1) {
      setStatus('not-found');
      return undefined;
    }

    let isCurrent = true;
    setStatus('loading');

    getOrderById(orderId, userId)
      .then(async (found) => {
        if (!isCurrent) {
          return;
        }

        if (!found) {
          setOrder(null);
          setAddress(null);
          setStatus('not-found');
          return;
        }

        const foundAddress = await getAddressById(found.addressId).catch(() => null);

        if (!isCurrent) {
          return;
        }

        setOrder(found);
        setAddress(foundAddress);
        setStatus('ready');
      })
      .catch(() => {
        if (isCurrent) {
          setStatus('not-found');
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [orderId, userId]);

  /* ------------------------------------------------------------------------
     Handlers
     ------------------------------------------------------------------------ */
  const handleTrackOrder = (): void => {
    if (order) {
      navigate(`/minha-conta/pedidos/${order.id}`);
    }
  };

  const handleBackToStore = (): void => {
    navigate(HOME_ROUTE);
  };

  /* ------------------------------------------------------------------------
     Guardas de renderização
     ------------------------------------------------------------------------ */
  if (isLoading) {
    return null;
  }

  if (!user) {
    return <Navigate to={LOGIN_ROUTE} replace state={{ from: location.pathname }} />;
  }

  if (status === 'loading') {
    return (
      <StoreLayout>
        <div className="order-confirmed" aria-busy="true" />
      </StoreLayout>
    );
  }

  if (status === 'not-found' || !order) {
    return (
      <StoreLayout>
        <div className="order-confirmed">
          <SectionCard className="order-confirmed__card">
            <div className="order-confirmed__empty">
              <h1 className="order-confirmed__empty-title">Pedido não encontrado</h1>
              <p className="order-confirmed__empty-text">
                Não localizamos este pedido na sua conta.
              </p>
              <Button type="button" onClick={handleBackToStore}>
                Voltar para a loja
              </Button>
            </div>
          </SectionCard>
        </div>
      </StoreLayout>
    );
  }

  /* ------------------------------------------------------------------------
     Render
     ------------------------------------------------------------------------ */
  return (
    <StoreLayout>
      <div className="order-confirmed">
        <SectionCard className="order-confirmed__card">
          <div className="order-confirmed__content">
            <span className="order-confirmed__icon" aria-hidden="true">
              <Check className="order-confirmed__icon-check" />
            </span>

            <h1 className="order-confirmed__title">Pedido realizado com sucesso!</h1>
            <p className="order-confirmed__subtitle">Obrigado por comprar na VELOX!</p>

            <dl className="order-confirmed__summary">
              <div className="order-confirmed__summary-item">
                <dt className="order-confirmed__summary-label">Número do pedido</dt>
                <dd className="order-confirmed__summary-value">{order.orderNumber}</dd>
              </div>

              <div className="order-confirmed__summary-item">
                <dt className="order-confirmed__summary-label">Valor total</dt>
                <dd className="order-confirmed__summary-value">{formatCurrency(order.total)}</dd>
              </div>

              <div className="order-confirmed__summary-item">
                <dt className="order-confirmed__summary-label">Forma de pagamento</dt>
                <dd className="order-confirmed__summary-value">{order.paymentMethod}</dd>
              </div>

              <div className="order-confirmed__summary-item">
                <dt className="order-confirmed__summary-label">Previsão de entrega</dt>
                <dd className="order-confirmed__summary-value">
                  {formatDeliveryEstimate(order.createdAt, address ? address.state : null)}
                </dd>
              </div>

              <div className="order-confirmed__summary-item order-confirmed__summary-item--full">
                <dt className="order-confirmed__summary-label">Endereço de entrega</dt>
                <dd className="order-confirmed__summary-value">
                  {address ? formatAddress(address) : 'Endereço não disponível'}
                </dd>
              </div>
            </dl>

            <div className="order-confirmed__actions">
              <Button type="button" fullWidth onClick={handleTrackOrder}>
                Acompanhar pedido
              </Button>
              <Button type="button" variant="outline-neutral" fullWidth onClick={handleBackToStore}>
                Voltar para a loja
              </Button>
            </div>
          </div>
        </SectionCard>
      </div>
    </StoreLayout>
  );
}

export default PedidoConfirmado;
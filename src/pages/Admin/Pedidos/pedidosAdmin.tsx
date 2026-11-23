/**
 * VELOX — Admin / Pedidos (rota "/admin/pedidos").
 *
 * Renderizada dentro do AdminLayout (via <Outlet />), por isso não usa layout próprio.
 *
 * Fontes de dados:
 * - orderService: lista de pedidos (getAllOrders) e troca de status (updateOrderStatus).
 * - authService (apenas leitura): nome do cliente e endereço de entrega, porque o Order
 *   guarda somente userId e addressId.
 *
 * Regras:
 * - O dropdown de status só permite os destinos de ORDER_STATUS_TRANSITIONS; os demais
 *   aparecem desabilitados. Pedidos "Entregue" e "Cancelado" não têm dropdown (estados finais).
 * - A troca de status é imediata (updateOrderStatus). Cancelar pede confirmação, pois é
 *   definitivo e devolve estoque e cupom.
 * - As pílulas de status filtram na hora; a busca (nº, rastreio ou cliente) vale no "Filtrar".
 */

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ChevronDown, Eye, Search } from 'lucide-react';
import { Button } from '../../../components/Ui/Button/Button';
import { Pagination } from '../../../components/Ui/Pagination/Pagination';
import { StatusBadge, type BadgeTone } from '../../../components/Ui/StatusBadge/StatusBadge';
import { getAddressById, getUsersByIds } from '../../../services/authService';
import {
  ORDER_STATUS_TRANSITIONS,
  getAllOrders,
  updateOrderStatus,
} from '../../../services/orderService';
import type { Order, OrderStatus, PaymentMethod, User, UserAddress } from '../../../types';
import { normalizeText } from '../../../utils/helpers';
import { formatCurrency } from '../../../utils/pricing';
import './pedidosAdmin.css';

/** Quantidade de pedidos por página. */
const PAGE_SIZE = 6;

/** Tempo (ms) que a mensagem de sucesso fica visível. */
const FEEDBACK_DURATION_MS = 4000;

/** Nas últimas linhas da página, o dropdown abre para cima. */
const OPEN_UP_LAST_ROWS = 2;

type StatusFilter = 'all' | OrderStatus;

const ALL_STATUSES: OrderStatus[] = [
  'Em processamento',
  'Pagamento aprovado',
  'Preparando',
  'Enviado',
  'Entregue',
  'Cancelado',
];

interface FilterPill {
  value: StatusFilter;
  label: string;
}

const FILTER_PILLS: FilterPill[] = [
  { value: 'all', label: 'Todos' },
  ...ALL_STATUSES.map((status) => ({ value: status, label: status })),
];

/** Cor do selo de cada status nesta tela (segue a imagem de referência). */
const STATUS_TONES: Record<OrderStatus, BadgeTone> = {
  'Em processamento': 'neutral',
  'Pagamento aprovado': 'success',
  Preparando: 'warning',
  Enviado: 'neutral',
  Entregue: 'success',
  Cancelado: 'danger',
};

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  Pix: 'PIX',
  'Cartão de crédito': 'Cartão',
  Boleto: 'Boleto',
};

/* ==========================================================================
   Helpers
   ========================================================================== */

const formatDate = (iso: string): string => new Date(iso).toLocaleDateString('pt-BR');

const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/** Normaliza o texto de busca ignorando acentos, maiúsculas e o "#" do número do pedido. */
const normalizeSearch = (value: string): string => normalizeText(value).replace(/#/g, '');

/* ==========================================================================
   Tela
   ========================================================================== */

export function PedidosAdmin() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<Record<number, User>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  /* Filtros: a busca só vale no "Filtrar"; as pílulas filtram na hora. */
  const [searchDraft, setSearchDraft] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [currentPage, setCurrentPage] = useState(1);

  /* Dropdown de status. */
  const [openMenuOrderId, setOpenMenuOrderId] = useState<number | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<number | null>(null);

  /* Modais. */
  const [orderToCancel, setOrderToCancel] = useState<Order | null>(null);
  const [viewedOrderId, setViewedOrderId] = useState<number | null>(null);
  const [viewedAddress, setViewedAddress] = useState<UserAddress | null>(null);
  const [isAddressLoading, setIsAddressLoading] = useState(false);

  /* ------------------------------------------------------------------------
     Carga de dados
     ------------------------------------------------------------------------ */
  useEffect(() => {
    let isCancelled = false;

    async function loadData(): Promise<void> {
      try {
        const loadedOrders = await getAllOrders();
        const loadedUsers = await getUsersByIds(
          Array.from(new Set(loadedOrders.map((order) => order.userId))),
        );

        if (isCancelled) {
          return;
        }

        const usersById: Record<number, User> = {};

        loadedUsers.forEach((user) => {
          usersById[user.id] = user;
        });

        setOrders(loadedOrders);
        setUsers(usersById);
      } catch (error) {
        if (!isCancelled) {
          setLoadError(
            error instanceof Error ? error.message : 'Não foi possível carregar os pedidos.',
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

  // Carrega o endereço de entrega ao abrir o modal "Ver pedido".
  useEffect(() => {
    if (viewedOrderId === null) {
      setViewedAddress(null);
      return undefined;
    }

    const viewed = orders.find((order) => order.id === viewedOrderId);

    if (!viewed) {
      return undefined;
    }

    let isCancelled = false;

    setIsAddressLoading(true);

    getAddressById(viewed.addressId)
      .then((address) => {
        if (!isCancelled) {
          setViewedAddress(address);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setViewedAddress(null);
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsAddressLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
    // O endereço só depende do pedido aberto, não de atualizações de status.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewedOrderId]);

  // Fecha o dropdown ao clicar fora dele.
  useEffect(() => {
    if (openMenuOrderId === null) {
      return undefined;
    }

    const handleMouseDown = (event: MouseEvent): void => {
      if (event.target instanceof Element && event.target.closest('.pedidos-admin__status')) {
        return;
      }

      setOpenMenuOrderId(null);
    };

    document.addEventListener('mousedown', handleMouseDown);

    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [openMenuOrderId]);

  // Esc fecha o modal aberto ou, se não houver, o dropdown.
  useEffect(() => {
    if (openMenuOrderId === null && viewedOrderId === null && !orderToCancel) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') {
        return;
      }

      if (orderToCancel) {
        if (updatingOrderId === null) {
          setOrderToCancel(null);
        }

        return;
      }

      if (viewedOrderId !== null) {
        setViewedOrderId(null);
        return;
      }

      setOpenMenuOrderId(null);
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openMenuOrderId, viewedOrderId, orderToCancel, updatingOrderId]);

  /* ------------------------------------------------------------------------
     Derivações
     ------------------------------------------------------------------------ */
  const getCustomerName = (userId: number): string =>
    users[userId] ? users[userId].name : `Cliente #${userId}`;

  const filteredOrders = useMemo<Order[]>(() => {
    const normalizedSearch = normalizeSearch(appliedSearch);

    return orders.filter((order) => {
      if (statusFilter !== 'all' && order.status !== statusFilter) {
        return false;
      }

      if (normalizedSearch) {
        const customerName = users[order.userId] ? users[order.userId].name : '';
        const haystack = normalizeSearch(
          `${order.orderNumber} ${order.trackingCode ?? ''} ${customerName}`,
        );

        if (!haystack.includes(normalizedSearch)) {
          return false;
        }
      }

      return true;
    });
  }, [orders, users, statusFilter, appliedSearch]);

  const totalOrders = filteredOrders.length;
  const totalPages = Math.max(1, Math.ceil(totalOrders / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  const pageOrders = useMemo<Order[]>(
    () => filteredOrders.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredOrders, safePage],
  );

  const rangeStart = totalOrders === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, totalOrders);

  const viewedOrder = useMemo<Order | null>(
    () => orders.find((order) => order.id === viewedOrderId) ?? null,
    [orders, viewedOrderId],
  );

  const viewedUser = viewedOrder ? (users[viewedOrder.userId] ?? null) : null;

  /* ------------------------------------------------------------------------
     Handlers: busca e filtros
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
     Handlers: troca de status
     ------------------------------------------------------------------------ */
  const applyStatus = async (order: Order, status: OrderStatus): Promise<boolean> => {
    setActionError(null);
    setUpdatingOrderId(order.id);

    try {
      const updatedOrder = await updateOrderStatus(order.id, status);

      setOrders((previous) =>
        previous.map((item) => (item.id === updatedOrder.id ? updatedOrder : item)),
      );
      setSuccessMessage(
        status === 'Cancelado'
          ? `Pedido ${updatedOrder.orderNumber} cancelado. Estoque e cupom foram restaurados.`
          : `Pedido ${updatedOrder.orderNumber} atualizado para "${status}".`,
      );

      return true;
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Não foi possível atualizar o status do pedido.',
      );

      return false;
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const handleSelectStatus = (order: Order, status: OrderStatus): void => {
    setOpenMenuOrderId(null);

    if (status === order.status || !ORDER_STATUS_TRANSITIONS[order.status].includes(status)) {
      return;
    }

    if (status === 'Cancelado') {
      setOrderToCancel(order);
      return;
    }

    void applyStatus(order, status);
  };

  const handleConfirmCancel = async (): Promise<void> => {
    if (!orderToCancel) {
      return;
    }

    await applyStatus(orderToCancel, 'Cancelado');
    setOrderToCancel(null);
  };

  /* ------------------------------------------------------------------------
     Render
     ------------------------------------------------------------------------ */
  return (
    <div className="pedidos-admin">
      <header className="pedidos-admin__header">
        <h2 className="pedidos-admin__title">Pedidos</h2>
      </header>

      <section className="pedidos-admin__card">
        {/* Busca */}
        <form className="pedidos-admin-filters" onSubmit={handleApplySearch}>
          <label className="pedidos-admin-filters__search">
            <Search className="pedidos-admin-filters__search-icon" aria-hidden="true" />
            <input
              type="search"
              className="pedidos-admin-filters__input"
              placeholder="Pesquisar por nº ou cliente..."
              aria-label="Pesquisar pedido por número, rastreio ou cliente"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
            />
          </label>

          <div className="pedidos-admin-filters__submit">
            <Button type="submit" variant="primary">
              Filtrar
            </Button>
          </div>
        </form>

        {/* Pílulas de status */}
        <div className="pedidos-admin-pills" role="group" aria-label="Filtrar por status">
          <span className="pedidos-admin-pills__label">Status:</span>
          {FILTER_PILLS.map((pill) => (
            <button
              key={pill.value}
              type="button"
              className={
                statusFilter === pill.value
                  ? 'pedidos-admin-pills__pill pedidos-admin-pills__pill--active'
                  : 'pedidos-admin-pills__pill'
              }
              aria-pressed={statusFilter === pill.value}
              onClick={() => handleSelectPill(pill.value)}
            >
              {pill.label}
            </button>
          ))}
        </div>

        {successMessage && (
          <p className="pedidos-admin__feedback pedidos-admin__feedback--success" role="status">
            {successMessage}
          </p>
        )}

        {actionError && (
          <p className="pedidos-admin__feedback pedidos-admin__feedback--error" role="alert">
            {actionError}
          </p>
        )}

        {loadError && (
          <p className="pedidos-admin__feedback pedidos-admin__feedback--error" role="alert">
            {loadError}
          </p>
        )}

        {isLoading && !loadError && (
          <p className="pedidos-admin__feedback" role="status">
            Carregando pedidos...
          </p>
        )}

        {!isLoading && !loadError && (
          <>
            {pageOrders.length === 0 ? (
              <p className="pedidos-admin__feedback">Nenhum pedido encontrado.</p>
            ) : (
              <table className="pedidos-admin-table">
                <thead>
                  <tr className="pedidos-admin-table__head-row">
                    <th className="pedidos-admin-table__head-cell" scope="col">
                      Pedido
                    </th>
                    <th className="pedidos-admin-table__head-cell" scope="col">
                      Cliente
                    </th>
                    <th className="pedidos-admin-table__head-cell" scope="col">
                      Data
                    </th>
                    <th className="pedidos-admin-table__head-cell" scope="col">
                      Valor
                    </th>
                    <th className="pedidos-admin-table__head-cell" scope="col">
                      Pagamento
                    </th>
                    <th className="pedidos-admin-table__head-cell" scope="col">
                      Status
                    </th>
                    <th className="pedidos-admin-table__head-cell" scope="col">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageOrders.map((order, index) => {
                    const allowedStatuses = ORDER_STATUS_TRANSITIONS[order.status];
                    const isFinal = allowedStatuses.length === 0;
                    const isMenuOpen = openMenuOrderId === order.id;
                    const opensUp =
                      pageOrders.length > OPEN_UP_LAST_ROWS + 1 &&
                      index >= pageOrders.length - OPEN_UP_LAST_ROWS;

                    return (
                      <tr key={order.id} className="pedidos-admin-table__row">
                        <td className="pedidos-admin-table__cell pedidos-admin-table__cell--number">
                          {order.orderNumber}
                        </td>
                        <td className="pedidos-admin-table__cell">
                          {getCustomerName(order.userId)}
                        </td>
                        <td className="pedidos-admin-table__cell pedidos-admin-table__cell--muted">
                          {formatDate(order.createdAt)}
                        </td>
                        <td className="pedidos-admin-table__cell pedidos-admin-table__cell--total">
                          {formatCurrency(order.total)}
                        </td>
                        <td className="pedidos-admin-table__cell">
                          {PAYMENT_LABELS[order.paymentMethod]}
                        </td>
                        <td className="pedidos-admin-table__cell">
                          <div className="pedidos-admin__status">
                            {isFinal ? (
                              <StatusBadge tone={STATUS_TONES[order.status]}>
                                {order.status}
                              </StatusBadge>
                            ) : (
                              <button
                                type="button"
                                className="pedidos-admin__status-trigger"
                                aria-haspopup="menu"
                                aria-expanded={isMenuOpen}
                                aria-label={`Alterar o status do pedido ${order.orderNumber} (atual: ${order.status})`}
                                disabled={updatingOrderId === order.id}
                                onClick={() => setOpenMenuOrderId(isMenuOpen ? null : order.id)}
                              >
                                <StatusBadge tone={STATUS_TONES[order.status]}>
                                  <span className="pedidos-admin__status-label">
                                    {order.status}
                                    <ChevronDown
                                      className="pedidos-admin__status-chevron"
                                      aria-hidden="true"
                                    />
                                  </span>
                                </StatusBadge>
                              </button>
                            )}

                            {isMenuOpen && (
                              <ul
                                className={
                                  opensUp
                                    ? 'pedidos-admin__menu pedidos-admin__menu--up'
                                    : 'pedidos-admin__menu'
                                }
                                role="menu"
                              >
                                {ALL_STATUSES.map((status) => {
                                  const isCurrent = status === order.status;
                                  const isAllowed = allowedStatuses.includes(status);

                                  return (
                                    <li key={status} role="none">
                                      <button
                                        type="button"
                                        role="menuitem"
                                        className={
                                          isCurrent
                                            ? 'pedidos-admin__menu-item pedidos-admin__menu-item--current'
                                            : 'pedidos-admin__menu-item'
                                        }
                                        disabled={!isCurrent && !isAllowed}
                                        onClick={() => handleSelectStatus(order, status)}
                                      >
                                        {status}
                                      </button>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                        </td>
                        <td className="pedidos-admin-table__cell">
                          <Button
                            variant="outline-neutral"
                            size="sm"
                            leftIcon={Eye}
                            onClick={() => setViewedOrderId(order.id)}
                          >
                            Ver pedido
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            <footer className="pedidos-admin__footer">
              <p className="pedidos-admin__summary">
                Exibindo {rangeStart}–{rangeEnd} de {totalOrders}{' '}
                {totalOrders === 1 ? 'pedido' : 'pedidos'}
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

      <p className="pedidos-admin__hint">Clique no status de um pedido para alterá-lo.</p>

      {/* Modal: ver pedido */}
      {viewedOrder && (
        <div
          className="pedidos-admin-modal"
          role="presentation"
          onClick={() => setViewedOrderId(null)}
        >
          <div
            className="pedidos-admin-modal__dialog pedidos-admin-modal__dialog--wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pedidos-admin-view-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="pedidos-admin-modal__heading">
              <div className="pedidos-admin-modal__heading-text">
                <h3 id="pedidos-admin-view-title" className="pedidos-admin-modal__title">
                  Pedido {viewedOrder.orderNumber}
                </h3>
                <span className="pedidos-admin-modal__meta">
                  Realizado em {formatDateTime(viewedOrder.createdAt)}
                </span>
              </div>
              <StatusBadge tone={STATUS_TONES[viewedOrder.status]}>{viewedOrder.status}</StatusBadge>
            </div>

            <div className="pedidos-admin-modal__info">
              <section className="pedidos-admin-modal__block" aria-label="Cliente">
                <h4 className="pedidos-admin-modal__block-title">Cliente</h4>
                <p className="pedidos-admin-modal__block-text">
                  <strong>{getCustomerName(viewedOrder.userId)}</strong>
                  {viewedUser && (
                    <>
                      <br />
                      {viewedUser.email}
                      <br />
                      {viewedUser.phone}
                    </>
                  )}
                </p>
              </section>

              <section className="pedidos-admin-modal__block" aria-label="Endereço de entrega">
                <h4 className="pedidos-admin-modal__block-title">Endereço de entrega</h4>
                {isAddressLoading && (
                  <p className="pedidos-admin-modal__block-text">Carregando endereço...</p>
                )}
                {!isAddressLoading && !viewedAddress && (
                  <p className="pedidos-admin-modal__block-text">Endereço não encontrado.</p>
                )}
                {!isAddressLoading && viewedAddress && (
                  <p className="pedidos-admin-modal__block-text">
                    <strong>{viewedAddress.recipientName}</strong>
                    <br />
                    {viewedAddress.street}, {viewedAddress.number}
                    {viewedAddress.complement ? ` — ${viewedAddress.complement}` : ''}
                    <br />
                    {viewedAddress.neighborhood} · {viewedAddress.city}/{viewedAddress.state}
                    <br />
                    CEP {viewedAddress.zipCode}
                  </p>
                )}
              </section>

              <section className="pedidos-admin-modal__block" aria-label="Pagamento e rastreio">
                <h4 className="pedidos-admin-modal__block-title">Pagamento e entrega</h4>
                <p className="pedidos-admin-modal__block-text">
                  Pagamento: <strong>{viewedOrder.paymentMethod}</strong>
                  <br />
                  Rastreio:{' '}
                  <strong>{viewedOrder.trackingCode ? viewedOrder.trackingCode : 'Ainda não gerado'}</strong>
                </p>
              </section>
            </div>

            <table className="pedidos-admin-modal__items">
              <thead>
                <tr>
                  <th className="pedidos-admin-modal__items-head" scope="col">
                    Produto
                  </th>
                  <th className="pedidos-admin-modal__items-head pedidos-admin-modal__items-head--number" scope="col">
                    Qtd.
                  </th>
                  <th className="pedidos-admin-modal__items-head pedidos-admin-modal__items-head--number" scope="col">
                    Unitário
                  </th>
                  <th className="pedidos-admin-modal__items-head pedidos-admin-modal__items-head--number" scope="col">
                    Subtotal
                  </th>
                </tr>
              </thead>
              <tbody>
                {viewedOrder.items.map((item) => (
                  <tr key={item.id} className="pedidos-admin-modal__items-row">
                    <td className="pedidos-admin-modal__items-cell pedidos-admin-modal__items-cell--name">
                      {item.productName}
                    </td>
                    <td className="pedidos-admin-modal__items-cell pedidos-admin-modal__items-cell--number">
                      {item.quantity}
                    </td>
                    <td className="pedidos-admin-modal__items-cell pedidos-admin-modal__items-cell--number">
                      {formatCurrency(item.unitPrice)}
                    </td>
                    <td className="pedidos-admin-modal__items-cell pedidos-admin-modal__items-cell--number">
                      {formatCurrency(item.subtotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <dl className="pedidos-admin-modal__totals">
              <div className="pedidos-admin-modal__total-row">
                <dt>Subtotal</dt>
                <dd>{formatCurrency(viewedOrder.subtotal)}</dd>
              </div>
              <div className="pedidos-admin-modal__total-row">
                <dt>Frete</dt>
                <dd>{formatCurrency(viewedOrder.shippingCost)}</dd>
              </div>
              {viewedOrder.discountAmount > 0 && (
                <div className="pedidos-admin-modal__total-row">
                  <dt>Desconto</dt>
                  <dd>- {formatCurrency(viewedOrder.discountAmount)}</dd>
                </div>
              )}
              <div className="pedidos-admin-modal__total-row pedidos-admin-modal__total-row--grand">
                <dt>Total</dt>
                <dd>{formatCurrency(viewedOrder.total)}</dd>
              </div>
            </dl>

            <div className="pedidos-admin-modal__actions">
              <Button variant="outline-neutral" onClick={() => setViewedOrderId(null)}>
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: confirmar cancelamento */}
      {orderToCancel && (
        <div
          className="pedidos-admin-modal"
          role="presentation"
          onClick={() => {
            if (updatingOrderId === null) {
              setOrderToCancel(null);
            }
          }}
        >
          <div
            className="pedidos-admin-modal__dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="pedidos-admin-cancel-title"
            aria-describedby="pedidos-admin-cancel-text"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="pedidos-admin-cancel-title" className="pedidos-admin-modal__title">
              Cancelar pedido
            </h3>
            <p id="pedidos-admin-cancel-text" className="pedidos-admin-modal__text">
              Tem certeza que deseja cancelar o pedido <strong>{orderToCancel.orderNumber}</strong>?
              O cancelamento é definitivo: o estoque dos itens e o uso do cupom serão restaurados.
            </p>

            <div className="pedidos-admin-modal__actions">
              <Button
                variant="outline-neutral"
                onClick={() => setOrderToCancel(null)}
                disabled={updatingOrderId !== null}
              >
                Manter pedido
              </Button>
              <Button
                variant="outline-danger"
                onClick={() => void handleConfirmCancel()}
                disabled={updatingOrderId !== null}
              >
                {updatingOrderId !== null ? 'Cancelando...' : 'Cancelar pedido'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PedidosAdmin;
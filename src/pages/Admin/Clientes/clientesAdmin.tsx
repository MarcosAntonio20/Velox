/**
 * VELOX — Admin / Clientes (rota "/admin/clientes").
 *
 * Renderizada dentro do AdminLayout (via <Outlet />), por isso não usa layout próprio.
 *
 * Fonte de dados: authService (getCustomers, updateProfile, blockCustomer,
 * unblockCustomer, deleteCustomer, getAddressesByUser).
 *
 * Total de pedidos: o authService não exporta essa contagem, então ela é feita aqui
 * lendo os pedidos do storage (mesma leitura que o authService usa internamente).
 *
 * Regras:
 * - Bloquear/Desbloquear alterna o status na hora (sem confirmação; é reversível).
 * - Excluir pede confirmação; clientes com pedidos são recusados pelo service.
 * - Busca (nome, e-mail, CPF ou telefone) e status valem no botão "Filtrar".
 */

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Eye, Lock, Pencil, Search, Trash2, Unlock } from 'lucide-react';
import { Button } from '../../../components/Ui/Button/Button';
import { Pagination } from '../../../components/Ui/Pagination/Pagination';
import { StatusBadge } from '../../../components/Ui/StatusBadge/StatusBadge';
import { orders as seedOrders } from '../../../data/mockData';
import {
  blockCustomer,
  deleteCustomer,
  getAddressesByUser,
  getCustomers,
  unblockCustomer,
  updateProfile,
  type UpdateProfileInput,
} from '../../../services/authService';
import { STORAGE_KEYS, readStorage } from '../../../services/storage';
import type { Order, User, UserAddress } from '../../../types';
import { normalizeText } from '../../../utils/helpers';
import './clientesAdmin.css';

/** Quantidade de clientes por página. */
const PAGE_SIZE = 6;

/** Tempo (ms) que a mensagem de sucesso fica visível. */
const FEEDBACK_DURATION_MS = 4000;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type StatusFilter = 'all' | 'active' | 'blocked';

interface StatusFilterOption {
  value: StatusFilter;
  label: string;
}

const STATUS_FILTER_OPTIONS: StatusFilterOption[] = [
  { value: 'all', label: 'Status: Todos' },
  { value: 'active', label: 'Status: Ativos' },
  { value: 'blocked', label: 'Status: Bloqueados' },
];

interface AppliedFilters {
  search: string;
  status: StatusFilter;
}

const INITIAL_FILTERS: AppliedFilters = { search: '', status: 'all' };

interface EditForm {
  name: string;
  email: string;
  phone: string;
  /** Data no formato "AAAA-MM-DD" (valor do input type="date"). */
  birthDate: string;
}

type EditErrors = Partial<Record<keyof EditForm, string>>;

/* ==========================================================================
   Helpers
   ========================================================================== */

/** Iniciais do cliente (primeira letra do primeiro e do último nome). */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return '?';
  }

  const first = parts[0].charAt(0);
  const second = parts.length > 1 ? parts[parts.length - 1].charAt(0) : parts[0].charAt(1);

  return `${first}${second}`.toUpperCase();
}

/** Data de cadastro em dd/mm/aaaa (data local). */
const formatDate = (iso: string): string => new Date(iso).toLocaleDateString('pt-BR');

/** Data ISO -> "AAAA-MM-DD" (data UTC, sem deslocar o dia por fuso horário). */
function toDateInputValue(iso: string): string {
  const date = new Date(iso);

  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

/** "AAAA-MM-DD" -> "dd/mm/aaaa" sem passar por Date. */
function formatDateValue(value: string): string {
  if (!value) {
    return '—';
  }

  const [year, month, day] = value.split('-');

  return `${day}/${month}/${year}`;
}

const todayValue = (): string => {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');

  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/** Conta os pedidos de cada cliente lendo o storage de pedidos. */
function countOrdersByUser(): Record<number, number> {
  const orders = readStorage<Order[]>(STORAGE_KEYS.orders, () => seedOrders);
  const counts: Record<number, number> = {};

  orders.forEach((order) => {
    counts[order.userId] = (counts[order.userId] ?? 0) + 1;
  });

  return counts;
}

function validateEditForm(form: EditForm): EditErrors {
  const errors: EditErrors = {};

  if (!form.name.trim()) {
    errors.name = 'Informe o nome do cliente.';
  }

  if (!EMAIL_PATTERN.test(form.email.trim())) {
    errors.email = 'Informe um e-mail válido.';
  }

  if (!form.phone.trim()) {
    errors.phone = 'Informe o telefone.';
  }

  if (!form.birthDate) {
    errors.birthDate = 'Informe a data de nascimento.';
  } else if (form.birthDate > todayValue()) {
    errors.birthDate = 'A data de nascimento não pode estar no futuro.';
  }

  return errors;
}

/* ==========================================================================
   Tela
   ========================================================================== */

export function ClientesAdmin() {
  const [customers, setCustomers] = useState<User[]>([]);
  const [orderCounts, setOrderCounts] = useState<Record<number, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<number | null>(null);

  /* Filtros: o que está sendo digitado x o que foi aplicado no "Filtrar". */
  const [searchDraft, setSearchDraft] = useState('');
  const [statusDraft, setStatusDraft] = useState<StatusFilter>('all');
  const [appliedFilters, setAppliedFilters] = useState<AppliedFilters>(INITIAL_FILTERS);
  const [currentPage, setCurrentPage] = useState(1);

  /* Modal: ver cliente. */
  const [viewedCustomerId, setViewedCustomerId] = useState<number | null>(null);
  const [viewedAddresses, setViewedAddresses] = useState<UserAddress[]>([]);
  const [isAddressesLoading, setIsAddressesLoading] = useState(false);

  /* Modal: editar cliente. */
  const [editingCustomer, setEditingCustomer] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editErrors, setEditErrors] = useState<EditErrors>({});
  const [editSubmitError, setEditSubmitError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  /* Modal: excluir cliente. */
  const [customerToDelete, setCustomerToDelete] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  /* ------------------------------------------------------------------------
     Carga de dados
     ------------------------------------------------------------------------ */
  useEffect(() => {
    let isCancelled = false;

    async function loadData(): Promise<void> {
      try {
        const loadedCustomers = await getCustomers();

        if (!isCancelled) {
          // Mesma ordem da referência: por cadastro (id crescente).
          setCustomers([...loadedCustomers].sort((a, b) => a.id - b.id));
          setOrderCounts(countOrdersByUser());
        }
      } catch (error) {
        if (!isCancelled) {
          setLoadError(
            error instanceof Error ? error.message : 'Não foi possível carregar os clientes.',
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

  // Carrega os endereços ao abrir o modal "Ver".
  useEffect(() => {
    if (viewedCustomerId === null) {
      setViewedAddresses([]);
      return undefined;
    }

    let isCancelled = false;

    setIsAddressesLoading(true);

    getAddressesByUser(viewedCustomerId)
      .then((addresses) => {
        if (!isCancelled) {
          setViewedAddresses(addresses);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setViewedAddresses([]);
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsAddressesLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [viewedCustomerId]);

  // Esc fecha o modal aberto (exceto durante uma operação em andamento).
  useEffect(() => {
    if (viewedCustomerId === null && !editingCustomer && !customerToDelete) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') {
        return;
      }

      setViewedCustomerId(null);

      if (!isSaving) {
        setEditingCustomer(null);
      }

      if (!isDeleting) {
        setCustomerToDelete(null);
        setDeleteError(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewedCustomerId, editingCustomer, customerToDelete, isSaving, isDeleting]);

  /* ------------------------------------------------------------------------
     Derivações
     ------------------------------------------------------------------------ */
  const filteredCustomers = useMemo<User[]>(() => {
    const normalizedSearch = normalizeText(appliedFilters.search);

    return customers.filter((customer) => {
      if (appliedFilters.status === 'active' && !customer.isActive) {
        return false;
      }

      if (appliedFilters.status === 'blocked' && customer.isActive) {
        return false;
      }

      if (
        normalizedSearch &&
        !normalizeText(`${customer.name} ${customer.email} ${customer.cpf} ${customer.phone}`).includes(
          normalizedSearch,
        )
      ) {
        return false;
      }

      return true;
    });
  }, [customers, appliedFilters]);

  const totalCustomers = filteredCustomers.length;
  const totalPages = Math.max(1, Math.ceil(totalCustomers / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  const pageCustomers = useMemo<User[]>(
    () => filteredCustomers.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredCustomers, safePage],
  );

  const rangeStart = totalCustomers === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, totalCustomers);

  const viewedCustomer = useMemo<User | null>(
    () => customers.find((customer) => customer.id === viewedCustomerId) ?? null,
    [customers, viewedCustomerId],
  );

  const getOrderCount = (userId: number): number => orderCounts[userId] ?? 0;

  /* ------------------------------------------------------------------------
     Handlers: filtros
     ------------------------------------------------------------------------ */
  const handleApplyFilters = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    setAppliedFilters({ search: searchDraft.trim(), status: statusDraft });
    setCurrentPage(1);
  };

  const handleChangeStatus = (value: string): void => {
    const selected = STATUS_FILTER_OPTIONS.find((option) => option.value === value);

    if (selected) {
      setStatusDraft(selected.value);
    }
  };

  /* ------------------------------------------------------------------------
     Handler: bloquear / desbloquear
     ------------------------------------------------------------------------ */
  const handleToggleBlock = async (customer: User): Promise<void> => {
    if (busyUserId !== null) {
      return;
    }

    setActionError(null);
    setBusyUserId(customer.id);

    try {
      const updatedCustomer = customer.isActive
        ? await blockCustomer(customer.id)
        : await unblockCustomer(customer.id);

      setCustomers((previous) =>
        previous.map((item) => (item.id === updatedCustomer.id ? updatedCustomer : item)),
      );
      setSuccessMessage(
        updatedCustomer.isActive
          ? `${updatedCustomer.name} foi desbloqueado(a).`
          : `${updatedCustomer.name} foi bloqueado(a).`,
      );
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Não foi possível alterar o status do cliente.',
      );
    } finally {
      setBusyUserId(null);
    }
  };

  /* ------------------------------------------------------------------------
     Handlers: editar
     ------------------------------------------------------------------------ */
  const handleOpenEdit = (customer: User): void => {
    setEditingCustomer(customer);
    setEditForm({
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      birthDate: toDateInputValue(customer.birthDate),
    });
    setEditErrors({});
    setEditSubmitError(null);
  };

  const handleCloseEdit = (): void => {
    if (!isSaving) {
      setEditingCustomer(null);
    }
  };

  const updateEditField = <K extends keyof EditForm>(key: K, value: EditForm[K]): void => {
    setEditForm((previous) => (previous ? { ...previous, [key]: value } : previous));
    setEditErrors((previous) => (previous[key] ? { ...previous, [key]: undefined } : previous));
  };

  const handleSubmitEdit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (!editingCustomer || !editForm || isSaving) {
      return;
    }

    const validationErrors = validateEditForm(editForm);

    setEditErrors(validationErrors);
    setEditSubmitError(null);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    const input: UpdateProfileInput = {
      name: editForm.name.trim(),
      email: editForm.email.trim(),
      phone: editForm.phone.trim(),
    };

    // Só envia a data de nascimento se ela mudou (evita regravar o valor original).
    if (editForm.birthDate !== toDateInputValue(editingCustomer.birthDate)) {
      input.birthDate = editForm.birthDate;
    }

    setIsSaving(true);

    try {
      const updatedCustomer = await updateProfile(editingCustomer.id, input);

      setCustomers((previous) =>
        previous.map((item) => (item.id === updatedCustomer.id ? updatedCustomer : item)),
      );
      setSuccessMessage(`Dados de ${updatedCustomer.name} atualizados.`);
      setEditingCustomer(null);
    } catch (error) {
      setEditSubmitError(
        error instanceof Error ? error.message : 'Não foi possível salvar as alterações.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  /* ------------------------------------------------------------------------
     Handlers: excluir
     ------------------------------------------------------------------------ */
  const handleCloseDelete = (): void => {
    if (isDeleting) {
      return;
    }

    setCustomerToDelete(null);
    setDeleteError(null);
  };

  const handleConfirmDelete = async (): Promise<void> => {
    if (!customerToDelete) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      await deleteCustomer(customerToDelete.id);
      setCustomers((previous) => previous.filter((item) => item.id !== customerToDelete.id));
      setSuccessMessage(`Cliente ${customerToDelete.name} excluído.`);
      setCustomerToDelete(null);
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : 'Não foi possível excluir o cliente.',
      );
    } finally {
      setIsDeleting(false);
    }
  };

  /* ------------------------------------------------------------------------
     Render
     ------------------------------------------------------------------------ */
  return (
    <div className="clientes-admin">
      <header className="clientes-admin__header">
        <h2 className="clientes-admin__title">Clientes</h2>
      </header>

      <section className="clientes-admin__card">
        {/* Filtros */}
        <form className="clientes-admin-filters" onSubmit={handleApplyFilters}>
          <label className="clientes-admin-filters__search">
            <Search className="clientes-admin-filters__search-icon" aria-hidden="true" />
            <input
              type="search"
              className="clientes-admin-filters__input"
              placeholder="Pesquisar por nome ou e-mail..."
              aria-label="Pesquisar cliente por nome, e-mail, CPF ou telefone"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
            />
          </label>

          <select
            className="clientes-admin-filters__select"
            aria-label="Filtrar por status"
            value={statusDraft}
            onChange={(event) => handleChangeStatus(event.target.value)}
          >
            {STATUS_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <div className="clientes-admin-filters__submit">
            <Button type="submit" variant="primary">
              Filtrar
            </Button>
          </div>
        </form>

        {successMessage && (
          <p className="clientes-admin__feedback clientes-admin__feedback--success" role="status">
            {successMessage}
          </p>
        )}

        {actionError && (
          <p className="clientes-admin__feedback clientes-admin__feedback--error" role="alert">
            {actionError}
          </p>
        )}

        {loadError && (
          <p className="clientes-admin__feedback clientes-admin__feedback--error" role="alert">
            {loadError}
          </p>
        )}

        {isLoading && !loadError && (
          <p className="clientes-admin__feedback" role="status">
            Carregando clientes...
          </p>
        )}

        {!isLoading && !loadError && (
          <>
            {pageCustomers.length === 0 ? (
              <p className="clientes-admin__feedback">Nenhum cliente encontrado.</p>
            ) : (
              <div className="clientes-admin__table-wrapper">
                <table className="clientes-admin-table">
                  <thead>
                    <tr className="clientes-admin-table__head-row">
                      <th className="clientes-admin-table__head-cell" scope="col">
                        Cliente
                      </th>
                      <th className="clientes-admin-table__head-cell" scope="col">
                        E-mail
                      </th>
                      <th className="clientes-admin-table__head-cell" scope="col">
                        Cadastro
                      </th>
                      <th className="clientes-admin-table__head-cell" scope="col">
                        Pedidos
                      </th>
                      <th className="clientes-admin-table__head-cell" scope="col">
                        Status
                      </th>
                      <th className="clientes-admin-table__head-cell" scope="col">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageCustomers.map((customer) => (
                      <tr key={customer.id} className="clientes-admin-table__row">
                        <td className="clientes-admin-table__cell">
                          <div className="clientes-admin-table__customer">
                            <span className="clientes-admin__avatar" aria-hidden="true">
                              {getInitials(customer.name)}
                            </span>
                            <span className="clientes-admin-table__name">{customer.name}</span>
                          </div>
                        </td>
                        <td className="clientes-admin-table__cell clientes-admin-table__cell--email">
                          {customer.email}
                        </td>
                        <td className="clientes-admin-table__cell">
                          {formatDate(customer.createdAt)}
                        </td>
                        <td className="clientes-admin-table__cell clientes-admin-table__cell--orders">
                          {getOrderCount(customer.id)}
                        </td>
                        <td className="clientes-admin-table__cell">
                          <StatusBadge tone={customer.isActive ? 'success' : 'danger'}>
                            {customer.isActive ? 'Ativo' : 'Bloqueado'}
                          </StatusBadge>
                        </td>
                        <td className="clientes-admin-table__cell">
                          <div className="clientes-admin-table__actions">
                            <Button
                              variant="outline-neutral"
                              size="sm"
                              leftIcon={Eye}
                              onClick={() => setViewedCustomerId(customer.id)}
                            >
                              Ver
                            </Button>
                            <Button
                              variant="outline-neutral"
                              size="sm"
                              leftIcon={Pencil}
                              onClick={() => handleOpenEdit(customer)}
                            >
                              Editar
                            </Button>
                            <Button
                              variant="outline-neutral"
                              size="sm"
                              leftIcon={customer.isActive ? Lock : Unlock}
                              onClick={() => void handleToggleBlock(customer)}
                              disabled={busyUserId !== null}
                            >
                              {customer.isActive ? 'Bloquear' : 'Desbloquear'}
                            </Button>
                            <Button
                              variant="outline-danger"
                              size="sm"
                              leftIcon={Trash2}
                              onClick={() => setCustomerToDelete(customer)}
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

            <footer className="clientes-admin__footer">
              <p className="clientes-admin__summary">
                Exibindo {rangeStart}–{rangeEnd} de {totalCustomers}{' '}
                {totalCustomers === 1 ? 'cliente' : 'clientes'}
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

      {/* Modal: ver cliente */}
      {viewedCustomer && (
        <div
          className="clientes-admin-modal"
          role="presentation"
          onClick={() => setViewedCustomerId(null)}
        >
          <div
            className="clientes-admin-modal__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clientes-admin-view-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="clientes-admin-modal__heading">
              <span className="clientes-admin__avatar clientes-admin__avatar--large" aria-hidden="true">
                {getInitials(viewedCustomer.name)}
              </span>
              <div className="clientes-admin-modal__heading-text">
                <h3 id="clientes-admin-view-title" className="clientes-admin-modal__title">
                  {viewedCustomer.name}
                </h3>
                <span className="clientes-admin-modal__meta">
                  Cliente desde {formatDate(viewedCustomer.createdAt)}
                </span>
              </div>
              <StatusBadge tone={viewedCustomer.isActive ? 'success' : 'danger'}>
                {viewedCustomer.isActive ? 'Ativo' : 'Bloqueado'}
              </StatusBadge>
            </div>

            <dl className="clientes-admin-modal__details">
              <div className="clientes-admin-modal__detail">
                <dt className="clientes-admin-modal__detail-label">E-mail</dt>
                <dd className="clientes-admin-modal__detail-value">{viewedCustomer.email}</dd>
              </div>
              <div className="clientes-admin-modal__detail">
                <dt className="clientes-admin-modal__detail-label">Telefone</dt>
                <dd className="clientes-admin-modal__detail-value">{viewedCustomer.phone}</dd>
              </div>
              <div className="clientes-admin-modal__detail">
                <dt className="clientes-admin-modal__detail-label">CPF</dt>
                <dd className="clientes-admin-modal__detail-value">{viewedCustomer.cpf}</dd>
              </div>
              <div className="clientes-admin-modal__detail">
                <dt className="clientes-admin-modal__detail-label">Data de nascimento</dt>
                <dd className="clientes-admin-modal__detail-value">
                  {formatDateValue(toDateInputValue(viewedCustomer.birthDate))}
                </dd>
              </div>
              <div className="clientes-admin-modal__detail">
                <dt className="clientes-admin-modal__detail-label">Pedidos</dt>
                <dd className="clientes-admin-modal__detail-value">
                  {getOrderCount(viewedCustomer.id)}
                </dd>
              </div>
            </dl>

            <section className="clientes-admin-modal__addresses" aria-label="Endereços">
              <h4 className="clientes-admin-modal__block-title">Endereços</h4>

              {isAddressesLoading && (
                <p className="clientes-admin-modal__text">Carregando endereços...</p>
              )}

              {!isAddressesLoading && viewedAddresses.length === 0 && (
                <p className="clientes-admin-modal__text">Nenhum endereço cadastrado.</p>
              )}

              {!isAddressesLoading && viewedAddresses.length > 0 && (
                <ul className="clientes-admin-modal__address-list">
                  {viewedAddresses.map((address) => (
                    <li key={address.id} className="clientes-admin-modal__address">
                      <span className="clientes-admin-modal__address-label">
                        {address.label}
                        {address.isDefault ? ' · Padrão' : ''}
                      </span>
                      <span className="clientes-admin-modal__address-text">
                        {address.street}, {address.number}
                        {address.complement ? ` — ${address.complement}` : ''} ·{' '}
                        {address.neighborhood} · {address.city}/{address.state} · CEP{' '}
                        {address.zipCode}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className="clientes-admin-modal__actions">
              <Button variant="outline-neutral" onClick={() => setViewedCustomerId(null)}>
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: editar cliente */}
      {editingCustomer && editForm && (
        <div className="clientes-admin-modal" role="presentation" onClick={handleCloseEdit}>
          <form
            className="clientes-admin-modal__dialog clientes-admin-modal__dialog--narrow"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clientes-admin-edit-title"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => void handleSubmitEdit(event)}
            noValidate
          >
            <h3 id="clientes-admin-edit-title" className="clientes-admin-modal__title">
              Editar cliente
            </h3>

            <p className="clientes-admin-modal__info">
              CPF: <strong>{editingCustomer.cpf}</strong> (não editável)
            </p>

            <div className="clientes-admin-modal__field">
              <label className="clientes-admin-modal__label" htmlFor="clientes-admin-name">
                Nome
              </label>
              <input
                id="clientes-admin-name"
                type="text"
                className={
                  editErrors.name
                    ? 'clientes-admin-modal__input clientes-admin-modal__input--invalid'
                    : 'clientes-admin-modal__input'
                }
                value={editForm.name}
                onChange={(event) => updateEditField('name', event.target.value)}
                disabled={isSaving}
                autoFocus
              />
              {editErrors.name && (
                <span className="clientes-admin-modal__error" role="alert">
                  {editErrors.name}
                </span>
              )}
            </div>

            <div className="clientes-admin-modal__field">
              <label className="clientes-admin-modal__label" htmlFor="clientes-admin-email">
                E-mail
              </label>
              <input
                id="clientes-admin-email"
                type="email"
                className={
                  editErrors.email
                    ? 'clientes-admin-modal__input clientes-admin-modal__input--invalid'
                    : 'clientes-admin-modal__input'
                }
                value={editForm.email}
                onChange={(event) => updateEditField('email', event.target.value)}
                disabled={isSaving}
              />
              {editErrors.email && (
                <span className="clientes-admin-modal__error" role="alert">
                  {editErrors.email}
                </span>
              )}
            </div>

            <div className="clientes-admin-modal__row">
              <div className="clientes-admin-modal__field">
                <label className="clientes-admin-modal__label" htmlFor="clientes-admin-phone">
                  Telefone
                </label>
                <input
                  id="clientes-admin-phone"
                  type="text"
                  inputMode="tel"
                  className={
                    editErrors.phone
                      ? 'clientes-admin-modal__input clientes-admin-modal__input--invalid'
                      : 'clientes-admin-modal__input'
                  }
                  value={editForm.phone}
                  onChange={(event) => updateEditField('phone', event.target.value)}
                  disabled={isSaving}
                />
                {editErrors.phone && (
                  <span className="clientes-admin-modal__error" role="alert">
                    {editErrors.phone}
                  </span>
                )}
              </div>

              <div className="clientes-admin-modal__field">
                <label className="clientes-admin-modal__label" htmlFor="clientes-admin-birth">
                  Data de nascimento
                </label>
                <input
                  id="clientes-admin-birth"
                  type="date"
                  className={
                    editErrors.birthDate
                      ? 'clientes-admin-modal__input clientes-admin-modal__input--invalid'
                      : 'clientes-admin-modal__input'
                  }
                  max={todayValue()}
                  value={editForm.birthDate}
                  onChange={(event) => updateEditField('birthDate', event.target.value)}
                  disabled={isSaving}
                />
                {editErrors.birthDate && (
                  <span className="clientes-admin-modal__error" role="alert">
                    {editErrors.birthDate}
                  </span>
                )}
              </div>
            </div>

            {editSubmitError && (
              <p className="clientes-admin__feedback clientes-admin__feedback--error" role="alert">
                {editSubmitError}
              </p>
            )}

            <div className="clientes-admin-modal__actions">
              <Button type="button" variant="outline-neutral" onClick={handleCloseEdit} disabled={isSaving}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" disabled={isSaving}>
                {isSaving ? 'Salvando...' : 'Salvar alterações'}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: confirmação de exclusão */}
      {customerToDelete && (
        <div className="clientes-admin-modal" role="presentation" onClick={handleCloseDelete}>
          <div
            className="clientes-admin-modal__dialog clientes-admin-modal__dialog--narrow"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="clientes-admin-delete-title"
            aria-describedby="clientes-admin-delete-text"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="clientes-admin-delete-title" className="clientes-admin-modal__title">
              Excluir cliente
            </h3>
            <p id="clientes-admin-delete-text" className="clientes-admin-modal__text">
              Tem certeza que deseja excluir <strong>{customerToDelete.name}</strong>? A conta e os
              endereços serão removidos e a ação não pode ser desfeita. Clientes com pedidos não
              podem ser excluídos: nesse caso, bloqueie a conta.
            </p>

            {deleteError && (
              <p className="clientes-admin__feedback clientes-admin__feedback--error" role="alert">
                {deleteError}
              </p>
            )}

            <div className="clientes-admin-modal__actions">
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

export default ClientesAdmin;
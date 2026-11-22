/**
 * VELOX — Admin / Cupons (rota "/admin/cupons").
 *
 * Renderizada dentro do AdminLayout (via <Outlet />), por isso não usa layout próprio.
 *
 * Regras:
 * - Status: cupom com validade vencida = "Expirado" (tem prioridade); senão "Ativo" ou
 *   "Inativo" conforme `isActive`. A expiração segue a mesma regra do validateCoupon:
 *   new Date(expiresAt) < agora.
 * - A validade é escolhida como data (dd/mm/aaaa) e gravada como o fim daquele dia.
 * - Busca (código/descrição) e status são aplicados no botão "Filtrar".
 * - "Novo cupom" e "Editar" abrem o mesmo modal; "Excluir" pede confirmação.
 */

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '../../../components/Ui/Button/Button';
import { Pagination } from '../../../components/Ui/Pagination/Pagination';
import { StatusBadge, type BadgeTone } from '../../../components/Ui/StatusBadge/StatusBadge';
import {
  createCoupon,
  deleteCoupon,
  getCoupons,
  updateCoupon,
  type CouponInput,
} from '../../../services/productService';
import type { Coupon, CouponDiscountType } from '../../../types';
import { normalizeText } from '../../../utils/helpers';
import { formatCurrency } from '../../../utils/pricing';
import './adminCupons.css';

/** Quantidade de cupons por página. */
const PAGE_SIZE = 10;

/** Tempo (ms) que a mensagem de sucesso fica visível. */
const FEEDBACK_DURATION_MS = 4000;

type CouponStatus = 'active' | 'inactive' | 'expired';
type StatusFilter = 'all' | CouponStatus;

interface StatusMeta {
  label: string;
  tone: BadgeTone;
}

const STATUS_META: Record<CouponStatus, StatusMeta> = {
  active: { label: 'Ativo', tone: 'success' },
  inactive: { label: 'Inativo', tone: 'neutral' },
  expired: { label: 'Expirado', tone: 'danger' },
};

interface StatusFilterOption {
  value: StatusFilter;
  label: string;
}

const STATUS_FILTER_OPTIONS: StatusFilterOption[] = [
  { value: 'all', label: 'Status: Todos' },
  { value: 'active', label: 'Status: Ativos' },
  { value: 'inactive', label: 'Status: Inativos' },
  { value: 'expired', label: 'Status: Expirados' },
];

const DISCOUNT_TYPE_LABELS: Record<CouponDiscountType, string> = {
  percentage: 'Porcentagem',
  fixed: 'Valor fixo',
  shipping: 'Desconto no frete',
};

const DISCOUNT_TYPES: CouponDiscountType[] = ['percentage', 'fixed', 'shipping'];

const DISCOUNT_VALUE_LABELS: Record<CouponDiscountType, string> = {
  percentage: 'Valor do desconto (%)',
  fixed: 'Valor do desconto (R$)',
  shipping: 'Desconto no frete (%)',
};

interface FormState {
  code: string;
  description: string;
  discountType: CouponDiscountType;
  discountValue: string;
  minOrderValue: string;
  maxUses: string;
  /** Data no formato "AAAA-MM-DD" (valor do input type="date"). */
  expiresAt: string;
  isFirstPurchaseOnly: boolean;
  isActive: boolean;
}

type FormErrors = Partial<Record<keyof FormState, string>>;

const EMPTY_FORM: FormState = {
  code: '',
  description: '',
  discountType: 'percentage',
  discountValue: '',
  minOrderValue: '0',
  maxUses: '',
  expiresAt: '',
  isFirstPurchaseOnly: false,
  isActive: true,
};

interface AppliedFilters {
  search: string;
  status: StatusFilter;
}

const INITIAL_FILTERS: AppliedFilters = { search: '', status: 'all' };

/* ==========================================================================
   Helpers
   ========================================================================== */

const pad = (value: number): string => String(value).padStart(2, '0');

/** Converte uma data ISO em "AAAA-MM-DD" usando a data local. */
function toDateInputValue(iso: string): string {
  const date = new Date(iso);

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Converte "AAAA-MM-DD" no ISO do último instante daquele dia (horário local). */
function endOfDayIso(dateValue: string): string {
  const [year, month, day] = dateValue.split('-').map(Number);

  return new Date(year, month - 1, day, 23, 59, 59, 999).toISOString();
}

const formatDate = (iso: string): string => new Date(iso).toLocaleDateString('pt-BR');

const isExpired = (coupon: Coupon): boolean => new Date(coupon.expiresAt).getTime() < Date.now();

function getCouponStatus(coupon: Coupon): CouponStatus {
  if (isExpired(coupon)) {
    return 'expired';
  }

  return coupon.isActive ? 'active' : 'inactive';
}

const formatNumber = (value: number): string =>
  value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

function formatDiscountValue(coupon: Coupon): string {
  switch (coupon.discountType) {
    case 'fixed':
      return formatCurrency(coupon.discountValue);
    case 'shipping':
      return `${formatNumber(coupon.discountValue)}% no frete`;
    default:
      return `${formatNumber(coupon.discountValue)}%`;
  }
}

/** Converte "10,5" / "1.050,00" / "10.5" em número, ou null se inválido/vazio. */
function parseDecimal(value: string): number | null {
  const cleaned = value.replace(/[R$%\s]/g, '');

  if (!cleaned) {
    return null;
  }

  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned;
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

/** Converte um texto em inteiro >= 0, ou null se for inválido. */
function parseWholeNumber(value: string): number | null {
  const trimmed = value.trim();

  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

const formatDecimalInput = (value: number): string => String(value).replace('.', ',');

function couponToForm(coupon: Coupon): FormState {
  return {
    code: coupon.code,
    description: coupon.description,
    discountType: coupon.discountType,
    discountValue: formatDecimalInput(coupon.discountValue),
    minOrderValue: formatDecimalInput(coupon.minOrderValue),
    maxUses: String(coupon.maxUses),
    expiresAt: toDateInputValue(coupon.expiresAt),
    isFirstPurchaseOnly: coupon.isFirstPurchaseOnly,
    isActive: coupon.isActive,
  };
}

/** Valida o formulário e devolve as mensagens por campo (objeto vazio = válido). */
function validateForm(form: FormState, editingCoupon: Coupon | null): FormErrors {
  const errors: FormErrors = {};

  if (!form.code.trim()) {
    errors.code = 'Informe o código do cupom.';
  }

  const discountValue = parseDecimal(form.discountValue);

  if (discountValue === null || discountValue <= 0) {
    errors.discountValue = 'Informe um valor maior que zero.';
  } else if (form.discountType !== 'fixed' && discountValue > 100) {
    errors.discountValue = 'O desconto percentual não pode ser maior que 100%.';
  }

  if (form.minOrderValue.trim()) {
    const minOrderValue = parseDecimal(form.minOrderValue);

    if (minOrderValue === null || minOrderValue < 0) {
      errors.minOrderValue = 'Informe um valor válido (0 ou mais).';
    }
  }

  const maxUses = parseWholeNumber(form.maxUses);

  if (maxUses === null || maxUses < 1) {
    errors.maxUses = 'Informe um número inteiro maior que zero.';
  } else if (editingCoupon && maxUses < editingCoupon.usedCount) {
    errors.maxUses = `O limite não pode ser menor que os usos já realizados (${editingCoupon.usedCount}).`;
  }

  if (!form.expiresAt) {
    errors.expiresAt = 'Informe a data de validade.';
  } else if (!editingCoupon && form.expiresAt < toDateInputValue(new Date().toISOString())) {
    errors.expiresAt = 'A validade deve ser hoje ou uma data futura.';
  }

  return errors;
}

/* ==========================================================================
   Tela
   ========================================================================== */

export function AdminCupons() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  /* Filtros: o que está sendo digitado x o que foi aplicado no "Filtrar". */
  const [searchDraft, setSearchDraft] = useState('');
  const [statusDraft, setStatusDraft] = useState<StatusFilter>('all');
  const [appliedFilters, setAppliedFilters] = useState<AppliedFilters>(INITIAL_FILTERS);
  const [currentPage, setCurrentPage] = useState(1);

  /* Modal de criação/edição. */
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  /* Modal de exclusão. */
  const [couponToDelete, setCouponToDelete] = useState<Coupon | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  /* ------------------------------------------------------------------------
     Carga de dados
     ------------------------------------------------------------------------ */
  useEffect(() => {
    let isCancelled = false;

    async function loadCoupons(): Promise<void> {
      try {
        const loadedCoupons = await getCoupons();

        if (!isCancelled) {
          setCoupons(loadedCoupons);
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : 'Não foi possível carregar os cupons.',
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadCoupons();

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

  // Esc fecha o modal aberto (exceto durante uma operação em andamento).
  useEffect(() => {
    if (!isFormOpen && !couponToDelete) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') {
        return;
      }

      if (isFormOpen && !isSaving) {
        setIsFormOpen(false);
      }

      if (couponToDelete && !isDeleting) {
        setCouponToDelete(null);
        setDeleteError(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFormOpen, couponToDelete, isSaving, isDeleting]);

  /* ------------------------------------------------------------------------
     Derivações
     ------------------------------------------------------------------------ */
  const filteredCoupons = useMemo<Coupon[]>(() => {
    const normalizedSearch = normalizeText(appliedFilters.search);

    return coupons.filter((coupon) => {
      if (
        normalizedSearch &&
        !normalizeText(`${coupon.code} ${coupon.description}`).includes(normalizedSearch)
      ) {
        return false;
      }

      if (appliedFilters.status !== 'all' && getCouponStatus(coupon) !== appliedFilters.status) {
        return false;
      }

      return true;
    });
  }, [coupons, appliedFilters]);

  const totalCoupons = filteredCoupons.length;
  const totalPages = Math.max(1, Math.ceil(totalCoupons / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  const pageCoupons = useMemo<Coupon[]>(
    () => filteredCoupons.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredCoupons, safePage],
  );

  const rangeStart = totalCoupons === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, totalCoupons);
  const couponsLabel = totalCoupons === 1 ? 'cupom' : 'cupons';

  const summary =
    totalPages > 1
      ? `Exibindo ${rangeStart}–${rangeEnd} de ${totalCoupons} ${couponsLabel}`
      : `Exibindo ${totalCoupons} ${couponsLabel}`;

  const todayValue = toDateInputValue(new Date().toISOString());

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
     Handlers: modal de criação/edição
     ------------------------------------------------------------------------ */
  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]): void => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setFormErrors((previous) => (previous[key] ? { ...previous, [key]: undefined } : previous));
  };

  const handleOpenCreate = (): void => {
    setEditingCoupon(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setSubmitError(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (coupon: Coupon): void => {
    setEditingCoupon(coupon);
    setForm(couponToForm(coupon));
    setFormErrors({});
    setSubmitError(null);
    setIsFormOpen(true);
  };

  const handleCloseForm = (): void => {
    if (!isSaving) {
      setIsFormOpen(false);
    }
  };

  const handleSubmitForm = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (isSaving) {
      return;
    }

    const validationErrors = validateForm(form, editingCoupon);

    setFormErrors(validationErrors);
    setSubmitError(null);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    // Se a data não mudou na edição, preserva o instante original de expiração.
    const keepOriginalExpiry =
      editingCoupon !== null && form.expiresAt === toDateInputValue(editingCoupon.expiresAt);

    const input: CouponInput = {
      code: form.code.trim().toUpperCase(),
      description: form.description.trim(),
      discountType: form.discountType,
      discountValue: parseDecimal(form.discountValue) ?? 0,
      minOrderValue: form.minOrderValue.trim() ? (parseDecimal(form.minOrderValue) ?? 0) : 0,
      maxUses: parseWholeNumber(form.maxUses) ?? 1,
      isFirstPurchaseOnly: form.isFirstPurchaseOnly,
      isActive: form.isActive,
      expiresAt:
        keepOriginalExpiry && editingCoupon ? editingCoupon.expiresAt : endOfDayIso(form.expiresAt),
    };

    setIsSaving(true);

    try {
      if (editingCoupon) {
        const updatedCoupon = await updateCoupon(editingCoupon.id, input);

        setCoupons((previous) =>
          previous.map((coupon) => (coupon.id === updatedCoupon.id ? updatedCoupon : coupon)),
        );
        setSuccessMessage(`Cupom ${updatedCoupon.code} atualizado.`);
      } else {
        const createdCoupon = await createCoupon(input);

        setCoupons((previous) => [...previous, createdCoupon]);
        setSuccessMessage(`Cupom ${createdCoupon.code} criado.`);
      }

      setIsFormOpen(false);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Não foi possível salvar o cupom.');
    } finally {
      setIsSaving(false);
    }
  };

  /* ------------------------------------------------------------------------
     Handlers: exclusão
     ------------------------------------------------------------------------ */
  const handleCloseDelete = (): void => {
    if (isDeleting) {
      return;
    }

    setCouponToDelete(null);
    setDeleteError(null);
  };

  const handleConfirmDelete = async (): Promise<void> => {
    if (!couponToDelete) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      await deleteCoupon(couponToDelete.id);
      setCoupons((previous) => previous.filter((coupon) => coupon.id !== couponToDelete.id));
      setSuccessMessage(`Cupom ${couponToDelete.code} excluído.`);
      setCouponToDelete(null);
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : 'Não foi possível excluir o cupom.',
      );
    } finally {
      setIsDeleting(false);
    }
  };

  /* ------------------------------------------------------------------------
     Render
     ------------------------------------------------------------------------ */
  return (
    <div className="admin-cupons">
      <header className="admin-cupons__header">
        <h2 className="admin-cupons__title">Cupons</h2>
        <Button variant="primary" leftIcon={Plus} onClick={handleOpenCreate}>
          Novo cupom
        </Button>
      </header>

      <section className="admin-cupons__card">
        {/* Filtros */}
        <form className="admin-cupons-filters" onSubmit={handleApplyFilters}>
          <label className="admin-cupons-filters__search">
            <Search className="admin-cupons-filters__search-icon" aria-hidden="true" />
            <input
              type="search"
              className="admin-cupons-filters__input"
              placeholder="Pesquisar cupom..."
              aria-label="Pesquisar cupom por código ou descrição"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
            />
          </label>

          <select
            className="admin-cupons-filters__select"
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

          <div className="admin-cupons-filters__submit">
            <Button type="submit" variant="primary">
              Filtrar
            </Button>
          </div>
        </form>

        {successMessage && (
          <p className="admin-cupons__feedback admin-cupons__feedback--success" role="status">
            {successMessage}
          </p>
        )}

        {errorMessage && (
          <p className="admin-cupons__feedback admin-cupons__feedback--error" role="alert">
            {errorMessage}
          </p>
        )}

        {isLoading && !errorMessage && (
          <p className="admin-cupons__feedback" role="status">
            Carregando cupons...
          </p>
        )}

        {!isLoading && !errorMessage && (
          <>
            {pageCoupons.length === 0 ? (
              <p className="admin-cupons__feedback">Nenhum cupom encontrado.</p>
            ) : (
              <div className="admin-cupons__table-wrapper">
                <table className="admin-cupons-table">
                  <thead>
                    <tr className="admin-cupons-table__head-row">
                      <th className="admin-cupons-table__head-cell" scope="col">
                        Código
                      </th>
                      <th className="admin-cupons-table__head-cell" scope="col">
                        Tipo de desconto
                      </th>
                      <th className="admin-cupons-table__head-cell" scope="col">
                        Valor
                      </th>
                      <th className="admin-cupons-table__head-cell" scope="col">
                        Validade
                      </th>
                      <th className="admin-cupons-table__head-cell" scope="col">
                        Usos
                      </th>
                      <th className="admin-cupons-table__head-cell" scope="col">
                        Status
                      </th>
                      <th className="admin-cupons-table__head-cell" scope="col">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageCoupons.map((coupon) => {
                      const status = getCouponStatus(coupon);

                      return (
                        <tr key={coupon.id} className="admin-cupons-table__row">
                          <td className="admin-cupons-table__cell">
                            <span className="admin-cupons__code">{coupon.code}</span>
                          </td>
                          <td className="admin-cupons-table__cell">
                            {DISCOUNT_TYPE_LABELS[coupon.discountType]}
                          </td>
                          <td className="admin-cupons-table__cell admin-cupons-table__cell--value">
                            {formatDiscountValue(coupon)}
                          </td>
                          <td
                            className={
                              status === 'expired'
                                ? 'admin-cupons-table__cell admin-cupons-table__cell--expired'
                                : 'admin-cupons-table__cell'
                            }
                          >
                            {formatDate(coupon.expiresAt)}
                          </td>
                          <td className="admin-cupons-table__cell">
                            {coupon.usedCount} / {coupon.maxUses}
                          </td>
                          <td className="admin-cupons-table__cell">
                            <StatusBadge tone={STATUS_META[status].tone}>
                              {STATUS_META[status].label}
                            </StatusBadge>
                          </td>
                          <td className="admin-cupons-table__cell">
                            <div className="admin-cupons-table__actions">
                              <Button
                                variant="outline-neutral"
                                size="sm"
                                leftIcon={Pencil}
                                onClick={() => handleOpenEdit(coupon)}
                              >
                                Editar
                              </Button>
                              <Button
                                variant="outline-danger"
                                size="sm"
                                leftIcon={Trash2}
                                onClick={() => setCouponToDelete(coupon)}
                              >
                                Excluir
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <footer className="admin-cupons__footer">
              <p className="admin-cupons__summary">{summary}</p>
              <Pagination
                currentPage={safePage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </footer>
          </>
        )}
      </section>

      {/* Modal: novo cupom / editar cupom */}
      {isFormOpen && (
        <div className="admin-cupons-modal" role="presentation" onClick={handleCloseForm}>
          <form
            className="admin-cupons-modal__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-cupons-form-title"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => void handleSubmitForm(event)}
            noValidate
          >
            <h3 id="admin-cupons-form-title" className="admin-cupons-modal__title">
              {editingCoupon ? 'Editar cupom' : 'Novo cupom'}
            </h3>

            {editingCoupon && (
              <p className="admin-cupons-modal__info">
                Usos realizados: <strong>{editingCoupon.usedCount}</strong> de{' '}
                <strong>{editingCoupon.maxUses}</strong>
              </p>
            )}

            <div className="admin-cupons-modal__grid">
              <div className="admin-cupons-modal__field">
                <label className="admin-cupons-modal__label" htmlFor="admin-cupons-code">
                  Código
                </label>
                <input
                  id="admin-cupons-code"
                  type="text"
                  className={
                    formErrors.code
                      ? 'admin-cupons-modal__input admin-cupons-modal__input--code admin-cupons-modal__input--invalid'
                      : 'admin-cupons-modal__input admin-cupons-modal__input--code'
                  }
                  placeholder="EX.: VELOX10"
                  value={form.code}
                  onChange={(event) => updateField('code', event.target.value.toUpperCase())}
                  disabled={isSaving}
                  autoFocus
                />
                {formErrors.code && (
                  <span className="admin-cupons-modal__error" role="alert">
                    {formErrors.code}
                  </span>
                )}
              </div>

              <div className="admin-cupons-modal__field">
                <label className="admin-cupons-modal__label" htmlFor="admin-cupons-type">
                  Tipo de desconto
                </label>
                <select
                  id="admin-cupons-type"
                  className="admin-cupons-modal__select"
                  value={form.discountType}
                  onChange={(event) => {
                    const selected = DISCOUNT_TYPES.find((type) => type === event.target.value);

                    if (selected) {
                      updateField('discountType', selected);
                    }
                  }}
                  disabled={isSaving}
                >
                  {DISCOUNT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {DISCOUNT_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="admin-cupons-modal__field">
                <label className="admin-cupons-modal__label" htmlFor="admin-cupons-value">
                  {DISCOUNT_VALUE_LABELS[form.discountType]}
                </label>
                <input
                  id="admin-cupons-value"
                  type="text"
                  inputMode="decimal"
                  className={
                    formErrors.discountValue
                      ? 'admin-cupons-modal__input admin-cupons-modal__input--invalid'
                      : 'admin-cupons-modal__input'
                  }
                  value={form.discountValue}
                  onChange={(event) => updateField('discountValue', event.target.value)}
                  disabled={isSaving}
                />
                {formErrors.discountValue && (
                  <span className="admin-cupons-modal__error" role="alert">
                    {formErrors.discountValue}
                  </span>
                )}
              </div>

              <div className="admin-cupons-modal__field">
                <label className="admin-cupons-modal__label" htmlFor="admin-cupons-min">
                  Pedido mínimo (R$)
                </label>
                <input
                  id="admin-cupons-min"
                  type="text"
                  inputMode="decimal"
                  className={
                    formErrors.minOrderValue
                      ? 'admin-cupons-modal__input admin-cupons-modal__input--invalid'
                      : 'admin-cupons-modal__input'
                  }
                  value={form.minOrderValue}
                  onChange={(event) => updateField('minOrderValue', event.target.value)}
                  disabled={isSaving}
                />
                {formErrors.minOrderValue && (
                  <span className="admin-cupons-modal__error" role="alert">
                    {formErrors.minOrderValue}
                  </span>
                )}
              </div>

              <div className="admin-cupons-modal__field">
                <label className="admin-cupons-modal__label" htmlFor="admin-cupons-max-uses">
                  Limite de usos
                </label>
                <input
                  id="admin-cupons-max-uses"
                  type="text"
                  inputMode="numeric"
                  className={
                    formErrors.maxUses
                      ? 'admin-cupons-modal__input admin-cupons-modal__input--invalid'
                      : 'admin-cupons-modal__input'
                  }
                  value={form.maxUses}
                  onChange={(event) => updateField('maxUses', event.target.value)}
                  disabled={isSaving}
                />
                {formErrors.maxUses && (
                  <span className="admin-cupons-modal__error" role="alert">
                    {formErrors.maxUses}
                  </span>
                )}
              </div>

              <div className="admin-cupons-modal__field">
                <label className="admin-cupons-modal__label" htmlFor="admin-cupons-expires">
                  Validade
                </label>
                <input
                  id="admin-cupons-expires"
                  type="date"
                  className={
                    formErrors.expiresAt
                      ? 'admin-cupons-modal__input admin-cupons-modal__input--invalid'
                      : 'admin-cupons-modal__input'
                  }
                  min={editingCoupon ? undefined : todayValue}
                  value={form.expiresAt}
                  onChange={(event) => updateField('expiresAt', event.target.value)}
                  disabled={isSaving}
                />
                {formErrors.expiresAt && (
                  <span className="admin-cupons-modal__error" role="alert">
                    {formErrors.expiresAt}
                  </span>
                )}
              </div>
            </div>

            <div className="admin-cupons-modal__field">
              <label className="admin-cupons-modal__label" htmlFor="admin-cupons-description">
                Descrição <span className="admin-cupons-modal__optional">(opcional)</span>
              </label>
              <input
                id="admin-cupons-description"
                type="text"
                className="admin-cupons-modal__input"
                value={form.description}
                onChange={(event) => updateField('description', event.target.value)}
                disabled={isSaving}
              />
            </div>

            <div className="admin-cupons-modal__checks">
              <label className="admin-cupons-modal__check" htmlFor="admin-cupons-first-purchase">
                <input
                  id="admin-cupons-first-purchase"
                  type="checkbox"
                  className="admin-cupons-modal__checkbox"
                  checked={form.isFirstPurchaseOnly}
                  onChange={(event) => updateField('isFirstPurchaseOnly', event.target.checked)}
                  disabled={isSaving}
                />
                Válido apenas na primeira compra
              </label>

              <label className="admin-cupons-modal__check" htmlFor="admin-cupons-active">
                <input
                  id="admin-cupons-active"
                  type="checkbox"
                  className="admin-cupons-modal__checkbox"
                  checked={form.isActive}
                  onChange={(event) => updateField('isActive', event.target.checked)}
                  disabled={isSaving}
                />
                Cupom ativo
              </label>
            </div>

            {submitError && (
              <p className="admin-cupons__feedback admin-cupons__feedback--error" role="alert">
                {submitError}
              </p>
            )}

            <div className="admin-cupons-modal__actions">
              <Button type="button" variant="outline-neutral" onClick={handleCloseForm} disabled={isSaving}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" disabled={isSaving}>
                {isSaving ? 'Salvando...' : editingCoupon ? 'Salvar alterações' : 'Criar cupom'}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: confirmação de exclusão */}
      {couponToDelete && (
        <div className="admin-cupons-modal" role="presentation" onClick={handleCloseDelete}>
          <div
            className="admin-cupons-modal__dialog admin-cupons-modal__dialog--narrow"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="admin-cupons-delete-title"
            aria-describedby="admin-cupons-delete-text"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="admin-cupons-delete-title" className="admin-cupons-modal__title">
              Excluir cupom
            </h3>
            <p id="admin-cupons-delete-text" className="admin-cupons-modal__text">
              Tem certeza que deseja excluir o cupom <strong>{couponToDelete.code}</strong>? Esta
              ação não pode ser desfeita.
            </p>

            {deleteError && (
              <p className="admin-cupons__feedback admin-cupons__feedback--error" role="alert">
                {deleteError}
              </p>
            )}

            <div className="admin-cupons-modal__actions">
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

export default AdminCupons;
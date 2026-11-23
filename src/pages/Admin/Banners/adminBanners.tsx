/**
 * VELOX — Admin / Banners (rota "/admin/banners").
 *
 * Renderizada dentro do AdminLayout (via <Outlet />), por isso não usa layout próprio.
 *
 * Regras:
 * - O interruptor da tabela ativa/desativa o banner na Home na hora: atualiza a tela
 *   imediatamente e chama updateBanner(id, { isActive }); se falhar, desfaz a mudança.
 * - O tipo Banner não possui período de promoção: início e fim ficam no localStorage
 *   por banner (apenas informativo; não altera o que a Home exibe).
 * - Busca (título/subtítulo) e status são aplicados no botão "Filtrar".
 * - "Novo banner" e "Editar" abrem o mesmo modal; "Excluir" pede confirmação.
 * - Imagem: lida como data URL (sem back-end); limite de 1 MB por causa do localStorage.
 */

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { ImagePlus, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '../../../components/Ui/Button/Button';
import { Pagination } from '../../../components/Ui/Pagination/Pagination';
import { StatusBadge } from '../../../components/Ui/StatusBadge/StatusBadge';
import {
  createBanner,
  deleteBanner,
  getBanners,
  updateBanner,
  type BannerInput,
} from '../../../services/productService';
import { STORAGE_PREFIX, readStorage, writeStorage } from '../../../services/storage';
import type { Banner, BannerPosition } from '../../../types';
import { normalizeText } from '../../../utils/helpers';
import './adminBanners.css';

/** Quantidade de banners por página. */
const PAGE_SIZE = 10;

/** Tempo (ms) que a mensagem de sucesso fica visível. */
const FEEDBACK_DURATION_MS = 4000;

/** Chave do localStorage com o período de promoção por banner. */
const PERIODS_STORAGE_KEY = `${STORAGE_PREFIX}banner-periods`;

/** Tipos de imagem aceitos e tamanho máximo (bytes). */
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg'];
const MAX_IMAGE_SIZE_BYTES = 1024 * 1024;

const DEFAULT_BUTTON_LABEL = 'Aproveite';
const DEFAULT_LINK_URL = '/catalogo';

type StatusFilter = 'all' | 'active' | 'inactive';

interface StatusFilterOption {
  value: StatusFilter;
  label: string;
}

const STATUS_FILTER_OPTIONS: StatusFilterOption[] = [
  { value: 'all', label: 'Status: Todos' },
  { value: 'active', label: 'Status: Ativos' },
  { value: 'inactive', label: 'Status: Inativos' },
];

const POSITION_LABELS: Record<BannerPosition, string> = {
  hero: 'Principal (carrossel da Home)',
  secondary: 'Secundário',
};

const POSITIONS: BannerPosition[] = ['hero', 'secondary'];

/** Período da promoção, em datas "AAAA-MM-DD". */
interface BannerPeriod {
  startsAt: string;
  endsAt: string;
}

type PeriodsMap = Record<number, BannerPeriod>;

interface FormState {
  title: string;
  subtitle: string;
  imageUrl: string;
  linkUrl: string;
  buttonLabel: string;
  position: BannerPosition;
  displayOrder: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
}

type FormErrors = Partial<Record<keyof FormState, string>>;

interface AppliedFilters {
  search: string;
  status: StatusFilter;
}

const INITIAL_FILTERS: AppliedFilters = { search: '', status: 'all' };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/* ==========================================================================
   Helpers
   ========================================================================== */

/** Lê os períodos salvos, descartando entradas inválidas. */
function loadPeriods(): PeriodsMap {
  const stored = readStorage<Record<string, BannerPeriod>>(PERIODS_STORAGE_KEY, () => ({}));
  const periods: PeriodsMap = {};

  Object.entries(stored).forEach(([bannerId, period]) => {
    if (
      period &&
      typeof period.startsAt === 'string' &&
      typeof period.endsAt === 'string' &&
      DATE_PATTERN.test(period.startsAt) &&
      DATE_PATTERN.test(period.endsAt)
    ) {
      periods[Number(bannerId)] = period;
    }
  });

  return periods;
}

/** "2026-10-01" -> "01/10/2026" (sem passar por Date, para não sofrer com fuso horário). */
function formatDateValue(value: string): string {
  const [year, month, day] = value.split('-');

  return `${day}/${month}/${year}`;
}

function formatPeriod(period: BannerPeriod | undefined): string {
  if (!period) {
    return '—';
  }

  return `${formatDateValue(period.startsAt)} a ${formatDateValue(period.endsAt)}`;
}

/** Converte um texto em inteiro >= 0, ou null se for inválido. */
function parseWholeNumber(value: string): number | null {
  const trimmed = value.trim();

  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

function bannerToForm(banner: Banner, period: BannerPeriod | undefined): FormState {
  return {
    title: banner.title,
    subtitle: banner.subtitle,
    imageUrl: banner.imageUrl,
    linkUrl: banner.linkUrl,
    buttonLabel: banner.buttonLabel,
    position: banner.position,
    displayOrder: String(banner.displayOrder),
    startsAt: period ? period.startsAt : '',
    endsAt: period ? period.endsAt : '',
    isActive: banner.isActive,
  };
}

/** Valida o formulário e devolve as mensagens por campo (objeto vazio = válido). */
function validateForm(form: FormState): FormErrors {
  const errors: FormErrors = {};

  if (!form.title.trim()) {
    errors.title = 'Informe o título do banner.';
  }

  if (!form.imageUrl) {
    errors.imageUrl = 'Escolha uma imagem para o banner.';
  }

  if (!form.linkUrl.trim()) {
    errors.linkUrl = 'Informe o link do botão (ex.: /catalogo).';
  }

  if (!form.buttonLabel.trim()) {
    errors.buttonLabel = 'Informe o texto do botão.';
  }

  if (parseWholeNumber(form.displayOrder) === null) {
    errors.displayOrder = 'Informe um número inteiro (0 ou mais).';
  }

  if (form.startsAt && !form.endsAt) {
    errors.endsAt = 'Informe a data final do período.';
  } else if (!form.startsAt && form.endsAt) {
    errors.startsAt = 'Informe a data inicial do período.';
  } else if (form.startsAt && form.endsAt && form.endsAt < form.startsAt) {
    errors.endsAt = 'A data final deve ser igual ou posterior à inicial.';
  }

  return errors;
}

/* ==========================================================================
   Tela
   ========================================================================== */

export function AdminBanners() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [banners, setBanners] = useState<Banner[]>([]);
  const [periods, setPeriods] = useState<PeriodsMap>(loadPeriods);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [togglingIds, setTogglingIds] = useState<number[]>([]);

  /* Filtros: o que está sendo digitado x o que foi aplicado no "Filtrar". */
  const [searchDraft, setSearchDraft] = useState('');
  const [statusDraft, setStatusDraft] = useState<StatusFilter>('all');
  const [appliedFilters, setAppliedFilters] = useState<AppliedFilters>(INITIAL_FILTERS);
  const [currentPage, setCurrentPage] = useState(1);

  /* Modal de criação/edição. */
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  /* Modal de exclusão. */
  const [bannerToDelete, setBannerToDelete] = useState<Banner | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  /* ------------------------------------------------------------------------
     Carga de dados
     ------------------------------------------------------------------------ */
  useEffect(() => {
    let isCancelled = false;

    async function loadBanners(): Promise<void> {
      try {
        const loadedBanners = await getBanners({ includeInactive: true });

        if (!isCancelled) {
          setBanners(loadedBanners);
        }
      } catch (error) {
        if (!isCancelled) {
          setLoadError(
            error instanceof Error ? error.message : 'Não foi possível carregar os banners.',
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadBanners();

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
    if (!isFormOpen && !bannerToDelete) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') {
        return;
      }

      if (isFormOpen && !isSaving) {
        setIsFormOpen(false);
      }

      if (bannerToDelete && !isDeleting) {
        setBannerToDelete(null);
        setDeleteError(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFormOpen, bannerToDelete, isSaving, isDeleting]);

  /* ------------------------------------------------------------------------
     Derivações
     ------------------------------------------------------------------------ */
  const filteredBanners = useMemo<Banner[]>(() => {
    const normalizedSearch = normalizeText(appliedFilters.search);

    return banners.filter((banner) => {
      if (
        normalizedSearch &&
        !normalizeText(`${banner.title} ${banner.subtitle}`).includes(normalizedSearch)
      ) {
        return false;
      }

      if (appliedFilters.status === 'active' && !banner.isActive) {
        return false;
      }

      if (appliedFilters.status === 'inactive' && banner.isActive) {
        return false;
      }

      return true;
    });
  }, [banners, appliedFilters]);

  const totalBanners = filteredBanners.length;
  const totalPages = Math.max(1, Math.ceil(totalBanners / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  const pageBanners = useMemo<Banner[]>(
    () => filteredBanners.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredBanners, safePage],
  );

  const rangeStart = totalBanners === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, totalBanners);
  const bannersLabel = totalBanners === 1 ? 'banner' : 'banners';

  const summary =
    totalPages > 1
      ? `Exibindo ${rangeStart}–${rangeEnd} de ${totalBanners} ${bannersLabel}`
      : `Exibindo ${totalBanners} ${bannersLabel}`;

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
     Handler: interruptor ativo/inativo (tempo real)
     ------------------------------------------------------------------------ */
  const handleToggleActive = async (banner: Banner): Promise<void> => {
    if (togglingIds.includes(banner.id)) {
      return;
    }

    const nextActive = !banner.isActive;

    setActionError(null);
    setTogglingIds((previous) => [...previous, banner.id]);
    // Atualiza a tela imediatamente; desfaz se o service falhar.
    setBanners((previous) =>
      previous.map((item) => (item.id === banner.id ? { ...item, isActive: nextActive } : item)),
    );

    try {
      const updatedBanner = await updateBanner(banner.id, { isActive: nextActive });

      setBanners((previous) =>
        previous.map((item) => (item.id === updatedBanner.id ? updatedBanner : item)),
      );
    } catch (error) {
      setBanners((previous) =>
        previous.map((item) =>
          item.id === banner.id ? { ...item, isActive: banner.isActive } : item,
        ),
      );
      setActionError(
        error instanceof Error ? error.message : 'Não foi possível alterar o status do banner.',
      );
    } finally {
      setTogglingIds((previous) => previous.filter((id) => id !== banner.id));
    }
  };

  /* ------------------------------------------------------------------------
     Handlers: modal de criação/edição
     ------------------------------------------------------------------------ */
  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]): void => {
    setForm((previous) => (previous ? { ...previous, [key]: value } : previous));
    setFormErrors((previous) => (previous[key] ? { ...previous, [key]: undefined } : previous));
  };

  const handleOpenCreate = (): void => {
    const nextOrder = banners.reduce((max, banner) => Math.max(max, banner.displayOrder), 0) + 1;

    setEditingBanner(null);
    setForm({
      title: '',
      subtitle: '',
      imageUrl: '',
      linkUrl: DEFAULT_LINK_URL,
      buttonLabel: DEFAULT_BUTTON_LABEL,
      position: 'hero',
      displayOrder: String(nextOrder),
      startsAt: '',
      endsAt: '',
      isActive: true,
    });
    setFormErrors({});
    setSubmitError(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (banner: Banner): void => {
    setEditingBanner(banner);
    setForm(bannerToForm(banner, periods[banner.id]));
    setFormErrors({});
    setSubmitError(null);
    setIsFormOpen(true);
  };

  const handleCloseForm = (): void => {
    if (!isSaving) {
      setIsFormOpen(false);
    }
  };

  const handleChooseImage = (): void => {
    fileInputRef.current?.click();
  };

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];

    // Permite escolher o mesmo arquivo novamente depois.
    event.target.value = '';

    if (!file) {
      return;
    }

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setFormErrors((previous) => ({ ...previous, imageUrl: 'Use uma imagem PNG ou JPG.' }));
      return;
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setFormErrors((previous) => ({ ...previous, imageUrl: 'A imagem deve ter até 1 MB.' }));
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        updateField('imageUrl', reader.result);
      }
    };

    reader.onerror = () => {
      setFormErrors((previous) => ({ ...previous, imageUrl: 'Não foi possível ler a imagem.' }));
    };

    reader.readAsDataURL(file);
  };

  /** Salva (ou remove, se vazio) o período do banner no localStorage. */
  const persistPeriod = (bannerId: number, startsAt: string, endsAt: string): void => {
    const nextPeriods: PeriodsMap = { ...periods };

    if (startsAt && endsAt) {
      nextPeriods[bannerId] = { startsAt, endsAt };
    } else {
      delete nextPeriods[bannerId];
    }

    setPeriods(nextPeriods);
    writeStorage(PERIODS_STORAGE_KEY, nextPeriods);
  };

  const handleSubmitForm = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (!form || isSaving) {
      return;
    }

    const validationErrors = validateForm(form);

    setFormErrors(validationErrors);
    setSubmitError(null);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    const input: BannerInput = {
      title: form.title.trim(),
      subtitle: form.subtitle.trim(),
      imageUrl: form.imageUrl,
      linkUrl: form.linkUrl.trim(),
      buttonLabel: form.buttonLabel.trim(),
      position: form.position,
      displayOrder: parseWholeNumber(form.displayOrder) ?? 0,
      isActive: form.isActive,
    };

    setIsSaving(true);

    try {
      if (editingBanner) {
        const updatedBanner = await updateBanner(editingBanner.id, input);

        setBanners((previous) =>
          [...previous.map((banner) => (banner.id === updatedBanner.id ? updatedBanner : banner))].sort(
            (a, b) => a.displayOrder - b.displayOrder || a.id - b.id,
          ),
        );
        persistPeriod(updatedBanner.id, form.startsAt, form.endsAt);
        setSuccessMessage(`Banner "${updatedBanner.title}" atualizado.`);
      } else {
        const createdBanner = await createBanner(input);

        setBanners((previous) =>
          [...previous, createdBanner].sort(
            (a, b) => a.displayOrder - b.displayOrder || a.id - b.id,
          ),
        );
        persistPeriod(createdBanner.id, form.startsAt, form.endsAt);
        setSuccessMessage(`Banner "${createdBanner.title}" criado.`);
      }

      setIsFormOpen(false);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Não foi possível salvar o banner.');
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

    setBannerToDelete(null);
    setDeleteError(null);
  };

  const handleConfirmDelete = async (): Promise<void> => {
    if (!bannerToDelete) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      await deleteBanner(bannerToDelete.id);
      setBanners((previous) => previous.filter((banner) => banner.id !== bannerToDelete.id));
      persistPeriod(bannerToDelete.id, '', '');
      setSuccessMessage(`Banner "${bannerToDelete.title}" excluído.`);
      setBannerToDelete(null);
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : 'Não foi possível excluir o banner.',
      );
    } finally {
      setIsDeleting(false);
    }
  };

  /* ------------------------------------------------------------------------
     Render
     ------------------------------------------------------------------------ */
  return (
    <div className="admin-banners">
      <header className="admin-banners__header">
        <h2 className="admin-banners__title">Banners da Home</h2>
        <Button variant="primary" leftIcon={Plus} onClick={handleOpenCreate}>
          Novo banner
        </Button>
      </header>

      <section className="admin-banners__card">
        {/* Filtros */}
        <form className="admin-banners-filters" onSubmit={handleApplyFilters}>
          <label className="admin-banners-filters__search">
            <Search className="admin-banners-filters__search-icon" aria-hidden="true" />
            <input
              type="search"
              className="admin-banners-filters__input"
              placeholder="Pesquisar banner..."
              aria-label="Pesquisar banner por título"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
            />
          </label>

          <select
            className="admin-banners-filters__select"
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

          <div className="admin-banners-filters__submit">
            <Button type="submit" variant="primary">
              Filtrar
            </Button>
          </div>
        </form>

        {successMessage && (
          <p className="admin-banners__feedback admin-banners__feedback--success" role="status">
            {successMessage}
          </p>
        )}

        {actionError && (
          <p className="admin-banners__feedback admin-banners__feedback--error" role="alert">
            {actionError}
          </p>
        )}

        {loadError && (
          <p className="admin-banners__feedback admin-banners__feedback--error" role="alert">
            {loadError}
          </p>
        )}

        {isLoading && !loadError && (
          <p className="admin-banners__feedback" role="status">
            Carregando banners...
          </p>
        )}

        {!isLoading && !loadError && (
          <>
            {pageBanners.length === 0 ? (
              <p className="admin-banners__feedback">Nenhum banner encontrado.</p>
            ) : (
              <div className="admin-banners__table-wrapper">
                <table className="admin-banners-table">
                  <thead>
                    <tr className="admin-banners-table__head-row">
                      <th className="admin-banners-table__head-cell" scope="col">
                        Banner
                      </th>
                      <th className="admin-banners-table__head-cell" scope="col">
                        Título
                      </th>
                      <th className="admin-banners-table__head-cell" scope="col">
                        Período da promoção
                      </th>
                      <th className="admin-banners-table__head-cell" scope="col">
                        Status
                      </th>
                      <th className="admin-banners-table__head-cell" scope="col">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageBanners.map((banner) => (
                      <tr key={banner.id} className="admin-banners-table__row">
                        <td className="admin-banners-table__cell">
                          <span className="admin-banners-table__thumb">
                            <img
                              className="admin-banners-table__thumb-image"
                              src={banner.imageUrl}
                              alt={`Banner: ${banner.title}`}
                              loading="lazy"
                            />
                          </span>
                        </td>
                        <td className="admin-banners-table__cell admin-banners-table__cell--title">
                          {banner.title}
                        </td>
                        <td className="admin-banners-table__cell admin-banners-table__cell--period">
                          {formatPeriod(periods[banner.id])}
                        </td>
                        <td className="admin-banners-table__cell">
                          <div className="admin-banners-table__status">
                            <input
                              type="checkbox"
                              role="switch"
                              className="admin-banners__switch"
                              checked={banner.isActive}
                              disabled={togglingIds.includes(banner.id)}
                              aria-label={`${banner.isActive ? 'Desativar' : 'Ativar'} o banner ${banner.title} na Home`}
                              onChange={() => void handleToggleActive(banner)}
                            />
                            <StatusBadge tone={banner.isActive ? 'success' : 'neutral'}>
                              {banner.isActive ? 'Ativo' : 'Inativo'}
                            </StatusBadge>
                          </div>
                        </td>
                        <td className="admin-banners-table__cell">
                          <div className="admin-banners-table__actions">
                            <Button
                              variant="outline-neutral"
                              size="sm"
                              leftIcon={Pencil}
                              onClick={() => handleOpenEdit(banner)}
                            >
                              Editar
                            </Button>
                            <Button
                              variant="outline-danger"
                              size="sm"
                              leftIcon={Trash2}
                              onClick={() => setBannerToDelete(banner)}
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

            <footer className="admin-banners__footer">
              <p className="admin-banners__summary">{summary}</p>
              <Pagination
                currentPage={safePage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </footer>
          </>
        )}
      </section>

      <p className="admin-banners__hint">
        Use o interruptor para ativar ou desativar um banner na Home.
      </p>

      {/* Modal: novo banner / editar banner */}
      {isFormOpen && form && (
        <div className="admin-banners-modal" role="presentation" onClick={handleCloseForm}>
          <form
            className="admin-banners-modal__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-banners-form-title"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => void handleSubmitForm(event)}
            noValidate
          >
            <h3 id="admin-banners-form-title" className="admin-banners-modal__title">
              {editingBanner ? 'Editar banner' : 'Novo banner'}
            </h3>

            <div className="admin-banners-modal__grid">
              <div className="admin-banners-modal__field admin-banners-modal__field--full">
                <label className="admin-banners-modal__label" htmlFor="admin-banners-title">
                  Título
                </label>
                <input
                  id="admin-banners-title"
                  type="text"
                  className={
                    formErrors.title
                      ? 'admin-banners-modal__input admin-banners-modal__input--invalid'
                      : 'admin-banners-modal__input'
                  }
                  value={form.title}
                  onChange={(event) => updateField('title', event.target.value)}
                  disabled={isSaving}
                  autoFocus
                />
                {formErrors.title && (
                  <span className="admin-banners-modal__error" role="alert">
                    {formErrors.title}
                  </span>
                )}
              </div>

              <div className="admin-banners-modal__field admin-banners-modal__field--full">
                <label className="admin-banners-modal__label" htmlFor="admin-banners-subtitle">
                  Subtítulo <span className="admin-banners-modal__optional">(opcional)</span>
                </label>
                <input
                  id="admin-banners-subtitle"
                  type="text"
                  className="admin-banners-modal__input"
                  value={form.subtitle}
                  onChange={(event) => updateField('subtitle', event.target.value)}
                  disabled={isSaving}
                />
              </div>

              <div className="admin-banners-modal__field admin-banners-modal__field--full">
                <span className="admin-banners-modal__label">Imagem</span>
                <div
                  className={
                    formErrors.imageUrl
                      ? 'admin-banners-modal__preview admin-banners-modal__preview--invalid'
                      : 'admin-banners-modal__preview'
                  }
                >
                  {form.imageUrl ? (
                    <img
                      className="admin-banners-modal__preview-image"
                      src={form.imageUrl}
                      alt="Pré-visualização do banner"
                    />
                  ) : (
                    <span className="admin-banners-modal__placeholder">
                      <ImagePlus
                        className="admin-banners-modal__placeholder-icon"
                        aria-hidden="true"
                      />
                      Nenhuma imagem selecionada
                    </span>
                  )}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  aria-label="Escolher imagem do banner"
                  hidden
                  onChange={handleImageChange}
                />

                <div className="admin-banners-modal__image-actions">
                  <Button
                    type="button"
                    variant="outline-neutral"
                    onClick={handleChooseImage}
                    disabled={isSaving}
                  >
                    Escolher imagem
                  </Button>
                  {formErrors.imageUrl ? (
                    <span className="admin-banners-modal__error" role="alert">
                      {formErrors.imageUrl}
                    </span>
                  ) : (
                    <span className="admin-banners-modal__hint">PNG ou JPG (até 1 MB)</span>
                  )}
                </div>
              </div>

              <div className="admin-banners-modal__field">
                <label className="admin-banners-modal__label" htmlFor="admin-banners-link">
                  Link do botão
                </label>
                <input
                  id="admin-banners-link"
                  type="text"
                  className={
                    formErrors.linkUrl
                      ? 'admin-banners-modal__input admin-banners-modal__input--invalid'
                      : 'admin-banners-modal__input'
                  }
                  placeholder="/catalogo?categoria=mouses"
                  value={form.linkUrl}
                  onChange={(event) => updateField('linkUrl', event.target.value)}
                  disabled={isSaving}
                />
                {formErrors.linkUrl && (
                  <span className="admin-banners-modal__error" role="alert">
                    {formErrors.linkUrl}
                  </span>
                )}
              </div>

              <div className="admin-banners-modal__field">
                <label className="admin-banners-modal__label" htmlFor="admin-banners-button">
                  Texto do botão
                </label>
                <input
                  id="admin-banners-button"
                  type="text"
                  className={
                    formErrors.buttonLabel
                      ? 'admin-banners-modal__input admin-banners-modal__input--invalid'
                      : 'admin-banners-modal__input'
                  }
                  value={form.buttonLabel}
                  onChange={(event) => updateField('buttonLabel', event.target.value)}
                  disabled={isSaving}
                />
                {formErrors.buttonLabel && (
                  <span className="admin-banners-modal__error" role="alert">
                    {formErrors.buttonLabel}
                  </span>
                )}
              </div>

              <div className="admin-banners-modal__field">
                <label className="admin-banners-modal__label" htmlFor="admin-banners-position">
                  Posição
                </label>
                <select
                  id="admin-banners-position"
                  className="admin-banners-modal__select"
                  value={form.position}
                  onChange={(event) => {
                    const selected = POSITIONS.find((position) => position === event.target.value);

                    if (selected) {
                      updateField('position', selected);
                    }
                  }}
                  disabled={isSaving}
                >
                  {POSITIONS.map((position) => (
                    <option key={position} value={position}>
                      {POSITION_LABELS[position]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="admin-banners-modal__field">
                <label className="admin-banners-modal__label" htmlFor="admin-banners-order">
                  Ordem de exibição
                </label>
                <input
                  id="admin-banners-order"
                  type="text"
                  inputMode="numeric"
                  className={
                    formErrors.displayOrder
                      ? 'admin-banners-modal__input admin-banners-modal__input--invalid'
                      : 'admin-banners-modal__input'
                  }
                  value={form.displayOrder}
                  onChange={(event) => updateField('displayOrder', event.target.value)}
                  disabled={isSaving}
                />
                {formErrors.displayOrder && (
                  <span className="admin-banners-modal__error" role="alert">
                    {formErrors.displayOrder}
                  </span>
                )}
              </div>

              <div className="admin-banners-modal__field">
                <label className="admin-banners-modal__label" htmlFor="admin-banners-starts">
                  Início da promoção <span className="admin-banners-modal__optional">(opcional)</span>
                </label>
                <input
                  id="admin-banners-starts"
                  type="date"
                  className={
                    formErrors.startsAt
                      ? 'admin-banners-modal__input admin-banners-modal__input--invalid'
                      : 'admin-banners-modal__input'
                  }
                  value={form.startsAt}
                  onChange={(event) => updateField('startsAt', event.target.value)}
                  disabled={isSaving}
                />
                {formErrors.startsAt && (
                  <span className="admin-banners-modal__error" role="alert">
                    {formErrors.startsAt}
                  </span>
                )}
              </div>

              <div className="admin-banners-modal__field">
                <label className="admin-banners-modal__label" htmlFor="admin-banners-ends">
                  Fim da promoção <span className="admin-banners-modal__optional">(opcional)</span>
                </label>
                <input
                  id="admin-banners-ends"
                  type="date"
                  className={
                    formErrors.endsAt
                      ? 'admin-banners-modal__input admin-banners-modal__input--invalid'
                      : 'admin-banners-modal__input'
                  }
                  min={form.startsAt || undefined}
                  value={form.endsAt}
                  onChange={(event) => updateField('endsAt', event.target.value)}
                  disabled={isSaving}
                />
                {formErrors.endsAt && (
                  <span className="admin-banners-modal__error" role="alert">
                    {formErrors.endsAt}
                  </span>
                )}
              </div>
            </div>

            <label className="admin-banners-modal__check" htmlFor="admin-banners-active">
              <input
                id="admin-banners-active"
                type="checkbox"
                className="admin-banners-modal__checkbox"
                checked={form.isActive}
                onChange={(event) => updateField('isActive', event.target.checked)}
                disabled={isSaving}
              />
              Banner ativo (visível na Home)
            </label>

            {submitError && (
              <p className="admin-banners__feedback admin-banners__feedback--error" role="alert">
                {submitError}
              </p>
            )}

            <div className="admin-banners-modal__actions">
              <Button type="button" variant="outline-neutral" onClick={handleCloseForm} disabled={isSaving}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" disabled={isSaving}>
                {isSaving ? 'Salvando...' : editingBanner ? 'Salvar alterações' : 'Criar banner'}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: confirmação de exclusão */}
      {bannerToDelete && (
        <div className="admin-banners-modal" role="presentation" onClick={handleCloseDelete}>
          <div
            className="admin-banners-modal__dialog admin-banners-modal__dialog--narrow"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="admin-banners-delete-title"
            aria-describedby="admin-banners-delete-text"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="admin-banners-delete-title" className="admin-banners-modal__title">
              Excluir banner
            </h3>
            <p id="admin-banners-delete-text" className="admin-banners-modal__text">
              Tem certeza que deseja excluir o banner <strong>{bannerToDelete.title}</strong>? Esta
              ação não pode ser desfeita.
            </p>

            {deleteError && (
              <p className="admin-banners__feedback admin-banners__feedback--error" role="alert">
                {deleteError}
              </p>
            )}

            <div className="admin-banners-modal__actions">
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

export default AdminBanners;
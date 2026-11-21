import { ChevronDown, ImageOff, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Button } from '../../../components/Ui/Button/Button';
import { Pagination } from '../../../components/Ui/Pagination/Pagination';
import { SectionCard } from '../../../components/Ui/SectionCard/SectionCard';
import { StatusBadge } from '../../../components/Ui/StatusBadge/StatusBadge';
import {
  createCategory,
  deleteCategory,
  getCategories,
  getProducts,
  updateCategory,
} from '../../../services/productService';
import type { CategoryInput } from '../../../services/productService';
import type { Category, Product } from '../../../types';
import { classNames, normalizeText, slugify } from '../../../utils/helpers';
import './adminCategorias.css';

/** Quantidade de categorias exibidas por página. */
const ITEMS_PER_PAGE = 6;

type StatusFilter = 'all' | 'active' | 'inactive';

type ModalState = { mode: 'create' } | { mode: 'edit'; category: Category } | null;

interface CategoryFormValues {
  name: string;
  slug: string;
  description: string;
  imageUrl: string;
  isActive: boolean;
}

const EMPTY_FORM: CategoryFormValues = {
  name: '',
  slug: '',
  description: '',
  imageUrl: '',
  isActive: true,
};

/** Formata o id como no layout: #001, #002... */
function formatCategoryId(id: number): string {
  return `#${String(id).padStart(3, '0')}`;
}

/** Retorna a mensagem de um erro lançado pelo serviço (ou um texto padrão). */
function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Conta quantos produtos (ativos ou não) estão vinculados a cada categoria. */
function buildProductCounts(products: Product[]): Record<number, number> {
  return products.reduce<Record<number, number>>((counts, product) => {
    counts[product.categoryId] = (counts[product.categoryId] ?? 0) + 1;
    return counts;
  }, {});
}

function formatProductCount(count: number): string {
  return count === 1 ? 'produto' : 'produtos';
}

function buildFormValues(category: Category | null): CategoryFormValues {
  if (!category) {
    return EMPTY_FORM;
  }

  return {
    name: category.name,
    slug: category.slug,
    description: category.description,
    imageUrl: category.imageUrl,
    isActive: category.isActive,
  };
}

export function AdminCategorias() {
  const fieldId = useId();

  /* ------------------------------------------------------------------------
     Dados
     ------------------------------------------------------------------------ */
  const [categories, setCategories] = useState<Category[]>([]);
  const [productCounts, setProductCounts] = useState<Record<number, number>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  /* ------------------------------------------------------------------------
     Filtros (rascunho digitado x filtro aplicado ao clicar em "Filtrar")
     ------------------------------------------------------------------------ */
  const [searchDraft, setSearchDraft] = useState<string>('');
  const [statusDraft, setStatusDraft] = useState<StatusFilter>('all');
  const [appliedSearch, setAppliedSearch] = useState<string>('');
  const [appliedStatus, setAppliedStatus] = useState<StatusFilter>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);

  /* ------------------------------------------------------------------------
     Modal de criação / edição
     ------------------------------------------------------------------------ */
  const [modal, setModal] = useState<ModalState>(null);
  const [formValues, setFormValues] = useState<CategoryFormValues>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  /* ------------------------------------------------------------------------
     Modal de exclusão
     ------------------------------------------------------------------------ */
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const loadData = useCallback(async (): Promise<void> => {
    try {
      const [loadedCategories, loadedProducts] = await Promise.all([
        getCategories(true),
        getProducts({ includeInactive: true }),
      ]);

      setCategories(loadedCategories);
      setProductCounts(buildProductCounts(loadedProducts));
      setLoadError(null);
    } catch (error) {
      setLoadError(getErrorMessage(error, 'Não foi possível carregar as categorias.'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  /* ------------------------------------------------------------------------
     Listagem filtrada e paginada
     ------------------------------------------------------------------------ */
  const filteredCategories = useMemo<Category[]>(() => {
    const normalizedSearch = appliedSearch ? normalizeText(appliedSearch) : '';

    return categories.filter((category) => {
      if (appliedStatus === 'active' && !category.isActive) {
        return false;
      }

      if (appliedStatus === 'inactive' && category.isActive) {
        return false;
      }

      if (normalizedSearch) {
        return normalizeText(`${category.name} ${category.slug}`).includes(normalizedSearch);
      }

      return true;
    });
  }, [categories, appliedSearch, appliedStatus]);

  const totalPages = Math.max(1, Math.ceil(filteredCategories.length / ITEMS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const pageCategories = useMemo<Category[]>(() => {
    const start = (safeCurrentPage - 1) * ITEMS_PER_PAGE;
    return filteredCategories.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredCategories, safeCurrentPage]);

  const summaryText =
    filteredCategories.length > pageCategories.length
      ? `Exibindo ${pageCategories.length} de ${filteredCategories.length} categorias`
      : `Exibindo ${pageCategories.length} ${pageCategories.length === 1 ? 'categoria' : 'categorias'}`;

  /* ------------------------------------------------------------------------
     Filtros
     ------------------------------------------------------------------------ */
  const handleFilterSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setAppliedSearch(searchDraft.trim());
    setAppliedStatus(statusDraft);
    setCurrentPage(1);
  };

  const handleStatusChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    setStatusDraft(event.target.value as StatusFilter);
  };

  /* ------------------------------------------------------------------------
     Modal de criação / edição
     ------------------------------------------------------------------------ */
  const openCreateModal = (): void => {
    setFormValues(EMPTY_FORM);
    setFormError(null);
    setModal({ mode: 'create' });
  };

  const openEditModal = (category: Category): void => {
    setFormValues(buildFormValues(category));
    setFormError(null);
    setModal({ mode: 'edit', category });
  };

  const closeFormModal = useCallback((): void => {
    if (isSaving) {
      return;
    }

    setModal(null);
    setFormError(null);
  }, [isSaving]);

  const handleTextChange =
    (field: 'name' | 'slug' | 'description' | 'imageUrl') =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
      setFormValues((current) => ({ ...current, [field]: event.target.value }));
    };

  const handleActiveChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setFormValues((current) => ({ ...current, isActive: event.target.checked }));
  };

  const handleFormSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (!modal) {
      return;
    }

    const name = formValues.name.trim();

    if (!name) {
      setFormError('Informe o nome da categoria.');
      return;
    }

    setIsSaving(true);
    setFormError(null);

    try {
      if (modal.mode === 'create') {
        const input: CategoryInput = {
          name,
          slug: formValues.slug.trim() || undefined,
          description: formValues.description.trim(),
          imageUrl: formValues.imageUrl.trim(),
          isActive: formValues.isActive,
        };

        await createCategory(input);
        setFeedback('Categoria criada com sucesso.');
      } else {
        await updateCategory(modal.category.id, {
          name,
          slug: formValues.slug.trim() || slugify(name),
          description: formValues.description.trim(),
          imageUrl: formValues.imageUrl.trim(),
          isActive: formValues.isActive,
        });
        setFeedback('Categoria atualizada com sucesso.');
      }

      await loadData();
      setModal(null);
    } catch (error) {
      setFormError(getErrorMessage(error, 'Não foi possível salvar a categoria.'));
    } finally {
      setIsSaving(false);
    }
  };

  /* ------------------------------------------------------------------------
     Modal de exclusão
     ------------------------------------------------------------------------ */
  const openDeleteModal = (category: Category): void => {
    setDeleteError(null);
    setCategoryToDelete(category);
  };

  const closeDeleteModal = useCallback((): void => {
    if (isDeleting) {
      return;
    }

    setCategoryToDelete(null);
    setDeleteError(null);
  }, [isDeleting]);

  const handleConfirmDelete = async (): Promise<void> => {
    if (!categoryToDelete) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      await deleteCategory(categoryToDelete.id);
      await loadData();
      setFeedback('Categoria excluída com sucesso.');
      setCategoryToDelete(null);
    } catch (error) {
      setDeleteError(getErrorMessage(error, 'Não foi possível excluir a categoria.'));
    } finally {
      setIsDeleting(false);
    }
  };

  /* ------------------------------------------------------------------------
     Fecha o modal aberto com a tecla Esc
     ------------------------------------------------------------------------ */
  const isAnyModalOpen = modal !== null || categoryToDelete !== null;

  useEffect(() => {
    if (!isAnyModalOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') {
        return;
      }

      if (categoryToDelete) {
        closeDeleteModal();
      } else {
        closeFormModal();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isAnyModalOpen, categoryToDelete, closeDeleteModal, closeFormModal]);

  /* ------------------------------------------------------------------------
     Renderização
     ------------------------------------------------------------------------ */
  const deleteProductCount = categoryToDelete ? (productCounts[categoryToDelete.id] ?? 0) : 0;
  const isEditing = modal?.mode === 'edit';
  const formTitleId = `${fieldId}-form-title`;
  const deleteTitleId = `${fieldId}-delete-title`;

  return (
    <div className="admin-categorias">
      <div className="admin-categorias__header">
        <h2 className="admin-categorias__title">Categorias</h2>
        <Button leftIcon={Plus} onClick={openCreateModal}>
          Nova categoria
        </Button>
      </div>

      {feedback ? (
        <p className="admin-categorias__feedback" role="status">
          {feedback}
        </p>
      ) : null}

      <SectionCard className="admin-categorias__card">
        <form className="admin-categorias__toolbar" onSubmit={handleFilterSubmit} role="search">
          <div className="admin-categorias__search">
            <Search className="admin-categorias__search-icon" aria-hidden="true" />
            <input
              className="admin-categorias__search-input"
              type="search"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Pesquisar categoria..."
              aria-label="Pesquisar categoria"
            />
          </div>

          <div className="admin-categorias__select">
            <select
              className="admin-categorias__select-input"
              value={statusDraft}
              onChange={handleStatusChange}
              aria-label="Filtrar por status"
            >
              <option value="all">Status: Todos</option>
              <option value="active">Status: Ativa</option>
              <option value="inactive">Status: Inativa</option>
            </select>
            <ChevronDown className="admin-categorias__select-icon" aria-hidden="true" />
          </div>

          <Button className="admin-categorias__filter-button" type="submit">
            Filtrar
          </Button>
        </form>

        <div className="admin-categorias__table-wrapper">
          <table className="admin-categorias__table">
            <thead className="admin-categorias__thead">
              <tr>
                <th className="admin-categorias__th admin-categorias__th--id" scope="col">
                  ID
                </th>
                <th className="admin-categorias__th admin-categorias__th--category" scope="col">
                  Categoria
                </th>
                <th className="admin-categorias__th admin-categorias__th--count" scope="col">
                  Quantidade de produtos
                </th>
                <th className="admin-categorias__th admin-categorias__th--status" scope="col">
                  Status
                </th>
                <th className="admin-categorias__th admin-categorias__th--actions" scope="col">
                  Ações
                </th>
              </tr>
            </thead>

            <tbody>
              {isLoading ? (
                <tr>
                  <td className="admin-categorias__message" colSpan={5}>
                    Carregando categorias...
                  </td>
                </tr>
              ) : null}

              {!isLoading && loadError ? (
                <tr>
                  <td
                    className={classNames(
                      'admin-categorias__message',
                      'admin-categorias__message--error',
                    )}
                    colSpan={5}
                  >
                    {loadError}
                  </td>
                </tr>
              ) : null}

              {!isLoading && !loadError && pageCategories.length === 0 ? (
                <tr>
                  <td className="admin-categorias__message" colSpan={5}>
                    Nenhuma categoria encontrada.
                  </td>
                </tr>
              ) : null}

              {!isLoading && !loadError
                ? pageCategories.map((category) => {
                    const count = productCounts[category.id] ?? 0;

                    return (
                      <tr key={category.id} className="admin-categorias__row">
                        <td className="admin-categorias__cell admin-categorias__cell--id">
                          {formatCategoryId(category.id)}
                        </td>

                        <td className="admin-categorias__cell">
                          <div className="admin-categorias__category">
                            <span className="admin-categorias__thumb">
                              {category.imageUrl ? (
                                <img
                                  className="admin-categorias__thumb-image"
                                  src={category.imageUrl}
                                  alt={category.name}
                                  loading="lazy"
                                />
                              ) : (
                                <ImageOff
                                  className="admin-categorias__thumb-placeholder"
                                  aria-hidden="true"
                                />
                              )}
                            </span>
                            <span className="admin-categorias__name">{category.name}</span>
                          </div>
                        </td>

                        <td className="admin-categorias__cell">
                          <span className="admin-categorias__count">{count}</span>{' '}
                          <span className="admin-categorias__count-label">
                            {formatProductCount(count)}
                          </span>
                        </td>

                        <td className="admin-categorias__cell">
                          <StatusBadge tone={category.isActive ? 'success' : 'neutral'}>
                            {category.isActive ? 'Ativa' : 'Inativa'}
                          </StatusBadge>
                        </td>

                        <td className="admin-categorias__cell">
                          <div className="admin-categorias__actions">
                            <Button
                              variant="outline-success"
                              size="sm"
                              leftIcon={Pencil}
                              onClick={() => openEditModal(category)}
                              aria-label={`Editar categoria ${category.name}`}
                            >
                              Editar
                            </Button>
                            <Button
                              variant="outline-danger"
                              size="sm"
                              leftIcon={Trash2}
                              onClick={() => openDeleteModal(category)}
                              aria-label={`Excluir categoria ${category.name}`}
                            >
                              Excluir
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                : null}
            </tbody>
          </table>
        </div>

        <div className="admin-categorias__footer">
          <p className="admin-categorias__summary">{summaryText}</p>
          <Pagination
            currentPage={safeCurrentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </div>
      </SectionCard>

      {/* ------------------------------------------------------------------
          Modal: Nova categoria / Editar categoria
          ------------------------------------------------------------------ */}
      {modal ? (
        <div className="category-modal" onMouseDown={closeFormModal}>
          <div
            className="category-modal__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={formTitleId}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="category-modal__header">
              <h2 className="category-modal__title" id={formTitleId}>
                {isEditing ? 'Editar categoria' : 'Nova categoria'}
              </h2>
              <button
                className="category-modal__close"
                type="button"
                onClick={closeFormModal}
                aria-label="Fechar"
                disabled={isSaving}
              >
                <X className="category-modal__close-icon" aria-hidden="true" />
              </button>
            </header>

            <form className="category-modal__form" onSubmit={handleFormSubmit} noValidate>
              <div className="category-modal__field">
                <label className="category-modal__label" htmlFor={`${fieldId}-name`}>
                  Nome
                </label>
                <input
                  className="category-modal__input"
                  id={`${fieldId}-name`}
                  type="text"
                  value={formValues.name}
                  onChange={handleTextChange('name')}
                  placeholder="Ex.: Mouses"
                  autoFocus
                />
              </div>

              <div className="category-modal__field">
                <label className="category-modal__label" htmlFor={`${fieldId}-slug`}>
                  Slug
                </label>
                <input
                  className="category-modal__input"
                  id={`${fieldId}-slug`}
                  type="text"
                  value={formValues.slug}
                  onChange={handleTextChange('slug')}
                  placeholder="Gerado automaticamente a partir do nome"
                />
              </div>

              <div className="category-modal__field">
                <label className="category-modal__label" htmlFor={`${fieldId}-description`}>
                  Descrição
                </label>
                <textarea
                  className="category-modal__input category-modal__input--textarea"
                  id={`${fieldId}-description`}
                  value={formValues.description}
                  onChange={handleTextChange('description')}
                  rows={3}
                  placeholder="Descreva brevemente a categoria"
                />
              </div>

              <div className="category-modal__field">
                <label className="category-modal__label" htmlFor={`${fieldId}-image`}>
                  URL da imagem
                </label>
                <div className="category-modal__image-row">
                  <span className="category-modal__preview">
                    {formValues.imageUrl.trim() ? (
                      <img
                        className="category-modal__preview-image"
                        src={formValues.imageUrl.trim()}
                        alt="Pré-visualização da imagem da categoria"
                      />
                    ) : (
                      <ImageOff className="category-modal__preview-placeholder" aria-hidden="true" />
                    )}
                  </span>
                  <input
                    className="category-modal__input"
                    id={`${fieldId}-image`}
                    type="url"
                    value={formValues.imageUrl}
                    onChange={handleTextChange('imageUrl')}
                    placeholder="https://..."
                  />
                </div>
              </div>

              <label className="category-modal__checkbox">
                <input
                  className="category-modal__checkbox-input"
                  type="checkbox"
                  checked={formValues.isActive}
                  onChange={handleActiveChange}
                />
                <span className="category-modal__checkbox-label">Categoria ativa</span>
              </label>

              {formError ? (
                <p className="category-modal__error" role="alert">
                  {formError}
                </p>
              ) : null}

              <footer className="category-modal__footer">
                <Button
                  variant="outline-neutral"
                  onClick={closeFormModal}
                  disabled={isSaving}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Criar categoria'}
                </Button>
              </footer>
            </form>
          </div>
        </div>
      ) : null}

      {/* ------------------------------------------------------------------
          Modal: confirmação de exclusão
          ------------------------------------------------------------------ */}
      {categoryToDelete ? (
        <div className="category-modal" onMouseDown={closeDeleteModal}>
          <div
            className={classNames('category-modal__dialog', 'category-modal__dialog--sm')}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={deleteTitleId}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="category-modal__header">
              <h2 className="category-modal__title" id={deleteTitleId}>
                Excluir categoria
              </h2>
              <button
                className="category-modal__close"
                type="button"
                onClick={closeDeleteModal}
                aria-label="Fechar"
                disabled={isDeleting}
              >
                <X className="category-modal__close-icon" aria-hidden="true" />
              </button>
            </header>

            <div className="category-modal__body">
              <p className="category-modal__text">
                Tem certeza de que deseja excluir a categoria{' '}
                <strong className="category-modal__text-strong">{categoryToDelete.name}</strong>?
                Esta ação não pode ser desfeita.
              </p>

              {deleteProductCount > 0 ? (
                <p className="category-modal__error" role="alert">
                  Esta categoria possui {deleteProductCount} {formatProductCount(deleteProductCount)}.
                  Mova ou exclua os produtos antes de removê-la.
                </p>
              ) : null}

              {deleteError ? (
                <p className="category-modal__error" role="alert">
                  {deleteError}
                </p>
              ) : null}
            </div>

            <footer className="category-modal__footer">
              <Button variant="outline-neutral" onClick={closeDeleteModal} disabled={isDeleting}>
                Cancelar
              </Button>
              <Button
                variant="outline-danger"
                leftIcon={Trash2}
                onClick={handleConfirmDelete}
                disabled={isDeleting || deleteProductCount > 0}
              >
                {isDeleting ? 'Excluindo...' : 'Excluir'}
              </Button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
/**
 * VELOX — Admin / Formulário de produto.
 *
 * Rotas: "/admin/produtos/novo" (criação) e "/admin/produtos/:id/editar" (edição).
 * Renderizada dentro do AdminLayout (via <Outlet />), por isso não usa layout próprio.
 *
 * Mapeamento dos campos para o modelo `Product`:
 * - "Preço (R$)" e "Preço promocional (R$)": quando há promoção, `price` recebe o
 *   valor promocional e `oldPrice` recebe o preço cheio; sem promoção, `oldPrice` = null.
 * - "DPI": gravado em `specs.attributes` (label "DPI").
 * - "Avaliação": somente leitura. `rating` é calculado pelas avaliações dos clientes
 *   (o productService não permite editá-lo).
 * - Imagem: lida como data URL (sem back-end); limite de 1 MB por causa do localStorage.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ImagePlus } from 'lucide-react';
import { Button } from '../../../components/Ui/Button/Button';
import { SectionCard } from '../../../components/Ui/SectionCard/SectionCard';
import {
  createProduct,
  getCategories,
  getProductById,
  getProducts,
  updateProduct,
  type ProductInput,
  type ProductUpdateInput,
} from '../../../services/productService';
import type { Category, Product, ProductSpecAttribute } from '../../../types';
import './produtoForm.css';

const PRODUCTS_ROUTE = '/admin/produtos';

/** Tipos de imagem aceitos e tamanho máximo (bytes). */
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg'];
const MAX_IMAGE_SIZE_BYTES = 1024 * 1024;

/** Rótulo do atributo técnico que guarda o DPI em `specs.attributes`. */
const DPI_LABEL = 'DPI';

/** Valores padrão usados ao criar um produto (campos que não existem no formulário). */
const DEFAULT_WARRANTY_MONTHS = 12;
const SHORT_DESCRIPTION_LENGTH = 140;

const CONNECTION_OPTIONS: string[] = [
  'USB com fio',
  'Sem fio 2.4 GHz',
  'Bluetooth',
  'Sem fio / Bluetooth',
  'P2 (3,5 mm)',
  'HDMI / DisplayPort',
];

interface FormState {
  name: string;
  categoryId: string;
  brand: string;
  price: string;
  promoPrice: string;
  stock: string;
  description: string;
  dpi: string;
  connectionType: string;
  isActive: boolean;
  imageUrl: string;
}

type FormErrors = Partial<Record<keyof FormState, string>>;

const EMPTY_FORM: FormState = {
  name: '',
  categoryId: '',
  brand: '',
  price: '',
  promoPrice: '',
  stock: '',
  description: '',
  dpi: '',
  connectionType: '',
  isActive: true,
  imageUrl: '',
};

/* ==========================================================================
   Helpers
   ========================================================================== */

/** Converte "149,90" / "1.149,90" / "149.90" em número, ou null se inválido/vazio. */
function parseDecimal(value: string): number | null {
  const cleaned = value.replace(/[R$\s]/g, '');

  if (!cleaned) {
    return null;
  }

  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned;
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

const formatDecimal = (value: number): string => value.toFixed(2).replace('.', ',');

const findDpiAttribute = (attributes: ProductSpecAttribute[]): ProductSpecAttribute | undefined =>
  attributes.find((attribute) => attribute.label.trim().toLowerCase() === DPI_LABEL.toLowerCase());

/** Atualiza (ou remove, se vazio) o atributo DPI sem mexer nos demais atributos. */
function buildAttributes(
  attributes: ProductSpecAttribute[],
  dpi: string,
): ProductSpecAttribute[] {
  const others = attributes.filter(
    (attribute) => attribute.label.trim().toLowerCase() !== DPI_LABEL.toLowerCase(),
  );
  const dpiValue = dpi.trim();

  if (!dpiValue) {
    return others;
  }

  const existing = findDpiAttribute(attributes);

  // Mantém a posição original do DPI na lista, se ele já existia.
  if (existing) {
    return attributes.map((attribute) =>
      attribute === existing ? { ...attribute, value: dpiValue } : attribute,
    );
  }

  return [{ label: DPI_LABEL, value: dpiValue }, ...others];
}

/** Converte um produto existente nos valores do formulário. */
function productToForm(product: Product): FormState {
  const dpiAttribute = findDpiAttribute(product.specs.attributes);
  // oldPrice é `number | null`: com promoção, o preço cheio é o oldPrice.
  const hasPromo = product.oldPrice !== null;

  return {
    name: product.name,
    categoryId: String(product.categoryId),
    brand: product.specs.brand,
    price: formatDecimal(product.oldPrice !== null ? product.oldPrice : product.price),
    promoPrice: hasPromo ? formatDecimal(product.price) : '',
    stock: String(product.stock),
    description: product.description,
    dpi: dpiAttribute ? dpiAttribute.value : '',
    connectionType: product.specs.connectionType,
    isActive: product.isActive,
    imageUrl: product.imageUrl,
  };
}

/** Valida o formulário e devolve as mensagens por campo (objeto vazio = válido). */
function validateForm(form: FormState): FormErrors {
  const errors: FormErrors = {};

  if (!form.name.trim()) {
    errors.name = 'Informe o nome do produto.';
  }

  if (!form.categoryId) {
    errors.categoryId = 'Selecione uma categoria.';
  }

  if (!form.brand.trim()) {
    errors.brand = 'Selecione uma marca.';
  }

  const price = parseDecimal(form.price);

  if (price === null || price <= 0) {
    errors.price = 'Informe um preço maior que zero.';
  }

  if (form.promoPrice.trim()) {
    const promoPrice = parseDecimal(form.promoPrice);

    if (promoPrice === null || promoPrice <= 0) {
      errors.promoPrice = 'Informe um valor válido.';
    } else if (price !== null && promoPrice >= price) {
      errors.promoPrice = 'Deve ser menor que o preço.';
    }
  }

  if (!/^\d+$/.test(form.stock.trim())) {
    errors.stock = 'Informe um número inteiro (0 ou mais).';
  }

  if (!form.description.trim()) {
    errors.description = 'Escreva a descrição do produto.';
  }

  if (!form.imageUrl) {
    errors.imageUrl = 'Escolha uma imagem para o produto.';
  }

  return errors;
}

/* ==========================================================================
   Campo com rótulo, dica e erro
   ========================================================================== */

interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

function Field({ id, label, hint, error, children }: FieldProps) {
  return (
    <div className="produto-form__field">
      <label className="produto-form__label" htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? (
        <span id={`${id}-error`} className="produto-form__error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="produto-form__hint">{hint}</span>
      ) : null}
    </div>
  );
}

/* ==========================================================================
   Tela
   ========================================================================== */

export function ProdutoForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const isEditing = id !== undefined;
  const productId = isEditing ? Number(id) : null;

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [originalProduct, setOriginalProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [knownBrands, setKnownBrands] = useState<string[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isNotFound, setIsNotFound] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  /* ------------------------------------------------------------------------
     Carga de dados
     ------------------------------------------------------------------------ */
  useEffect(() => {
    let isCancelled = false;

    async function loadData(): Promise<void> {
      setIsLoading(true);
      setIsNotFound(false);
      setLoadError(null);
      setSubmitError(null);
      setErrors({});
      setForm(EMPTY_FORM);
      setOriginalProduct(null);

      try {
        const [loadedCategories, allProducts] = await Promise.all([
          getCategories(true),
          getProducts({ includeInactive: true }),
        ]);

        let loadedProduct: Product | null = null;

        if (productId !== null) {
          loadedProduct = Number.isInteger(productId)
            ? await getProductById(productId, true)
            : null;
        }

        if (isCancelled) {
          return;
        }

        setCategories(loadedCategories);
        setKnownBrands(
          Array.from(new Set(allProducts.map((product) => product.specs.brand).filter(Boolean))),
        );

        if (productId !== null) {
          if (!loadedProduct) {
            setIsNotFound(true);
            return;
          }

          setOriginalProduct(loadedProduct);
          setForm(productToForm(loadedProduct));
        }
      } catch (error) {
        if (!isCancelled) {
          setLoadError(
            error instanceof Error ? error.message : 'Não foi possível carregar o formulário.',
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
  }, [productId]);

  /* ------------------------------------------------------------------------
     Derivações
     ------------------------------------------------------------------------ */
  // Garante que a marca atual do produto apareça na lista, mesmo se for única.
  const brandOptions = useMemo<string[]>(() => {
    const brands = new Set(knownBrands);

    if (form.brand) {
      brands.add(form.brand);
    }

    return Array.from(brands).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [knownBrands, form.brand]);

  const connectionOptions = useMemo<string[]>(
    () =>
      form.connectionType && !CONNECTION_OPTIONS.includes(form.connectionType)
        ? [...CONNECTION_OPTIONS, form.connectionType]
        : CONNECTION_OPTIONS,
    [form.connectionType],
  );

  const ratingLabel =
    originalProduct && originalProduct.reviewCount > 0
      ? originalProduct.rating.toFixed(1).replace('.', ',')
      : '—';

  /* ------------------------------------------------------------------------
     Handlers
     ------------------------------------------------------------------------ */
  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]): void => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => (previous[key] ? { ...previous, [key]: undefined } : previous));
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
      setErrors((previous) => ({ ...previous, imageUrl: 'Use uma imagem PNG ou JPG.' }));
      return;
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setErrors((previous) => ({ ...previous, imageUrl: 'A imagem deve ter até 1 MB.' }));
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        updateField('imageUrl', reader.result);
      }
    };

    reader.onerror = () => {
      setErrors((previous) => ({ ...previous, imageUrl: 'Não foi possível ler a imagem.' }));
    };

    reader.readAsDataURL(file);
  };

  const handleCancel = (): void => {
    navigate(PRODUCTS_ROUTE);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (isSaving) {
      return;
    }

    const validationErrors = validateForm(form);

    setErrors(validationErrors);
    setSubmitError(null);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    // Validação garante que price existe; promoPrice é opcional (null = sem promoção).
    const fullPrice = parseDecimal(form.price) ?? 0;
    const promoPrice = form.promoPrice.trim() ? parseDecimal(form.promoPrice) : null;
    const finalPrice = promoPrice !== null ? promoPrice : fullPrice;
    const finalOldPrice: number | null = promoPrice !== null ? fullPrice : null;
    const stock = Number(form.stock.trim());
    const categoryId = Number(form.categoryId);

    setIsSaving(true);

    try {
      if (originalProduct) {
        // Edição: envia apenas os campos do formulário; o restante é preservado pelo service.
        const imageChanged = form.imageUrl !== originalProduct.imageUrl;
        const gallery = imageChanged
          ? [form.imageUrl, ...originalProduct.gallery.filter((url) => url !== originalProduct.imageUrl)]
          : originalProduct.gallery;

        const changes: ProductUpdateInput = {
          name: form.name.trim(),
          categoryId,
          description: form.description.trim(),
          price: finalPrice,
          oldPrice: finalOldPrice,
          stock,
          imageUrl: form.imageUrl,
          gallery,
          isActive: form.isActive,
          specs: {
            brand: form.brand.trim(),
            connectionType: form.connectionType,
            attributes: buildAttributes(originalProduct.specs.attributes, form.dpi),
          },
        };

        await updateProduct(originalProduct.id, changes);
      } else {
        // Criação: campos fora do formulário recebem valores padrão.
        const description = form.description.trim();

        const input: ProductInput = {
          categoryId,
          name: form.name.trim(),
          sku: `VLX-${Date.now().toString(36).toUpperCase()}`,
          shortDescription: description.slice(0, SHORT_DESCRIPTION_LENGTH),
          description,
          price: finalPrice,
          oldPrice: finalOldPrice,
          stock,
          imageUrl: form.imageUrl,
          gallery: [],
          isFeatured: false,
          isActive: form.isActive,
          specs: {
            brand: form.brand.trim(),
            model: form.name.trim(),
            color: '',
            weightKg: 0,
            dimensions: '',
            connectionType: form.connectionType,
            warrantyMonths: DEFAULT_WARRANTY_MONTHS,
            highlights: [],
            attributes: buildAttributes([], form.dpi),
          },
        };

        await createProduct(input);
      }

      navigate(PRODUCTS_ROUTE);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Não foi possível salvar o produto.');
      setIsSaving(false);
    }
  };

  /* ------------------------------------------------------------------------
     Estados de carregamento / erro
     ------------------------------------------------------------------------ */
  if (isLoading || isNotFound || loadError) {
    let message = 'Carregando...';

    if (loadError) {
      message = loadError;
    } else if (isNotFound) {
      message = 'Produto não encontrado.';
    }

    return (
      <div className="produto-form">
        <p
          className={
            loadError || isNotFound
              ? 'produto-form__feedback produto-form__feedback--error'
              : 'produto-form__feedback'
          }
          role={loadError || isNotFound ? 'alert' : 'status'}
        >
          {message}
        </p>
        {(loadError || isNotFound) && (
          <div className="produto-form__feedback-action">
            <Button type="button" variant="primary" onClick={handleCancel}>
              Voltar para produtos
            </Button>
          </div>
        )}
      </div>
    );
  }

  /* ------------------------------------------------------------------------
     Render
     ------------------------------------------------------------------------ */
  return (
    <form className="produto-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
      <header className="produto-form__header">
        <h2 className="produto-form__title">{isEditing ? 'Editar produto' : 'Novo produto'}</h2>
        <p className="produto-form__meta">
          {originalProduct ? `ID #${String(originalProduct.id).padStart(3, '0')} · ` : ''}
          Preencha os campos e salve
        </p>
      </header>

      {submitError && (
        <p className="produto-form__feedback produto-form__feedback--error" role="alert">
          {submitError}
        </p>
      )}

      <div className="produto-form__layout">
        {/* Coluna esquerda */}
        <div className="produto-form__column">
          <SectionCard title="Informações básicas">
            <div className="produto-form__fields">
              <Field id="produto-name" label="Nome do produto" error={errors.name}>
                <input
                  id="produto-name"
                  type="text"
                  className={
                    errors.name
                      ? 'produto-form__input produto-form__input--invalid'
                      : 'produto-form__input'
                  }
                  value={form.name}
                  onChange={(event) => updateField('name', event.target.value)}
                />
              </Field>

              <div className="produto-form__row">
                <Field id="produto-category" label="Categoria" error={errors.categoryId}>
                  <select
                    id="produto-category"
                    className={
                      errors.categoryId
                        ? 'produto-form__select produto-form__select--invalid'
                        : 'produto-form__select'
                    }
                    value={form.categoryId}
                    onChange={(event) => updateField('categoryId', event.target.value)}
                  >
                    <option value="">Selecione</option>
                    {categories.map((category) => (
                      <option key={category.id} value={String(category.id)}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field id="produto-brand" label="Marca" error={errors.brand}>
                  <select
                    id="produto-brand"
                    className={
                      errors.brand
                        ? 'produto-form__select produto-form__select--invalid'
                        : 'produto-form__select'
                    }
                    value={form.brand}
                    onChange={(event) => updateField('brand', event.target.value)}
                  >
                    <option value="">Selecione</option>
                    {brandOptions.map((brand) => (
                      <option key={brand} value={brand}>
                        {brand}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Preço e estoque">
            <div className="produto-form__row produto-form__row--three">
              <Field id="produto-price" label="Preço (R$)" error={errors.price}>
                <input
                  id="produto-price"
                  type="text"
                  inputMode="decimal"
                  className={
                    errors.price
                      ? 'produto-form__input produto-form__input--invalid'
                      : 'produto-form__input'
                  }
                  value={form.price}
                  onChange={(event) => updateField('price', event.target.value)}
                />
              </Field>

              <Field
                id="produto-promo-price"
                label="Preço promocional (R$)"
                hint="Opcional"
                error={errors.promoPrice}
              >
                <input
                  id="produto-promo-price"
                  type="text"
                  inputMode="decimal"
                  className={
                    errors.promoPrice
                      ? 'produto-form__input produto-form__input--invalid'
                      : 'produto-form__input'
                  }
                  value={form.promoPrice}
                  onChange={(event) => updateField('promoPrice', event.target.value)}
                />
              </Field>

              <Field id="produto-stock" label="Estoque (unidades)" error={errors.stock}>
                <input
                  id="produto-stock"
                  type="text"
                  inputMode="numeric"
                  className={
                    errors.stock
                      ? 'produto-form__input produto-form__input--invalid'
                      : 'produto-form__input'
                  }
                  value={form.stock}
                  onChange={(event) => updateField('stock', event.target.value)}
                />
              </Field>
            </div>
          </SectionCard>

          <SectionCard title="Descrição">
            <Field id="produto-description" label="Descrição do produto" error={errors.description}>
              <textarea
                id="produto-description"
                className={
                  errors.description
                    ? 'produto-form__textarea produto-form__textarea--invalid'
                    : 'produto-form__textarea'
                }
                value={form.description}
                onChange={(event) => updateField('description', event.target.value)}
              />
            </Field>
          </SectionCard>

          <SectionCard title="Especificações">
            <div className="produto-form__row produto-form__row--three">
              <Field id="produto-dpi" label="DPI" hint="Quando aplicável">
                <input
                  id="produto-dpi"
                  type="text"
                  inputMode="numeric"
                  className="produto-form__input"
                  value={form.dpi}
                  onChange={(event) => updateField('dpi', event.target.value)}
                />
              </Field>

              <Field id="produto-connection" label="Tipo de conexão">
                <select
                  id="produto-connection"
                  className="produto-form__select"
                  value={form.connectionType}
                  onChange={(event) => updateField('connectionType', event.target.value)}
                >
                  <option value="">Selecione</option>
                  {connectionOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                id="produto-rating"
                label="Avaliação (0 a 5)"
                hint="Calculada pelas avaliações dos clientes"
              >
                <input
                  id="produto-rating"
                  type="text"
                  className="produto-form__input"
                  value={ratingLabel}
                  readOnly
                  disabled
                />
              </Field>
            </div>
          </SectionCard>
        </div>

        {/* Coluna direita */}
        <aside className="produto-form__column">
          <SectionCard title="Imagem">
            <div className="produto-form__image">
              <div
                className={
                  errors.imageUrl
                    ? 'produto-form__dropzone produto-form__dropzone--invalid'
                    : 'produto-form__dropzone'
                }
              >
                {form.imageUrl ? (
                  <img
                    className="produto-form__preview"
                    src={form.imageUrl}
                    alt={form.name ? `Imagem de ${form.name}` : 'Pré-visualização da imagem'}
                  />
                ) : (
                  <span className="produto-form__placeholder">
                    <ImagePlus className="produto-form__placeholder-icon" aria-hidden="true" />
                    Nenhuma imagem selecionada
                  </span>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                className="produto-form__file-input"
                aria-label="Escolher imagem do produto"
                hidden
                onChange={handleImageChange}
              />

              <Button type="button" variant="outline-neutral" fullWidth onClick={handleChooseImage}>
                Escolher imagem
              </Button>

              {errors.imageUrl ? (
                <span className="produto-form__error produto-form__error--center" role="alert">
                  {errors.imageUrl}
                </span>
              ) : (
                <span className="produto-form__hint produto-form__hint--center">
                  PNG ou JPG (até 1 MB)
                </span>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Status">
            <label className="produto-form__status" htmlFor="produto-status">
              <span className="produto-form__status-text">
                <span className="produto-form__status-title">
                  {form.isActive ? 'Ativo' : 'Inativo'}
                </span>
                <span className="produto-form__status-hint">
                  {form.isActive ? 'Visível na loja' : 'Oculto na loja'}
                </span>
              </span>
              <input
                id="produto-status"
                type="checkbox"
                role="switch"
                className="produto-form__switch"
                checked={form.isActive}
                onChange={(event) => updateField('isActive', event.target.checked)}
              />
            </label>
          </SectionCard>

          <div className="produto-form__actions">
            <Button type="submit" variant="primary" fullWidth disabled={isSaving}>
              {isSaving ? 'Salvando...' : 'Salvar produto'}
            </Button>
            <Button
              type="button"
              variant="outline-danger"
              fullWidth
              onClick={handleCancel}
              disabled={isSaving}
            >
              Cancelar
            </Button>
          </div>
        </aside>
      </div>
    </form>
  );
}

export default ProdutoForm;
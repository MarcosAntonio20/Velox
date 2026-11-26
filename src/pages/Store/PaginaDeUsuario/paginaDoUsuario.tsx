/**
 * VELOX — Página do usuário / Minha Conta (rotas "/minha-conta" e "/minha-conta/pedidos").
 *
 * Menu lateral com 4 visões (Meus pedidos, Meus dados, Meus endereços, Segurança) + Sair.
 * A visão ativa fica na URL (?aba=dados | enderecos | seguranca; sem parâmetro = pedidos),
 * então dá para atualizar a página ou linkar direto para uma visão.
 *
 * Fontes de dados:
 * - AuthContext: usuário, endereços, updateProfile, changePassword, addAddress,
 *   updateAddress, removeAddress, setDefaultAddress e logout.
 * - orderService.getOrdersByUser: pedidos recentes.
 *
 * O CPF é exibido, mas não é editável: o updateProfile do service só altera
 * nome, e-mail, telefone e data de nascimento.
 */

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Plus, User as UserIcon } from 'lucide-react';
import { Button } from '../../../components/Ui/Button/Button';
import { SectionCard } from '../../../components/Ui/SectionCard/SectionCard';
import { StatusBadge, type BadgeTone } from '../../../components/Ui/StatusBadge/StatusBadge';
import { useAuth } from '../../../context/AuthContext';
import { StoreLayout } from '../../../layouts/StoreLayout/StoreLayout';
import { getOrdersByUser } from '../../../services/orderService';
import type { AddressInput } from '../../../services/authService';
import type { Order, OrderStatus, User, UserAddress } from '../../../types';
import { classNames } from '../../../utils/helpers';
import { formatCurrency } from '../../../utils/pricing';
import './paginaDoUsuario.css';

const HOME_ROUTE = '/';
const LOGIN_ROUTE = '/login';
const CATALOG_ROUTE = '/catalogo';
const ORDER_DETAILS_ROUTE = '/minha-conta/pedidos';

/** Lista completa de pedidos (página já existente). */
const ALL_ORDERS_ROUTE = '/meus-pedidos';

/** Quantidade de pedidos exibidos em "Pedidos recentes". */
const RECENT_ORDERS_LIMIT = 5;

const MIN_PASSWORD_LENGTH = 6;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Nome do parâmetro de URL que guarda a visão ativa. */
const VIEW_PARAM = 'aba';

type AccountView = 'pedidos' | 'dados' | 'enderecos' | 'seguranca';

interface ViewItem {
  value: AccountView;
  label: string;
}

const VIEW_ITEMS: ViewItem[] = [
  { value: 'pedidos', label: 'Meus pedidos' },
  { value: 'dados', label: 'Meus dados' },
  { value: 'enderecos', label: 'Meus endereços' },
  { value: 'seguranca', label: 'Segurança' },
];

/** Cor do selo de cada status nesta tela (segue a imagem de referência). */
const STATUS_TONES: Record<OrderStatus, BadgeTone> = {
  'Em processamento': 'warning',
  'Pagamento aprovado': 'success',
  Preparando: 'warning',
  Enviado: 'success',
  Entregue: 'neutral',
  Cancelado: 'danger',
};

interface Message {
  type: 'success' | 'error';
  text: string;
}

/* ==========================================================================
   Helpers
   ========================================================================== */

function resolveView(param: string | null): AccountView {
  const match = VIEW_ITEMS.find((item) => item.value === param);

  return match ? match.value : 'pedidos';
}

const formatDate = (iso: string): string => new Date(iso).toLocaleDateString('pt-BR');

const getFirstName = (name: string): string => name.trim().split(/\s+/)[0] ?? name;

/** Formata o CEP enquanto o usuário digita (00000-000). */
function formatZipInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);

  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

/* ==========================================================================
   Campo de formulário com rótulo, dica e erro
   ========================================================================== */

interface FormFieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  full?: boolean;
  children: ReactNode;
}

function FormField({ id, label, hint, error, full = false, children }: FormFieldProps) {
  return (
    <div
      className={classNames(
        'pagina-usuario-form__field',
        full && 'pagina-usuario-form__field--full',
      )}
    >
      <label className="pagina-usuario-form__label" htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? (
        <span className="pagina-usuario-form__error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="pagina-usuario-form__hint">{hint}</span>
      ) : null}
    </div>
  );
}

function FeedbackMessage({ message }: { message: Message | null }) {
  if (!message) {
    return null;
  }

  return (
    <p
      className={classNames(
        'pagina-usuario__message',
        message.type === 'success'
          ? 'pagina-usuario__message--success'
          : 'pagina-usuario__message--error',
      )}
      role={message.type === 'success' ? 'status' : 'alert'}
    >
      {message.text}
    </p>
  );
}

/* ==========================================================================
   Visão 1: Meus pedidos (saudação + pedidos recentes)
   ========================================================================== */

function OrdersView({ user }: { user: User }) {
  const navigate = useNavigate();

  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadOrders(): Promise<void> {
      try {
        const loadedOrders = await getOrdersByUser(user.id);

        if (!isCancelled) {
          setOrders(loadedOrders.slice(0, RECENT_ORDERS_LIMIT));
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : 'Não foi possível carregar os pedidos.',
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadOrders();

    return () => {
      isCancelled = true;
    };
  }, [user.id]);

  return (
    <>
      <section className="pagina-usuario-greeting" aria-label="Saudação">
        <span className="pagina-usuario-greeting__avatar" aria-hidden="true">
          <UserIcon className="pagina-usuario-greeting__avatar-icon" />
        </span>
        <div className="pagina-usuario-greeting__text">
          <h2 className="pagina-usuario-greeting__title">Olá, {getFirstName(user.name)}!</h2>
          <span className="pagina-usuario-greeting__email">{user.email}</span>
        </div>
      </section>

      <SectionCard title="Pedidos recentes">
        {errorMessage && (
          <p className="pagina-usuario__message pagina-usuario__message--error" role="alert">
            {errorMessage}
          </p>
        )}

        {isLoading && !errorMessage && (
          <p className="pagina-usuario__empty" role="status">
            Carregando pedidos...
          </p>
        )}

        {!isLoading && !errorMessage && orders.length === 0 && (
          <div className="pagina-usuario__empty-block">
            <p className="pagina-usuario__empty">Você ainda não fez nenhum pedido.</p>
            <Button variant="primary" onClick={() => navigate(CATALOG_ROUTE)}>
              Ver produtos
            </Button>
          </div>
        )}

        {!isLoading && orders.length > 0 && (
          <ul className="pagina-usuario-orders">
            {orders.map((order) => (
              <li key={order.id} className="pagina-usuario-orders__row">
                <span className="pagina-usuario-orders__number">Pedido {order.orderNumber}</span>
                <span className="pagina-usuario-orders__status">
                  <StatusBadge tone={STATUS_TONES[order.status]}>{order.status}</StatusBadge>
                </span>
                <span className="pagina-usuario-orders__date">{formatDate(order.createdAt)}</span>
                <span className="pagina-usuario-orders__total">{formatCurrency(order.total)}</span>
                <Link className="pagina-usuario-orders__link" to={`${ORDER_DETAILS_ROUTE}/${order.id}`}>
                  Ver detalhes
                  <ArrowRight className="pagina-usuario-orders__link-icon" aria-hidden="true" />
                </Link>
              </li>
            ))}
            {!isLoading && orders.length > 0 && (
              <Link className="pagina-usuario-orders__all" to={ALL_ORDERS_ROUTE}>
                Ver todos os pedidos
              </Link>
            )}
          </ul>
        )}
      </SectionCard>
    </>
  );
}

/* ==========================================================================
   Visão 2: Meus dados
   ========================================================================== */

interface ProfileFormState {
  name: string;
  email: string;
  phone: string;
}

type ProfileErrors = Partial<Record<keyof ProfileFormState, string>>;

function ProfileView({ user }: { user: User }) {
  const { updateProfile } = useAuth();

  const [form, setForm] = useState<ProfileFormState>({
    name: user.name,
    email: user.email,
    phone: user.phone,
  });
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [message, setMessage] = useState<Message | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const updateField = <K extends keyof ProfileFormState>(
    key: K,
    value: ProfileFormState[K],
  ): void => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => (previous[key] ? { ...previous, [key]: undefined } : previous));
    setMessage(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (isSaving) {
      return;
    }

    const nextErrors: ProfileErrors = {};

    if (!form.name.trim()) {
      nextErrors.name = 'Informe o seu nome.';
    }

    if (!EMAIL_PATTERN.test(form.email.trim())) {
      nextErrors.email = 'Informe um e-mail válido.';
    }

    if (!form.phone.trim()) {
      nextErrors.phone = 'Informe o seu telefone.';
    }

    setErrors(nextErrors);
    setMessage(null);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setIsSaving(true);

    try {
      const updatedUser = await updateProfile({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
      });

      setForm({ name: updatedUser.name, email: updatedUser.email, phone: updatedUser.phone });
      setMessage({ type: 'success', text: 'Seus dados foram atualizados.' });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Não foi possível salvar os dados.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SectionCard title="Meus dados">
      <form className="pagina-usuario-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
        <div className="pagina-usuario-form__grid">
          <FormField id="conta-name" label="Nome" error={errors.name} full>
            <input
              id="conta-name"
              type="text"
              className={classNames(
                'pagina-usuario-form__input',
                errors.name && 'pagina-usuario-form__input--invalid',
              )}
              autoComplete="name"
              value={form.name}
              onChange={(event) => updateField('name', event.target.value)}
              disabled={isSaving}
            />
          </FormField>

          <FormField id="conta-email" label="E-mail" error={errors.email}>
            <input
              id="conta-email"
              type="email"
              className={classNames(
                'pagina-usuario-form__input',
                errors.email && 'pagina-usuario-form__input--invalid',
              )}
              autoComplete="email"
              value={form.email}
              onChange={(event) => updateField('email', event.target.value)}
              disabled={isSaving}
            />
          </FormField>

          <FormField id="conta-phone" label="Telefone" error={errors.phone}>
            <input
              id="conta-phone"
              type="text"
              inputMode="tel"
              className={classNames(
                'pagina-usuario-form__input',
                errors.phone && 'pagina-usuario-form__input--invalid',
              )}
              autoComplete="tel"
              value={form.phone}
              onChange={(event) => updateField('phone', event.target.value)}
              disabled={isSaving}
            />
          </FormField>

          <FormField id="conta-cpf" label="CPF" hint="O CPF não pode ser alterado.">
            <input
              id="conta-cpf"
              type="text"
              className="pagina-usuario-form__input"
              value={user.cpf}
              readOnly
              disabled
            />
          </FormField>
        </div>

        <FeedbackMessage message={message} />

        <div className="pagina-usuario-form__actions">
          <Button type="submit" variant="primary" disabled={isSaving}>
            {isSaving ? 'Salvando...' : 'Salvar alterações'}
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}

/* ==========================================================================
   Visão 3: Meus endereços
   ========================================================================== */

interface AddressFormState {
  label: string;
  recipientName: string;
  zipCode: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  isDefault: boolean;
}

type AddressErrors = Partial<Record<keyof AddressFormState, string>>;

/** null = formulário fechado; "new" = novo endereço; UserAddress = edição. */
type AddressFormTarget = 'new' | UserAddress | null;

function addressToForm(address: UserAddress): AddressFormState {
  return {
    label: address.label,
    recipientName: address.recipientName,
    zipCode: address.zipCode,
    street: address.street,
    number: address.number,
    complement: address.complement ?? '',
    neighborhood: address.neighborhood,
    city: address.city,
    state: address.state,
    isDefault: address.isDefault,
  };
}

function validateAddress(form: AddressFormState): AddressErrors {
  const errors: AddressErrors = {};

  if (!form.recipientName.trim()) {
    errors.recipientName = 'Informe o nome do destinatário.';
  }

  if (form.zipCode.replace(/\D/g, '').length !== 8) {
    errors.zipCode = 'Informe um CEP válido com 8 dígitos.';
  }

  if (!form.street.trim()) {
    errors.street = 'Informe a rua.';
  }

  if (!form.number.trim()) {
    errors.number = 'Informe o número.';
  }

  if (!form.neighborhood.trim()) {
    errors.neighborhood = 'Informe o bairro.';
  }

  if (!form.city.trim()) {
    errors.city = 'Informe a cidade.';
  }

  if (!/^[A-Za-z]{2}$/.test(form.state.trim())) {
    errors.state = 'Use a sigla com 2 letras (ex.: SP).';
  }

  return errors;
}

function AddressesView({ user }: { user: User }) {
  const { addresses, addAddress, updateAddress, removeAddress, setDefaultAddress } = useAuth();

  const [target, setTarget] = useState<AddressFormTarget>(null);
  const [form, setForm] = useState<AddressFormState | null>(null);
  const [errors, setErrors] = useState<AddressErrors>({});
  const [message, setMessage] = useState<Message | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [busyAddressId, setBusyAddressId] = useState<number | null>(null);
  const [addressToRemoveId, setAddressToRemoveId] = useState<number | null>(null);

  const updateField = <K extends keyof AddressFormState>(
    key: K,
    value: AddressFormState[K],
  ): void => {
    setForm((previous) => (previous ? { ...previous, [key]: value } : previous));
    setErrors((previous) => (previous[key] ? { ...previous, [key]: undefined } : previous));
  };

  const handleOpenNew = (): void => {
    setTarget('new');
    setForm({
      label: 'Casa',
      recipientName: user.name,
      zipCode: '',
      street: '',
      number: '',
      complement: '',
      neighborhood: '',
      city: '',
      state: '',
      isDefault: addresses.length === 0,
    });
    setErrors({});
    setMessage(null);
    setAddressToRemoveId(null);
  };

  const handleOpenEdit = (address: UserAddress): void => {
    setTarget(address);
    setForm(addressToForm(address));
    setErrors({});
    setMessage(null);
    setAddressToRemoveId(null);
  };

  const handleCloseForm = (): void => {
    if (!isSaving) {
      setTarget(null);
      setForm(null);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (!form || !target || isSaving) {
      return;
    }

    const validationErrors = validateAddress(form);

    setErrors(validationErrors);
    setMessage(null);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    const input: AddressInput = {
      label: form.label.trim(),
      recipientName: form.recipientName.trim(),
      zipCode: form.zipCode,
      street: form.street.trim(),
      number: form.number.trim(),
      complement: form.complement.trim() ? form.complement.trim() : null,
      neighborhood: form.neighborhood.trim(),
      city: form.city.trim(),
      state: form.state.trim().toUpperCase(),
      isDefault: form.isDefault,
    };

    setIsSaving(true);

    try {
      if (target === 'new') {
        await addAddress(input);
        setMessage({ type: 'success', text: 'Endereço cadastrado.' });
      } else {
        await updateAddress(target.id, input);
        setMessage({ type: 'success', text: 'Endereço atualizado.' });
      }

      setTarget(null);
      setForm(null);
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Não foi possível salvar o endereço.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetDefault = async (address: UserAddress): Promise<void> => {
    setBusyAddressId(address.id);
    setMessage(null);

    try {
      await setDefaultAddress(address.id);
      setMessage({ type: 'success', text: `"${address.label}" agora é o endereço padrão.` });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Não foi possível definir o endereço padrão.',
      });
    } finally {
      setBusyAddressId(null);
    }
  };

  const handleConfirmRemove = async (address: UserAddress): Promise<void> => {
    setBusyAddressId(address.id);
    setMessage(null);

    try {
      await removeAddress(address.id);
      setAddressToRemoveId(null);
      setMessage({ type: 'success', text: 'Endereço removido.' });
    } catch (error) {
      // Ex.: endereço vinculado a pedidos não pode ser excluído.
      setAddressToRemoveId(null);
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Não foi possível remover o endereço.',
      });
    } finally {
      setBusyAddressId(null);
    }
  };

  return (
    <SectionCard title="Meus endereços">
      <FeedbackMessage message={message} />

      {form && target ? (
        <form
          className="pagina-usuario-form"
          onSubmit={(event) => void handleSubmit(event)}
          noValidate
        >
          <h3 className="pagina-usuario-form__subtitle">
            {target === 'new' ? 'Novo endereço' : 'Editar endereço'}
          </h3>

          <div className="pagina-usuario-form__grid">
            <FormField id="end-label" label="Identificação" hint="Ex.: Casa, Trabalho">
              <input
                id="end-label"
                type="text"
                className="pagina-usuario-form__input"
                value={form.label}
                onChange={(event) => updateField('label', event.target.value)}
                disabled={isSaving}
              />
            </FormField>

            <FormField id="end-recipient" label="Nome do destinatário" error={errors.recipientName}>
              <input
                id="end-recipient"
                type="text"
                className={classNames(
                  'pagina-usuario-form__input',
                  errors.recipientName && 'pagina-usuario-form__input--invalid',
                )}
                value={form.recipientName}
                onChange={(event) => updateField('recipientName', event.target.value)}
                disabled={isSaving}
              />
            </FormField>

            <FormField id="end-zip" label="CEP" error={errors.zipCode}>
              <input
                id="end-zip"
                type="text"
                inputMode="numeric"
                className={classNames(
                  'pagina-usuario-form__input',
                  errors.zipCode && 'pagina-usuario-form__input--invalid',
                )}
                placeholder="00000-000"
                value={form.zipCode}
                onChange={(event) => updateField('zipCode', formatZipInput(event.target.value))}
                disabled={isSaving}
              />
            </FormField>

            <FormField id="end-street" label="Rua" error={errors.street}>
              <input
                id="end-street"
                type="text"
                className={classNames(
                  'pagina-usuario-form__input',
                  errors.street && 'pagina-usuario-form__input--invalid',
                )}
                value={form.street}
                onChange={(event) => updateField('street', event.target.value)}
                disabled={isSaving}
              />
            </FormField>

            <FormField id="end-number" label="Número" error={errors.number}>
              <input
                id="end-number"
                type="text"
                className={classNames(
                  'pagina-usuario-form__input',
                  errors.number && 'pagina-usuario-form__input--invalid',
                )}
                value={form.number}
                onChange={(event) => updateField('number', event.target.value)}
                disabled={isSaving}
              />
            </FormField>

            <FormField id="end-complement" label="Complemento" hint="Opcional">
              <input
                id="end-complement"
                type="text"
                className="pagina-usuario-form__input"
                value={form.complement}
                onChange={(event) => updateField('complement', event.target.value)}
                disabled={isSaving}
              />
            </FormField>

            <FormField id="end-neighborhood" label="Bairro" error={errors.neighborhood}>
              <input
                id="end-neighborhood"
                type="text"
                className={classNames(
                  'pagina-usuario-form__input',
                  errors.neighborhood && 'pagina-usuario-form__input--invalid',
                )}
                value={form.neighborhood}
                onChange={(event) => updateField('neighborhood', event.target.value)}
                disabled={isSaving}
              />
            </FormField>

            <FormField id="end-city" label="Cidade" error={errors.city}>
              <input
                id="end-city"
                type="text"
                className={classNames(
                  'pagina-usuario-form__input',
                  errors.city && 'pagina-usuario-form__input--invalid',
                )}
                value={form.city}
                onChange={(event) => updateField('city', event.target.value)}
                disabled={isSaving}
              />
            </FormField>

            <FormField id="end-state" label="Estado (UF)" error={errors.state}>
              <input
                id="end-state"
                type="text"
                maxLength={2}
                className={classNames(
                  'pagina-usuario-form__input',
                  errors.state && 'pagina-usuario-form__input--invalid',
                )}
                placeholder="SP"
                value={form.state}
                onChange={(event) => updateField('state', event.target.value.toUpperCase())}
                disabled={isSaving}
              />
            </FormField>
          </div>

          <label className="pagina-usuario-form__check" htmlFor="end-default">
            <input
              id="end-default"
              type="checkbox"
              className="pagina-usuario-form__checkbox"
              checked={form.isDefault}
              onChange={(event) => updateField('isDefault', event.target.checked)}
              disabled={isSaving || (target !== 'new' && target.isDefault)}
            />
            Usar como endereço de entrega padrão
          </label>

          <div className="pagina-usuario-form__actions">
            <Button type="button" variant="outline-neutral" onClick={handleCloseForm} disabled={isSaving}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={isSaving}>
              {isSaving ? 'Salvando...' : 'Salvar endereço'}
            </Button>
          </div>
        </form>
      ) : (
        <>
          {addresses.length === 0 ? (
            <p className="pagina-usuario__empty">Você ainda não cadastrou nenhum endereço.</p>
          ) : (
            <ul className="pagina-usuario-addresses">
              {addresses.map((address) => {
                const isBusy = busyAddressId === address.id;
                const isConfirmingRemove = addressToRemoveId === address.id;

                return (
                  <li key={address.id} className="pagina-usuario-addresses__item">
                    <div className="pagina-usuario-addresses__info">
                      <span className="pagina-usuario-addresses__label">
                        {address.label}
                        {address.isDefault && (
                          <span className="pagina-usuario-addresses__default">Padrão</span>
                        )}
                      </span>
                      <span className="pagina-usuario-addresses__text">{address.recipientName}</span>
                      <span className="pagina-usuario-addresses__text">
                        {address.street}, {address.number}
                        {address.complement ? ` - ${address.complement}` : ''}
                      </span>
                      <span className="pagina-usuario-addresses__text">
                        {address.neighborhood} · {address.city} / {address.state} · {address.zipCode}
                      </span>
                    </div>

                    <div className="pagina-usuario-addresses__actions">
                      {isConfirmingRemove ? (
                        <>
                          <span className="pagina-usuario-addresses__confirm">Remover este endereço?</span>
                          <Button
                            variant="outline-danger"
                            size="sm"
                            onClick={() => void handleConfirmRemove(address)}
                            disabled={isBusy}
                          >
                            {isBusy ? 'Removendo...' : 'Confirmar'}
                          </Button>
                          <Button
                            variant="outline-neutral"
                            size="sm"
                            onClick={() => setAddressToRemoveId(null)}
                            disabled={isBusy}
                          >
                            Cancelar
                          </Button>
                        </>
                      ) : (
                        <>
                          {!address.isDefault && (
                            <Button
                              variant="outline-neutral"
                              size="sm"
                              onClick={() => void handleSetDefault(address)}
                              disabled={isBusy}
                            >
                              Definir como padrão
                            </Button>
                          )}
                          <Button
                            variant="outline-neutral"
                            size="sm"
                            onClick={() => handleOpenEdit(address)}
                            disabled={isBusy}
                          >
                            Editar
                          </Button>
                          <Button
                            variant="outline-danger"
                            size="sm"
                            onClick={() => setAddressToRemoveId(address.id)}
                            disabled={isBusy}
                          >
                            Remover
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="pagina-usuario-form__actions">
            <Button variant="primary" leftIcon={Plus} onClick={handleOpenNew}>
              Novo endereço
            </Button>
          </div>
        </>
      )}
    </SectionCard>
  );
}

/* ==========================================================================
   Visão 4: Segurança (alteração de senha)
   ========================================================================== */

interface PasswordFormState {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

type PasswordErrors = Partial<Record<keyof PasswordFormState, string>>;

const EMPTY_PASSWORD_FORM: PasswordFormState = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

function SecurityView() {
  const { changePassword } = useAuth();

  const [form, setForm] = useState<PasswordFormState>(EMPTY_PASSWORD_FORM);
  const [errors, setErrors] = useState<PasswordErrors>({});
  const [message, setMessage] = useState<Message | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const updateField = <K extends keyof PasswordFormState>(
    key: K,
    value: PasswordFormState[K],
  ): void => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => (previous[key] ? { ...previous, [key]: undefined } : previous));
    setMessage(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (isSaving) {
      return;
    }

    const nextErrors: PasswordErrors = {};

    if (!form.currentPassword) {
      nextErrors.currentPassword = 'Informe a senha atual.';
    }

    if (form.newPassword.length < MIN_PASSWORD_LENGTH) {
      nextErrors.newPassword = `A nova senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
    } else if (form.newPassword === form.currentPassword) {
      nextErrors.newPassword = 'A nova senha deve ser diferente da senha atual.';
    }

    if (form.confirmPassword !== form.newPassword) {
      nextErrors.confirmPassword = 'A confirmação não confere com a nova senha.';
    }

    setErrors(nextErrors);
    setMessage(null);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setIsSaving(true);

    try {
      await changePassword(form.currentPassword, form.newPassword);
      setForm(EMPTY_PASSWORD_FORM);
      setMessage({ type: 'success', text: 'Senha alterada com sucesso.' });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Não foi possível alterar a senha.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SectionCard title="Segurança">
      <form className="pagina-usuario-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
        <div className="pagina-usuario-form__grid pagina-usuario-form__grid--single">
          <FormField id="seg-current" label="Senha atual" error={errors.currentPassword}>
            <input
              id="seg-current"
              type="password"
              className={classNames(
                'pagina-usuario-form__input',
                errors.currentPassword && 'pagina-usuario-form__input--invalid',
              )}
              autoComplete="current-password"
              value={form.currentPassword}
              onChange={(event) => updateField('currentPassword', event.target.value)}
              disabled={isSaving}
            />
          </FormField>

          <FormField
            id="seg-new"
            label="Nova senha"
            hint={`Mínimo de ${MIN_PASSWORD_LENGTH} caracteres.`}
            error={errors.newPassword}
          >
            <input
              id="seg-new"
              type="password"
              className={classNames(
                'pagina-usuario-form__input',
                errors.newPassword && 'pagina-usuario-form__input--invalid',
              )}
              autoComplete="new-password"
              value={form.newPassword}
              onChange={(event) => updateField('newPassword', event.target.value)}
              disabled={isSaving}
            />
          </FormField>

          <FormField id="seg-confirm" label="Confirmar nova senha" error={errors.confirmPassword}>
            <input
              id="seg-confirm"
              type="password"
              className={classNames(
                'pagina-usuario-form__input',
                errors.confirmPassword && 'pagina-usuario-form__input--invalid',
              )}
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={(event) => updateField('confirmPassword', event.target.value)}
              disabled={isSaving}
            />
          </FormField>
        </div>

        <FeedbackMessage message={message} />

        <div className="pagina-usuario-form__actions">
          <Button type="submit" variant="primary" disabled={isSaving}>
            {isSaving ? 'Salvando...' : 'Alterar senha'}
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}

/* ==========================================================================
   Tela
   ========================================================================== */

export function PaginaDoUsuario() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isLoading, logout } = useAuth();

  const view = resolveView(searchParams.get(VIEW_PARAM));

  const handleSelectView = (nextView: AccountView): void => {
    setSearchParams(nextView === 'pedidos' ? {} : { [VIEW_PARAM]: nextView });
  };

  const handleLogout = async (): Promise<void> => {
    await logout();
    navigate(HOME_ROUTE, { replace: true });
  };

  // Aguardando a sessão ou visitante sem login.
  if (isLoading || !user) {
    return (
      <StoreLayout>
        <div className="pagina-usuario">
          <h1 className="pagina-usuario__title">Minha Conta</h1>
          <p className="pagina-usuario__notice" role="status">
            {isLoading ? 'Carregando...' : 'Faça login para acessar a sua conta.'}
          </p>
          {!isLoading && (
            <div className="pagina-usuario__notice-action">
              <Button variant="primary" onClick={() => navigate(LOGIN_ROUTE)}>
                Entrar
              </Button>
            </div>
          )}
        </div>
      </StoreLayout>
    );
  }

  return (
    <StoreLayout>
      <div className="pagina-usuario">
        <h1 className="pagina-usuario__title">Minha Conta</h1>

        <div className="pagina-usuario__layout">
          <nav className="pagina-usuario-menu" aria-label="Menu da conta">
            <ul className="pagina-usuario-menu__list">
              {VIEW_ITEMS.map((item) => (
                <li key={item.value}>
                  <button
                    type="button"
                    className={classNames(
                      'pagina-usuario-menu__item',
                      view === item.value && 'pagina-usuario-menu__item--active',
                    )}
                    aria-current={view === item.value ? 'page' : undefined}
                    onClick={() => handleSelectView(item.value)}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  className="pagina-usuario-menu__item"
                  onClick={() => void handleLogout()}
                >
                  Sair
                </button>
              </li>
            </ul>
          </nav>

          <div className="pagina-usuario__content">
            {view === 'pedidos' && <OrdersView user={user} />}
            {view === 'dados' && <ProfileView user={user} />}
            {view === 'enderecos' && <AddressesView user={user} />}
            {view === 'seguranca' && <SecurityView />}
          </div>
        </div>
      </div>
    </StoreLayout>
  );
}

export default PaginaDoUsuario;
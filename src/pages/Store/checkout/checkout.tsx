/**
 * VELOX — Página de checkout (rota: /checkout).
 *
 * A página se envolve no StoreLayout (header, navegação, container e footer
 * vêm do layout), recebendo o conteúdo via `children`. Portanto, a rota
 * /checkout deve ser registrada fora de uma rota-pai que já use o StoreLayout.
 *
 * Fluxo:
 * 1. Endereço de entrega (pré-preenchido com o endereço padrão do usuário).
 * 2. Pagamento (Pix, Cartão de crédito ou Boleto).
 * 3. Resumo do pedido + botão "Finalizar pedido".
 *
 * Ao finalizar: garante o endereço (reutiliza o salvo ou cria um novo), cria o
 * pedido via orderService, limpa o carrinho e redireciona para
 * /pedido-confirmado/:id. Os dados do cartão são apenas validados no front-end
 * e nunca são persistidos nem enviados ao serviço de pedidos.
 */

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type JSX } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Button } from '../../../components/Ui/Button/Button';
import { SectionCard } from '../../../components/Ui/SectionCard/SectionCard';
import { useAuth } from '../../../context/AuthContext';
import { useCart } from '../../../context/CartContext';
import { StoreLayout } from '../../../layouts/StoreLayout/StoreLayout';
import { addAddress, getAddressesByUser } from '../../../services/authService';
import { calculateShippingCost, createOrder } from '../../../services/orderService';
import { getProductById } from '../../../services/productService';
import type { PaymentMethod, Product, UserAddress } from '../../../types';
import { classNames } from '../../../utils/helpers';
import { calculateOrderTotals } from '../../../utils/pricing';
import './checkout.css';

/* ==========================================================================
   Constantes e tipos
   ========================================================================== */

const LOGIN_ROUTE = '/login';
const HOME_ROUTE = '/';
const CHECKOUT_ROUTE = '/checkout';

interface PaymentOption {
  value: PaymentMethod;
  label: string;
  note: string | null;
}

const PAYMENT_OPTIONS: PaymentOption[] = [
  {
    value: 'Pix',
    label: 'PIX',
    note: 'O código Pix será exibido após a confirmação do pedido. A aprovação é imediata.',
  },
  { value: 'Cartão de crédito', label: 'Cartão de crédito', note: null },
  {
    value: 'Boleto',
    label: 'Boleto',
    note: 'O boleto será gerado após a confirmação do pedido e vence em 3 dias úteis.',
  },
];

interface AddressFormState {
  recipientName: string;
  zipCode: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
}

interface CardFormState {
  number: string;
  holderName: string;
  expiry: string;
  cvv: string;
}

type FormErrors = Partial<Record<keyof AddressFormState | `card${'Number' | 'HolderName' | 'Expiry' | 'Cvv'}`, string>>;

const EMPTY_ADDRESS_FORM: AddressFormState = {
  recipientName: '',
  zipCode: '',
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: '',
};

const EMPTY_CARD_FORM: CardFormState = {
  number: '',
  holderName: '',
  expiry: '',
  cvv: '',
};

/* ==========================================================================
   Utilitários locais
   ========================================================================== */

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const formatCurrency = (value: number): string => currencyFormatter.format(value);

const onlyDigits = (value: string): string => value.replace(/\D/g, '');

function maskZipCode(value: string): string {
  const digits = onlyDigits(value).slice(0, 8);

  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

function maskCardNumber(value: string): string {
  return onlyDigits(value)
    .slice(0, 16)
    .replace(/(\d{4})(?=\d)/g, '$1 ');
}

function maskExpiry(value: string): string {
  const digits = onlyDigits(value).slice(0, 4);

  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}

function toAddressForm(address: UserAddress): AddressFormState {
  return {
    recipientName: address.recipientName,
    zipCode: maskZipCode(address.zipCode),
    street: address.street,
    number: address.number,
    complement: address.complement ?? '',
    neighborhood: address.neighborhood,
    city: address.city,
    state: address.state,
  };
}

function isSameAddress(form: AddressFormState, address: UserAddress): boolean {
  const saved = toAddressForm(address);

  return (Object.keys(saved) as Array<keyof AddressFormState>).every(
    (field) => form[field].trim() === saved[field].trim(),
  );
}

function isExpiryValid(expiry: string): boolean {
  const match = /^(\d{2})\/(\d{2})$/.exec(expiry);

  if (!match) {
    return false;
  }

  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);

  if (month < 1 || month > 12) {
    return false;
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  return year > currentYear || (year === currentYear && month >= currentMonth);
}

function validateForm(
  address: AddressFormState,
  card: CardFormState,
  paymentMethod: PaymentMethod,
): FormErrors {
  const errors: FormErrors = {};

  if (!address.recipientName.trim()) {
    errors.recipientName = 'Informe o nome do destinatário.';
  }

  if (onlyDigits(address.zipCode).length !== 8) {
    errors.zipCode = 'Informe um CEP válido.';
  }

  if (!address.street.trim()) {
    errors.street = 'Informe a rua.';
  }

  if (!address.number.trim()) {
    errors.number = 'Informe o número.';
  }

  if (!address.neighborhood.trim()) {
    errors.neighborhood = 'Informe o bairro.';
  }

  if (!address.city.trim()) {
    errors.city = 'Informe a cidade.';
  }

  if (!/^[A-Za-z]{2}$/.test(address.state.trim())) {
    errors.state = 'Use a sigla da UF.';
  }

  if (paymentMethod === 'Cartão de crédito') {
    const cardDigits = onlyDigits(card.number);

    if (cardDigits.length < 13 || cardDigits.length > 16) {
      errors.cardNumber = 'Informe um número de cartão válido.';
    }

    if (!card.holderName.trim()) {
      errors.cardHolderName = 'Informe o nome impresso no cartão.';
    }

    if (!isExpiryValid(card.expiry)) {
      errors.cardExpiry = 'Validade inválida ou vencida.';
    }

    if (!/^\d{3,4}$/.test(card.cvv)) {
      errors.cardCvv = 'CVV inválido.';
    }
  }

  return errors;
}

/* ==========================================================================
   Campo de formulário (local à página)
   ========================================================================== */

interface CheckoutFieldProps {
  id: string;
  label: string;
  error?: string;
  className?: string;
  children: (props: { id: string; className: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => JSX.Element;
}

function CheckoutField({ id, label, error, className, children }: CheckoutFieldProps) {
  const errorId = `${id}-error`;

  return (
    <div className={classNames('checkout__field', className)}>
      <label className="checkout__label" htmlFor={id}>
        {label}
      </label>
      {children({
        id,
        className: classNames('checkout__input', error && 'checkout__input--invalid'),
        'aria-invalid': Boolean(error),
        'aria-describedby': error ? errorId : undefined,
      })}
      {error ? (
        <span className="checkout__field-error" id={errorId} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

/* ==========================================================================
   Página
   ========================================================================== */

export function Checkout() {
  const { user, isLoading } = useAuth();
  const { items, subtotal, coupon, clearCart } = useCart();
  const navigate = useNavigate();
  

  const [addressForm, setAddressForm] = useState<AddressFormState>(EMPTY_ADDRESS_FORM);
  const [savedAddress, setSavedAddress] = useState<UserAddress | null>(null);
  const [hasSavedAddresses, setHasSavedAddresses] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cartão de crédito');
  const [cardForm, setCardForm] = useState<CardFormState>(EMPTY_CARD_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPlaced, setIsPlaced] = useState(false);
  const [products, setProducts] = useState<Record<number, Product | null>>({});
  const [shippingCost, setShippingCost] = useState(0);

  const userId = user ? user.id : null;

  /* ------------------------------------------------------------------------
     Pré-preenchimento com o endereço salvo (padrão ou o primeiro da lista)
     ------------------------------------------------------------------------ */
  useEffect(() => {
    if (userId === null) {
      return undefined;
    }

    let isCurrent = true;

    getAddressesByUser(userId)
      .then((addresses) => {
        if (!isCurrent) {
          return;
        }

        setHasSavedAddresses(addresses.length > 0);

        const preferred = addresses.find((address) => address.isDefault) ?? addresses[0] ?? null;

        if (preferred) {
          setSavedAddress(preferred);
          setAddressForm(toAddressForm(preferred));
        }
      })
      .catch(() => {
        // Sem endereço salvo disponível: o usuário preenche manualmente.
      });

    return () => {
      isCurrent = false;
    };
  }, [userId]);

  /* ------------------------------------------------------------------------
     Dados dos produtos (nome e imagem) para o resumo
     ------------------------------------------------------------------------ */
  const productIdsKey = items.map((item) => item.productId).join(',');

  useEffect(() => {
    let isCurrent = true;
    const ids = Array.from(new Set(items.map((item) => item.productId)));

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productIdsKey]);

  /* ------------------------------------------------------------------------
     Frete a partir da UF informada
     ------------------------------------------------------------------------ */
  const normalizedState = addressForm.state.trim().toUpperCase();
  const hasState = normalizedState.length === 2;

  useEffect(() => {
    let isCurrent = true;

    if (!hasState) {
      setShippingCost(0);
      return undefined;
    }

    calculateShippingCost(normalizedState).then((cost) => {
      if (isCurrent) {
        setShippingCost(cost);
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [hasState, normalizedState]);

  const totals = useMemo(
    () => calculateOrderTotals(subtotal, shippingCost, coupon),
    [subtotal, shippingCost, coupon],
  );

  /* ------------------------------------------------------------------------
     Handlers
     ------------------------------------------------------------------------ */
  const handleAddressChange =
    (field: keyof AddressFormState) =>
    (event: ChangeEvent<HTMLInputElement>): void => {
      const raw = event.target.value;
      let value = raw;

      if (field === 'zipCode') {
        value = maskZipCode(raw);
      } else if (field === 'state') {
        value = raw.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase();
      }

      setAddressForm((previous) => ({ ...previous, [field]: value }));
      setErrors((previous) => ({ ...previous, [field]: undefined }));
    };

  const handleCardChange =
    (field: keyof CardFormState) =>
    (event: ChangeEvent<HTMLInputElement>): void => {
      const raw = event.target.value;
      let value = raw;

      if (field === 'number') {
        value = maskCardNumber(raw);
      } else if (field === 'expiry') {
        value = maskExpiry(raw);
      } else if (field === 'cvv') {
        value = onlyDigits(raw).slice(0, 4);
      } else {
        value = raw.toUpperCase();
      }

      const errorKey = `card${field.charAt(0).toUpperCase()}${field.slice(1)}` as keyof FormErrors;

      setCardForm((previous) => ({ ...previous, [field]: value }));
      setErrors((previous) => ({ ...previous, [errorKey]: undefined }));
    };

  /** Reutiliza o endereço salvo se não foi alterado; caso contrário, grava um novo. */
  const resolveAddressId = async (ownerId: number): Promise<number> => {
    if (savedAddress && isSameAddress(addressForm, savedAddress)) {
      return savedAddress.id;
    }

    // O authService valida, formata o CEP, normaliza a UF e define o primeiro endereço como padrão.
    const created = await addAddress(ownerId, {
      label: 'Entrega',
      recipientName: addressForm.recipientName.trim(),
      zipCode: onlyDigits(addressForm.zipCode),
      street: addressForm.street.trim(),
      number: addressForm.number.trim(),
      complement: addressForm.complement.trim() ? addressForm.complement.trim() : null,
      neighborhood: addressForm.neighborhood.trim(),
      city: addressForm.city.trim(),
      state: normalizedState,
      isDefault: !hasSavedAddresses,
    });

    return created.id;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (userId === null || isSubmitting) {
      return;
    }

    const validationErrors = validateForm(addressForm, cardForm, paymentMethod);
    setErrors(validationErrors);
    setSubmitError(null);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);

    try {
      const addressId = await resolveAddressId(userId);

      const order = await createOrder({
        userId,
        addressId,
        paymentMethod,
        items: items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
        couponCode: coupon ? coupon.code : null,
      });

      setIsPlaced(true);
      clearCart();
      navigate(`/pedido-confirmado/${order.id}`, { replace: true });
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Não foi possível finalizar o pedido.',
      );
      setIsSubmitting(false);
    }
  };

  /* ------------------------------------------------------------------------
     Guardas de renderização
     ------------------------------------------------------------------------ */
  if (isLoading || isPlaced) {
    return null;
  }

  if (!user) {
    return <Navigate to={LOGIN_ROUTE} replace state={{ from: CHECKOUT_ROUTE }} />;
  }

  if (items.length === 0) {
    return (
      <StoreLayout>
        <div className="checkout">
          <h1 className="checkout__title">Finalizar compra</h1>
          <div className="checkout__empty">
            <p className="checkout__empty-text">Seu carrinho está vazio.</p>
            <Link className="checkout__empty-link" to={HOME_ROUTE}>
              Continuar comprando
            </Link>
          </div>
        </div>
      </StoreLayout>
    );
  }

  const selectedOption = PAYMENT_OPTIONS.find((option) => option.value === paymentMethod);

  /* ------------------------------------------------------------------------
     Render
     ------------------------------------------------------------------------ */
  const page = (
    <div className="checkout">
      <h1 className="checkout__title">Finalizar compra</h1>

      <form className="checkout__layout" onSubmit={handleSubmit} noValidate>
        <div className="checkout__main">
          {/* 1. Endereço de entrega */}
          <SectionCard title="1. Endereço de entrega">
            <div className="checkout__form">
              <CheckoutField
                id="checkout-recipient"
                label="Nome"
                error={errors.recipientName}
                className="checkout__field--full"
              >
                {(props) => (
                  <input
                    {...props}
                    type="text"
                    autoComplete="name"
                    placeholder="Nome completo"
                    value={addressForm.recipientName}
                    onChange={handleAddressChange('recipientName')}
                  />
                )}
              </CheckoutField>

              <CheckoutField id="checkout-zip" label="CEP" error={errors.zipCode}>
                {(props) => (
                  <input
                    {...props}
                    type="text"
                    inputMode="numeric"
                    autoComplete="postal-code"
                    placeholder="00000-000"
                    value={addressForm.zipCode}
                    onChange={handleAddressChange('zipCode')}
                  />
                )}
              </CheckoutField>

              <CheckoutField id="checkout-street" label="Rua" error={errors.street}>
                {(props) => (
                  <input
                    {...props}
                    type="text"
                    autoComplete="address-line1"
                    placeholder="Rua das Flores"
                    value={addressForm.street}
                    onChange={handleAddressChange('street')}
                  />
                )}
              </CheckoutField>

              <CheckoutField id="checkout-number" label="Número" error={errors.number}>
                {(props) => (
                  <input
                    {...props}
                    type="text"
                    inputMode="numeric"
                    placeholder="123"
                    value={addressForm.number}
                    onChange={handleAddressChange('number')}
                  />
                )}
              </CheckoutField>

              <CheckoutField id="checkout-complement" label="Complemento" error={errors.complement}>
                {(props) => (
                  <input
                    {...props}
                    type="text"
                    autoComplete="address-line2"
                    placeholder="Apto 45"
                    value={addressForm.complement}
                    onChange={handleAddressChange('complement')}
                  />
                )}
              </CheckoutField>

              <CheckoutField
                id="checkout-neighborhood"
                label="Bairro"
                error={errors.neighborhood}
                className="checkout__field--full"
              >
                {(props) => (
                  <input
                    {...props}
                    type="text"
                    autoComplete="address-level3"
                    placeholder="Centro"
                    value={addressForm.neighborhood}
                    onChange={handleAddressChange('neighborhood')}
                  />
                )}
              </CheckoutField>

              <div className="checkout__row checkout__row--city">
                <CheckoutField id="checkout-city" label="Cidade" error={errors.city}>
                  {(props) => (
                    <input
                      {...props}
                      type="text"
                      autoComplete="address-level2"
                      placeholder="São Paulo"
                      value={addressForm.city}
                      onChange={handleAddressChange('city')}
                    />
                  )}
                </CheckoutField>

                <CheckoutField id="checkout-state" label="Estado" error={errors.state}>
                  {(props) => (
                    <input
                      {...props}
                      type="text"
                      autoComplete="address-level1"
                      placeholder="SP"
                      maxLength={2}
                      value={addressForm.state}
                      onChange={handleAddressChange('state')}
                    />
                  )}
                </CheckoutField>
              </div>
            </div>
          </SectionCard>

          {/* 2. Pagamento */}
          <SectionCard title="2. Pagamento">
            <div className="checkout__payment-options" role="radiogroup" aria-label="Forma de pagamento">
              {PAYMENT_OPTIONS.map((option) => {
                const isSelected = option.value === paymentMethod;

                return (
                  <button
                    key={option.value}
                    className={classNames(
                      'checkout__payment-option',
                      isSelected && 'checkout__payment-option--selected',
                    )}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setPaymentMethod(option.value)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            {paymentMethod === 'Cartão de crédito' ? (
              <div className="checkout__form checkout__form--card">
                <CheckoutField
                  id="checkout-card-number"
                  label="Número do cartão"
                  error={errors.cardNumber}
                  className="checkout__field--full"
                >
                  {(props) => (
                    <input
                      {...props}
                      type="text"
                      inputMode="numeric"
                      autoComplete="cc-number"
                      placeholder="0000 0000 0000 0000"
                      value={cardForm.number}
                      onChange={handleCardChange('number')}
                    />
                  )}
                </CheckoutField>

                <CheckoutField
                  id="checkout-card-name"
                  label="Nome no cartão"
                  error={errors.cardHolderName}
                  className="checkout__field--full"
                >
                  {(props) => (
                    <input
                      {...props}
                      type="text"
                      autoComplete="cc-name"
                      placeholder="NOME COMPLETO"
                      value={cardForm.holderName}
                      onChange={handleCardChange('holderName')}
                    />
                  )}
                </CheckoutField>

                <CheckoutField id="checkout-card-expiry" label="Validade" error={errors.cardExpiry}>
                  {(props) => (
                    <input
                      {...props}
                      type="text"
                      inputMode="numeric"
                      autoComplete="cc-exp"
                      placeholder="MM/AA"
                      value={cardForm.expiry}
                      onChange={handleCardChange('expiry')}
                    />
                  )}
                </CheckoutField>

                <CheckoutField id="checkout-card-cvv" label="CVV" error={errors.cardCvv}>
                  {(props) => (
                    <input
                      {...props}
                      type="text"
                      inputMode="numeric"
                      autoComplete="cc-csc"
                      placeholder="000"
                      value={cardForm.cvv}
                      onChange={handleCardChange('cvv')}
                    />
                  )}
                </CheckoutField>
              </div>
            ) : selectedOption && selectedOption.note ? (
              <p className="checkout__payment-note">{selectedOption.note}</p>
            ) : null}
          </SectionCard>
        </div>

        {/* 3. Resumo do pedido */}
        <aside className="checkout__aside">
          <SectionCard title="3. Resumo do pedido">
            <ul className="checkout__items">
              {items.map((item) => {
                const product = products[item.productId] ?? null;
                const name = product ? product.name : `Produto #${item.productId}`;

                return (
                  <li key={item.id} className="checkout__item">
                    <span className="checkout__item-thumb">
                      {product ? (
                        <img className="checkout__item-image" src={product.imageUrl} alt={name} />
                      ) : null}
                    </span>
                    <span className="checkout__item-info">
                      <span className="checkout__item-name">{name}</span>
                      <span className="checkout__item-quantity">Qtd: {item.quantity}</span>
                    </span>
                    <span className="checkout__item-price">
                      {formatCurrency(item.unitPrice * item.quantity)}
                    </span>
                  </li>
                );
              })}
            </ul>

            <dl className="checkout__totals">
              <div className="checkout__totals-row">
                <dt className="checkout__totals-label">Subtotal</dt>
                <dd className="checkout__totals-value">{formatCurrency(totals.subtotal)}</dd>
              </div>

              {totals.discountAmount > 0 ? (
                <div className="checkout__totals-row">
                  <dt className="checkout__totals-label">
                    Desconto{coupon ? ` (${coupon.code})` : ''}
                  </dt>
                  <dd className="checkout__totals-value checkout__totals-value--discount">
                    - {formatCurrency(totals.discountAmount)}
                  </dd>
                </div>
              ) : null}

              <div className="checkout__totals-row">
                <dt className="checkout__totals-label">Frete</dt>
                {!hasState ? (
                  <dd className="checkout__totals-value checkout__totals-value--muted">A calcular</dd>
                ) : totals.shippingCost === 0 ? (
                  <dd className="checkout__totals-value checkout__totals-value--free">Grátis</dd>
                ) : (
                  <dd className="checkout__totals-value">{formatCurrency(totals.shippingCost)}</dd>
                )}
              </div>

              <div className="checkout__totals-row checkout__totals-row--total">
                <dt className="checkout__total-label">Total</dt>
                <dd className="checkout__total-value">{formatCurrency(totals.total)}</dd>
              </div>
            </dl>

            {submitError ? (
              <p className="checkout__alert" role="alert">
                {submitError}
              </p>
            ) : null}

            <div className="checkout__submit">
              <Button type="submit" fullWidth disabled={isSubmitting}>
                {isSubmitting ? 'Finalizando...' : 'Finalizar pedido'}
              </Button>
            </div>
          </SectionCard>
        </aside>
      </form>
    </div>
  );

  return <StoreLayout>{page}</StoreLayout>;
}

export default Checkout;
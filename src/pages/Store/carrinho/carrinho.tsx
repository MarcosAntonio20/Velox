/**
 * VELOX — Página do carrinho (rota: /carrinho).
 *
 * A página se envolve no StoreLayout (header, navegação, container e footer
 * vêm do layout). Portanto, a rota /carrinho deve ser registrada fora de uma
 * rota-pai que já use o StoreLayout.
 *
 * - Itens e quantidades vêm do CartContext (subtotal e total em tempo real).
 * - Nome, imagem e estoque vêm de productService.getProductById, pois o
 *   CartItem guarda apenas productId, quantidade e preço unitário.
 * - O campo de CEP simula o cálculo de frete: o CEP é convertido em UF e o
 *   valor sai de orderService.calculateShippingCost (o mesmo usado no checkout).
 */

import { Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../components/Ui/Button/Button';
import { QuantityStepper } from '../../../components/Ui/QuantityStepper/QuantityStepper';
import { SectionCard } from '../../../components/Ui/SectionCard/SectionCard';
import { useCart } from '../../../context/CartContext';
import { StoreLayout } from '../../../layouts/StoreLayout/StoreLayout';
import { calculateShippingCost } from '../../../services/orderService';
import { getProductById } from '../../../services/productService';
import type { Product } from '../../../types';
import { calculateOrderTotals, roundCurrency } from '../../../utils/pricing';
import './carrinho.css';

/* ==========================================================================
   Constantes e tipos
   ========================================================================== */

const HOME_ROUTE = '/';
const CHECKOUT_ROUTE = '/checkout';

/** Mesmo limite por item usado no CartContext. */
const MAX_QUANTITY_PER_ITEM = 99;

/** Número de parcelas sem juros exibidas abaixo do botão. */
const INSTALLMENTS = 12;

/** Tempo da simulação de cálculo do frete. */
const SHIPPING_SIMULATION_DELAY_MS = 500;

/** Faixas de CEP (5 primeiros dígitos) por UF. */
const ZIP_RANGES: Array<{ from: number; to: number; state: string }> = [
  { from: 1000, to: 19999, state: 'SP' },
  { from: 20000, to: 28999, state: 'RJ' },
  { from: 29000, to: 29999, state: 'ES' },
  { from: 30000, to: 39999, state: 'MG' },
  { from: 40000, to: 48999, state: 'BA' },
  { from: 49000, to: 49999, state: 'SE' },
  { from: 50000, to: 56999, state: 'PE' },
  { from: 57000, to: 57999, state: 'AL' },
  { from: 58000, to: 58999, state: 'PB' },
  { from: 59000, to: 59999, state: 'RN' },
  { from: 60000, to: 63999, state: 'CE' },
  { from: 64000, to: 64999, state: 'PI' },
  { from: 65000, to: 65999, state: 'MA' },
  { from: 66000, to: 68899, state: 'PA' },
  { from: 68900, to: 68999, state: 'AP' },
  { from: 69000, to: 69299, state: 'AM' },
  { from: 69300, to: 69399, state: 'RR' },
  { from: 69400, to: 69899, state: 'AM' },
  { from: 69900, to: 69999, state: 'AC' },
  { from: 70000, to: 72799, state: 'DF' },
  { from: 72800, to: 72999, state: 'GO' },
  { from: 73000, to: 73699, state: 'DF' },
  { from: 73700, to: 76799, state: 'GO' },
  { from: 76800, to: 76999, state: 'RO' },
  { from: 77000, to: 77999, state: 'TO' },
  { from: 78000, to: 78899, state: 'MT' },
  { from: 78900, to: 78999, state: 'RO' },
  { from: 79000, to: 79999, state: 'MS' },
  { from: 80000, to: 87999, state: 'PR' },
  { from: 88000, to: 89999, state: 'SC' },
  { from: 90000, to: 99999, state: 'RS' },
];

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

/** Converte um CEP de 8 dígitos na UF correspondente (null se não encontrada). */
function getStateFromZipCode(zipCode: string): string | null {
  const prefix = Number(onlyDigits(zipCode).slice(0, 5));
  const range = ZIP_RANGES.find((item) => prefix >= item.from && prefix <= item.to);

  return range ? range.state : null;
}

/* ==========================================================================
   Página
   ========================================================================== */

export function Cart() {
  const { items, totalItems, subtotal, coupon, removeFromCart, updateQuantity } = useCart();
  const navigate = useNavigate();

  const [products, setProducts] = useState<Record<number, Product | null>>({});
  const [zipCode, setZipCode] = useState('');
  const [zipError, setZipError] = useState<string | null>(null);
  const [shippingState, setShippingState] = useState<string | null>(null);
  const [shippingCost, setShippingCost] = useState<number | null>(null);
  const [isCalculatingShipping, setIsCalculatingShipping] = useState(false);

  /* ------------------------------------------------------------------------
     Dados dos produtos (nome, imagem e estoque)
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
     Simulação do cálculo de frete a partir do CEP
     ------------------------------------------------------------------------ */
  const zipDigits = onlyDigits(zipCode);

  useEffect(() => {
    setShippingCost(null);
    setShippingState(null);

    if (zipDigits.length === 0) {
      setZipError(null);
      setIsCalculatingShipping(false);
      return undefined;
    }

    if (zipDigits.length < 8) {
      setZipError(null);
      setIsCalculatingShipping(false);
      return undefined;
    }

    const state = getStateFromZipCode(zipDigits);

    if (!state) {
      setZipError('CEP não encontrado.');
      setIsCalculatingShipping(false);
      return undefined;
    }

    let isCurrent = true;
    setZipError(null);
    setIsCalculatingShipping(true);

    const timer = window.setTimeout(() => {
      calculateShippingCost(state)
        .then((cost) => {
          if (!isCurrent) {
            return;
          }

          setShippingState(state);
          setShippingCost(cost);
        })
        .catch(() => {
          if (isCurrent) {
            setZipError('Não foi possível calcular o frete.');
          }
        })
        .finally(() => {
          if (isCurrent) {
            setIsCalculatingShipping(false);
          }
        });
    }, SHIPPING_SIMULATION_DELAY_MS);

    return () => {
      isCurrent = false;
      window.clearTimeout(timer);
    };
  }, [zipDigits]);

  const totals = useMemo(
    () => calculateOrderTotals(subtotal, shippingCost ?? 0, coupon),
    [subtotal, shippingCost, coupon],
  );

  const installmentValue = roundCurrency(totals.total / INSTALLMENTS);

  /* ------------------------------------------------------------------------
     Handlers
     ------------------------------------------------------------------------ */
  const handleZipChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setZipCode(maskZipCode(event.target.value));
  };

  const handleContinueShopping = (): void => {
    navigate(HOME_ROUTE);
  };

  const handleGoToCheckout = (): void => {
    navigate(CHECKOUT_ROUTE);
  };

  /* ------------------------------------------------------------------------
     Carrinho vazio
     ------------------------------------------------------------------------ */
  if (items.length === 0) {
    return (
      <StoreLayout>
        <div className="cart">
          <h1 className="cart__title">Meu Carrinho</h1>

          <div className="cart__empty">
            <p className="cart__empty-text">Seu carrinho está vazio.</p>
            <Button type="button" onClick={handleContinueShopping}>
              Continuar comprando
            </Button>
          </div>
        </div>
      </StoreLayout>
    );
  }

  /* ------------------------------------------------------------------------
     Render
     ------------------------------------------------------------------------ */
  const subtotalLabel = `Subtotal (${totalItems} ${totalItems === 1 ? 'item' : 'itens'})`;

  const shippingValue = isCalculatingShipping
    ? 'Calculando...'
    : shippingCost === null
      ? 'A calcular'
      : shippingCost === 0
        ? 'Grátis'
        : formatCurrency(shippingCost);

  const shippingValueClassName =
    shippingCost === 0 && !isCalculatingShipping
      ? 'cart__summary-value cart__summary-value--free'
      : shippingCost === null || isCalculatingShipping
        ? 'cart__summary-value cart__summary-value--muted'
        : 'cart__summary-value';

  return (
    <StoreLayout>
      <div className="cart">
        <h1 className="cart__title">Meu Carrinho</h1>

        <div className="cart__layout">
          {/* Lista de itens */}
          <SectionCard className="cart__list-card">
            <ul className="cart__items">
              {items.map((item) => {
                const product = products[item.productId] ?? null;
                const name = product ? product.name : `Produto #${item.productId}`;
                const maxQuantity = product
                  ? Math.max(1, Math.min(product.stock, MAX_QUANTITY_PER_ITEM))
                  : MAX_QUANTITY_PER_ITEM;
                const hasStock = product ? product.stock > 0 : true;

                return (
                  <li key={item.id} className="cart__item">
                    <span className="cart__item-thumb">
                      {product ? (
                        <img className="cart__item-image" src={product.imageUrl} alt={name} />
                      ) : null}
                    </span>

                    <div className="cart__item-info">
                      <h2 className="cart__item-name">{name}</h2>
                      <span
                        className={
                          hasStock
                            ? 'cart__item-stock'
                            : 'cart__item-stock cart__item-stock--out'
                        }
                      >
                        {hasStock ? 'Em estoque' : 'Sem estoque'}
                      </span>
                      <button
                        className="cart__item-remove"
                        type="button"
                        onClick={() => removeFromCart(item.productId)}
                      >
                        <Trash2 className="cart__item-remove-icon" />
                        Remover
                      </button>
                    </div>

                    <div className="cart__item-quantity">
                      <QuantityStepper
                        value={item.quantity}
                        min={1}
                        max={maxQuantity}
                        onChange={(quantity: number) => updateQuantity(item.productId, quantity)}
                      />
                    </div>

                    <span className="cart__item-price">
                      {formatCurrency(roundCurrency(item.unitPrice * item.quantity))}
                    </span>
                  </li>
                );
              })}
            </ul>

            <div className="cart__list-footer">
              <Button type="button" variant="outline-neutral" onClick={handleContinueShopping}>
                ← Continuar comprando
              </Button>
            </div>
          </SectionCard>

          {/* Resumo */}
          <aside className="cart__aside">
            <SectionCard title="Resumo">
              <dl className="cart__summary">
                <div className="cart__summary-row">
                  <dt className="cart__summary-label">{subtotalLabel}</dt>
                  <dd className="cart__summary-value cart__summary-value--strong">
                    {formatCurrency(totals.subtotal)}
                  </dd>
                </div>

                {totals.discountAmount > 0 ? (
                  <div className="cart__summary-row">
                    <dt className="cart__summary-label">
                      Desconto{coupon ? ` (${coupon.code})` : ''}
                    </dt>
                    <dd className="cart__summary-value cart__summary-value--discount">
                      - {formatCurrency(totals.discountAmount)}
                    </dd>
                  </div>
                ) : null}

                <div className="cart__summary-row">
                  <dt className="cart__summary-label">Frete</dt>
                  <dd className={shippingValueClassName}>{shippingValue}</dd>
                </div>
              </dl>

              <div className="cart__shipping">
                <label className="cart__shipping-label" htmlFor="cart-zip">
                  CEP de entrega
                </label>
                <input
                  className={
                    zipError
                      ? 'cart__shipping-input cart__shipping-input--invalid'
                      : 'cart__shipping-input'
                  }
                  id="cart-zip"
                  type="text"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  placeholder="CEP de entrega"
                  value={zipCode}
                  onChange={handleZipChange}
                  aria-invalid={Boolean(zipError)}
                  aria-describedby={zipError || shippingState ? 'cart-zip-hint' : undefined}
                />
                {zipError ? (
                  <span
                    className="cart__shipping-hint cart__shipping-hint--error"
                    id="cart-zip-hint"
                    role="alert"
                  >
                    {zipError}
                  </span>
                ) : shippingState ? (
                  <span className="cart__shipping-hint" id="cart-zip-hint">
                    Entrega para {shippingState}
                  </span>
                ) : null}
              </div>

              <div className="cart__total">
                <span className="cart__total-label">Total</span>
                <span className="cart__total-value">{formatCurrency(totals.total)}</span>
              </div>

              <div className="cart__checkout">
                <Button type="button" fullWidth onClick={handleGoToCheckout}>
                  Ir para checkout →
                </Button>
              </div>

              <p className="cart__installments">
                ou {INSTALLMENTS}x de {formatCurrency(installmentValue)} sem juros
              </p>
            </SectionCard>
          </aside>
        </div>
      </div>
    </StoreLayout>
  );
}

export default Cart;
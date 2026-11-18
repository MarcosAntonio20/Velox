import { Minus, Plus } from 'lucide-react';
import { classNames } from '../../../utils/helpers';
import './QuantityStepper.css';

export type QuantityStepperSize = 'md' | 'sm';

export interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  size?: QuantityStepperSize;
  /** Rótulo acessível do grupo (leitores de tela). */
  label?: string;
  className?: string;
}

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  disabled = false,
  size = 'md',
  label = 'Quantidade',
  className,
}: QuantityStepperProps) {
  const canDecrease = !disabled && value > min;
  const canIncrease = !disabled && value < max;

  const handleDecrease = (): void => {
    if (canDecrease) {
      onChange(value - 1);
    }
  };

  const handleIncrease = (): void => {
    if (canIncrease) {
      onChange(value + 1);
    }
  };

  return (
    <div
      className={classNames(
        'quantity-stepper',
        size === 'sm' && 'quantity-stepper--sm',
        disabled && 'quantity-stepper--disabled',
        className,
      )}
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        className="quantity-stepper__button"
        onClick={handleDecrease}
        disabled={!canDecrease}
        aria-label="Diminuir quantidade"
      >
        <Minus className="quantity-stepper__icon" />
      </button>
      <output className="quantity-stepper__value" aria-live="polite">
        {value}
      </output>
      <button
        type="button"
        className="quantity-stepper__button"
        onClick={handleIncrease}
        disabled={!canIncrease}
        aria-label="Aumentar quantidade"
      >
        <Plus className="quantity-stepper__icon" />
      </button>
    </div>
  );
}

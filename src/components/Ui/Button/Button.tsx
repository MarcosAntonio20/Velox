import type { LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';
import { classNames } from '../../../utils/helpers';
import './Button.css';

export type ButtonVariant =
  | 'primary'
  | 'outline-success'
  | 'outline-danger'
  | 'outline-warning'
  | 'outline-neutral';

export type ButtonSize = 'md' | 'sm';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Componente de ícone do lucide-react (ex.: `ShoppingCart`), exibido à esquerda do texto. */
  leftIcon?: LucideIcon;
  /** Componente de ícone do lucide-react, exibido à direita do texto. */
  rightIcon?: LucideIcon;
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  leftIcon: LeftIcon,
  rightIcon: RightIcon,
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={classNames(
        'btn',
        `btn--${variant}`,
        size === 'sm' && 'btn--sm',
        fullWidth && 'btn--full',
        className,
      )}
      {...rest}
    >
      {LeftIcon ? <LeftIcon className="btn__icon" aria-hidden="true" /> : null}
      {children !== undefined && children !== null ? (
        <span className="btn__label">{children}</span>
      ) : null}
      {RightIcon ? <RightIcon className="btn__icon" aria-hidden="true" /> : null}
    </button>
  );
}

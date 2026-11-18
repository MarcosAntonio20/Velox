import type { ReactNode } from 'react';
import type { OrderStatus } from '../../../types';
import { classNames } from '../../../utils/helpers';
import './StatusBadge.css';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'neutral';

/** Cor sugerida para cada status de pedido. */
export const ORDER_STATUS_TONES: Record<OrderStatus, BadgeTone> = {
  'Em processamento': 'warning',
  'Pagamento aprovado': 'success',
  Preparando: 'warning',
  Enviado: 'neutral',
  Entregue: 'success',
  Cancelado: 'danger',
};

export interface StatusBadgeProps {
  /** Cor do selo. Se omitida e `status` for informado, é derivada dele. */
  tone?: BadgeTone;
  /** Atalho para status de pedido: define cor e texto automaticamente. */
  status?: OrderStatus;
  children?: ReactNode;
  className?: string;
}

export function StatusBadge({ tone, status, children, className }: StatusBadgeProps) {
  const resolvedTone: BadgeTone = tone ?? (status ? ORDER_STATUS_TONES[status] : 'neutral');
  const content = children ?? status;

  return <span className={classNames('badge', `badge--${resolvedTone}`, className)}>{content}</span>;
}

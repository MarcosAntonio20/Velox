import type { ReactNode } from 'react';
import { classNames } from '../../../utils/helpers';
import './SectionCard.css';

export interface SectionCardProps {
  /** Título da seção, exibido com a barra vertical verde à esquerda. */
  title?: ReactNode;
  /** Slot à direita do cabeçalho (botões, filtros, links). */
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function SectionCard({ title, action, children, className }: SectionCardProps) {
  const hasHeader = Boolean(title) || Boolean(action);

  return (
    <section className={classNames('section-card', className)}>
      {hasHeader ? (
        <header className="section-card__header">
          {title ? <h2 className="section-card__title">{title}</h2> : <span />}
          {action ? <div className="section-card__action">{action}</div> : null}
        </header>
      ) : null}
      <div className="section-card__body">{children}</div>
    </section>
  );
}

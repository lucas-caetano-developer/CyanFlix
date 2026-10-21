import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../ui/Icon';

export function CatalogHeader({
  eyebrow,
  title,
  description,
  meta,
  backLink,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  meta?: ReactNode;
  backLink?: { to: string; label: string };
  actions?: ReactNode;
}) {
  return (
    <header className="catalog-header">
      <div className="catalog-header__copy">
        {backLink && (
          <Link to={backLink.to} className="catalog-header__back">
            <Icon name="chevron-left" />
            <span>{backLink.label}</span>
          </Link>
        )}
        <p className="catalog-header__eyebrow">{eyebrow}</p>
        <h1 className="catalog-header__title">{title}</h1>
        {description && <p className="catalog-header__description">{description}</p>}
        {meta && <p className="catalog-header__meta">{meta}</p>}
      </div>
      {actions && <div className="catalog-header__actions">{actions}</div>}
    </header>
  );
}

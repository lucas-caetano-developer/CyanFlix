import type { ReactNode } from 'react';
import { Icon, type IconName } from '../ui/Icon';

export function CatalogMessage({
  icon = 'info',
  title,
  description,
  actions,
  tone = 'empty',
}: {
  icon?: IconName;
  title: string;
  description?: string;
  actions?: ReactNode;
  tone?: 'empty' | 'error';
}) {
  return (
    <div className={`catalog-message catalog-message--${tone}`}>
      <div className="catalog-message__copy" role={tone === 'error' ? 'alert' : 'status'}>
        <span className="catalog-message__icon">
          <Icon name={icon} />
        </span>
        <h2 className="catalog-message__title">{title}</h2>
        {description && <p className="catalog-message__description">{description}</p>}
      </div>
      {actions && <div className="catalog-message__actions">{actions}</div>}
    </div>
  );
}

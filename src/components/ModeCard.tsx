import './ModeCard.css';

export interface ModeCardProps {
  title: string;
  description: string;
  icon: string;
  onSelect: () => void;
  variant?: 'default' | 'accent';
}

export function ModeCard({
  title,
  description,
  icon,
  onSelect,
  variant = 'default',
}: ModeCardProps) {
  return (
    <button
      type="button"
      className={`mode-card mode-card--${variant}`}
      onClick={onSelect}
      aria-label={title}
    >
      <span className="mode-card__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="mode-card__txt">
        <span className="mode-card__title">{title}</span>
        <span className="mode-card__desc">{description}</span>
      </span>
      <span className="mode-card__cta" aria-hidden="true">
        →
      </span>
    </button>
  );
}

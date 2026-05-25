import './ModeCard.css';

export interface ModeCardProps {
  title: string;
  description: string;
  icon: string;
  onSelect: () => void;
  variant?: 'default' | 'accent';
  disabled?: boolean;
}

export function ModeCard({
  title,
  description,
  icon,
  onSelect,
  variant = 'default',
  disabled = false,
}: ModeCardProps) {
  return (
    <button
      type="button"
      className={`mode-card mode-card--${variant}${disabled ? ' mode-card--disabled' : ''}`}
      onClick={onSelect}
      disabled={disabled}
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

import './MeTab.css';

export interface MeSettingsSheetProps {
  open: boolean;
  onClose: () => void;
  onSwitchUser?: () => void;
}

export function MeSettingsSheet({ open, onClose, onSwitchUser }: MeSettingsSheetProps) {
  if (!open) return null;

  return (
    <div className="me-settings-backdrop" role="presentation" onClick={onClose}>
      <div
        className="me-settings"
        role="dialog"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="me-settings__head">
          <h2 className="me-settings__title">Settings</h2>
          <button type="button" className="me-settings__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="me-settings__note">
          Demo build — anonymized DFL replay data. No real money, no signup.
        </p>
        {onSwitchUser ? (
          <button type="button" className="me-settings__btn" onClick={onSwitchUser}>
            Switch demo fan
          </button>
        ) : null}
      </div>
    </div>
  );
}

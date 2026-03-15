import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../shared/hooks/useTheme';
import { Button } from '../../shared/ui/button';
import { PageContent, PageLayout } from '../../shared/layout/PageLayout';
import './SettingsPage.css';

type Theme = 'system' | 'light' | 'dark';

const THEME_OPTIONS: { value: Theme; label: string; icon: React.ReactNode }[] =
  [
    {
      value: 'system',
      label: 'System',
      icon: (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      ),
    },
    {
      value: 'light',
      label: 'Light',
      icon: (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="m4.93 4.93 1.41 1.41" />
          <path d="m17.66 17.66 1.41 1.41" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="m6.34 17.66-1.41 1.41" />
          <path d="m19.07 4.93-1.41 1.41" />
        </svg>
      ),
    },
    {
      value: 'dark',
      label: 'Dark',
      icon: (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      ),
    },
  ];

const SettingsPage = () => {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  return (
    <PageLayout>
      <PageContent>
        <div className="settings">
          <div className="settings__header">
            <div className="settings__header-row">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => navigate('/')}
                aria-label="Back"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </Button>
              <h1 className="settings__title">Settings</h1>
            </div>
          </div>
          <div className="settings__body">
            <div className="settings__section">
              <div className="settings__item">
                <span className="settings__item-label">Application theme</span>
                <div className="settings__theme-options">
                  {THEME_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      className={`settings__theme-option${theme === option.value ? ' settings__theme-option--active' : ''}`}
                      onClick={() => setTheme(option.value)}
                      aria-label={option.label}
                      title={option.label}
                    >
                      {option.icon}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </PageContent>
    </PageLayout>
  );
};

export default SettingsPage;

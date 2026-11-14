import { useState } from 'react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ReadAloud } from '../i18n/ReadAloud';
import { t } from '../i18n/t';

export interface LanguageScreenProps {
  initialLang?: string;
  initialSimple?: boolean;
  onContinue: (config: { lang: string; simple: boolean }) => void;
}

export function LanguageScreen({
  initialLang = 'en',
  initialSimple = false,
  onContinue,
}: LanguageScreenProps) {
  const [selectedLang, setSelectedLang] = useState(initialLang);
  const [isSimple, setIsSimple] = useState(initialSimple);

  const handleContinue = () => {
    onContinue({ lang: selectedLang, simple: isSimple });
  };

  return (
    <section aria-labelledby="lang-screen-title" className="bo-language-screen" lang={selectedLang}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--bo-space-3)',
        }}
      >
        <h1 id="lang-screen-title" tabIndex={-1}>
          {t(selectedLang, 'language_screen.title')}
        </h1>
        <ReadAloud stringKey="language_screen.title" lang={selectedLang} />
      </div>

      <p className="bo-hint" style={{ margin: 'var(--bo-space-2) 0 var(--bo-space-4) 0' }}>
        {t(selectedLang, 'language_screen.hint')}
      </p>

      {/* Language choices */}
      <fieldset style={{ border: 0, padding: 0, margin: '0 0 var(--bo-space-5) 0' }}>
        <legend className="bo-visually-hidden">{t(selectedLang, 'header.language')}</legend>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-3)' }}>
          <label
            className="bo-choice bo-radio"
            style={{
              padding: 'var(--bo-space-3) var(--bo-space-4)',
              border:
                selectedLang === 'en'
                  ? '3px solid var(--bo-primary)'
                  : '2px solid var(--bo-border-strong)',
              borderRadius: 'var(--bo-radius)',
              background: selectedLang === 'en' ? 'var(--bo-selected-bg)' : 'var(--bo-surface)',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            <input
              type="radio"
              name="language"
              value="en"
              checked={selectedLang === 'en'}
              onChange={() => setSelectedLang('en')}
            />
            <span lang="en">English</span>
          </label>

          <label
            className="bo-choice bo-radio"
            style={{
              padding: 'var(--bo-space-3) var(--bo-space-4)',
              border:
                selectedLang === 'am'
                  ? '3px solid var(--bo-primary)'
                  : '2px solid var(--bo-border-strong)',
              borderRadius: 'var(--bo-radius)',
              background: selectedLang === 'am' ? 'var(--bo-selected-bg)' : 'var(--bo-surface)',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            <input
              type="radio"
              name="language"
              value="am"
              checked={selectedLang === 'am'}
              onChange={() => setSelectedLang('am')}
            />
            <span lang="am">አማርኛ</span>
          </label>
        </div>
      </fieldset>

      {/* Simple mode switch */}
      <Card style={{ margin: '0 0 var(--bo-space-5) 0', background: 'var(--bo-surface)' }}>
        <label className="bo-checkbox" style={{ cursor: 'pointer', fontWeight: 600 }}>
          <input
            type="checkbox"
            checked={isSimple}
            onChange={(e) => setIsSimple(e.target.checked)}
          />
          <span>{t(selectedLang, 'language_screen.simple_mode_label')}</span>
        </label>
      </Card>

      <p className="bo-hint" style={{ margin: '0 0 var(--bo-space-4) 0' }}>
        {t(selectedLang, 'language_screen.note')}
      </p>

      <div className="bo-actions">
        <Button variant="primary" onClick={handleContinue}>
          {t(selectedLang, 'common.continue')}
        </Button>
      </div>
    </section>
  );
}

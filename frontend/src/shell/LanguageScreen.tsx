import { useEffect, useRef, useState } from 'react';
import { useAutoRead } from '../a11y/modes';
import { keyPart } from '../a11y/readParts';
import type { Part } from '../a11y/speaker';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ListenButton } from '../i18n/ReadAloud';
import { languageName } from '../i18n/registry';
import { t } from '../i18n/t';

export interface LanguageScreenProps {
  initialLang?: string;
  initialSimple?: boolean;
  /** The languages to offer, each shown in its own script (from GET /config, else all). */
  languages: string[];
  /** Opened by the person (from the header): focus its heading. Never on first load (W3). */
  focusOnMount?: boolean;
  onContinue: (config: { lang: string; simple: boolean }) => void;
}

// The first screen whenever no language has been chosen on this device (and reachable later
// from the header). Its heading is in every offered language, each part with its own `lang`.
export function LanguageScreen({
  initialLang = 'en',
  initialSimple = false,
  languages,
  focusOnMount = false,
  onContinue,
}: LanguageScreenProps) {
  const [selectedLang, setSelectedLang] = useState(
    languages.includes(initialLang) ? initialLang : (languages[0] ?? initialLang),
  );
  const [isSimple, setIsSimple] = useState(initialSimple);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The chosen language first, then the others.
  const order = [selectedLang, ...languages.filter((l) => l !== selectedLang)];

  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus();
  }, [focusOnMount]);

  // Read aloud: the heading in each language, then each language's name in that language.
  // (Read when the screen opens; picking a language says "Selected …", not the whole screen.)
  const readParts = (): Part[] => [
    ...order.map((l) => ({ ...keyPart(l, 'language_screen.title'), lang: l })),
    ...languages.map((l) => ({ text: languageName(l), lang: l })),
  ];
  const [openedIn] = useState(selectedLang);
  useAutoRead('language-screen', readParts, openedIn);

  const handleContinue = () => {
    onContinue({ lang: selectedLang, simple: isSimple });
  };

  return (
    <section aria-labelledby="lang-screen-title" className="bo-language-screen" lang={selectedLang}>
      <h1 id="lang-screen-title" tabIndex={-1} ref={headingRef}>
        {order.map((l) => (
          <span key={l} lang={l} style={{ display: 'block' }}>
            {t(l, 'language_screen.title')}
          </span>
        ))}
      </h1>

      <p className="bo-hint" style={{ margin: 'var(--bo-space-2) 0 var(--bo-space-4) 0' }}>
        {t(selectedLang, 'language_screen.hint')}
      </p>

      {/* Language choices: each named in its own language and script */}
      <fieldset style={{ border: 0, padding: 0, margin: '0 0 var(--bo-space-5) 0' }}>
        <legend className="bo-visually-hidden">
          {order.map((l, i) => (
            <span key={l}>
              {i > 0 && <span aria-hidden="true"> / </span>}
              <span lang={l}>{t(l, 'header.language')}</span>
            </span>
          ))}
        </legend>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-3)' }}>
          {languages.map((code) => (
            <label
              key={code}
              className="bo-choice bo-radio"
              style={{
                padding: 'var(--bo-space-3) var(--bo-space-4)',
                border:
                  selectedLang === code
                    ? '3px solid var(--bo-primary)'
                    : '2px solid var(--bo-border-strong)',
                borderRadius: 'var(--bo-radius)',
                background: selectedLang === code ? 'var(--bo-selected-bg)' : 'var(--bo-surface)',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              <input
                type="radio"
                name="language"
                value={code}
                checked={selectedLang === code}
                onChange={() => setSelectedLang(code)}
              />
              <span lang={code}>{languageName(code)}</span>
            </label>
          ))}
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
        <ListenButton lang={selectedLang} parts={readParts} />
      </div>
    </section>
  );
}

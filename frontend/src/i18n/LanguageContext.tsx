import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { directionOf, t as translate } from './t';

export interface LanguageContextValue {
  lang: string;
  setLang: (lang: string) => void;
  simple: boolean;
  setSimple: (simple: boolean) => void;
  toggleSimple: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  dir: 'ltr' | 'rtl';
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export interface LanguageProviderProps {
  initialLang?: string;
  initialSimple?: boolean;
  children: ReactNode;
}

export function LanguageProvider({
  initialLang = 'en',
  initialSimple = false,
  children,
}: LanguageProviderProps) {
  const [lang, setLang] = useState<string>(initialLang);
  const [simple, setSimple] = useState<boolean>(initialSimple);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      return translate(lang, key, params);
    },
    [lang],
  );

  const toggleSimple = useCallback(() => {
    setSimple((prev) => !prev);
  }, []);

  const dir = useMemo(() => directionOf(lang), [lang]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      lang,
      setLang,
      simple,
      setSimple,
      toggleSimple,
      t,
      dir,
    }),
    [lang, simple, toggleSimple, t, dir],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return ctx;
}

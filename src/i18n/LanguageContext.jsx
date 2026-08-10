import React, { createContext, useContext, useState } from 'react';
import { TRANSLATIONS, LANGUAGES } from './translations';

const LanguageContext = createContext();

export const LanguageProvider = ({ children }) => {
  const [lang, setLangState] = useState(() => {
    const saved = localStorage.getItem('ams_lang');
    return TRANSLATIONS[saved] ? saved : 'en';
  });

  const setLang = (code) => {
    if (!TRANSLATIONS[code]) return;
    setLangState(code);
    localStorage.setItem('ams_lang', code);
  };

  // Missing keys fall back to English, then to the key itself
  const t = (key) => TRANSLATIONS[lang][key] ?? TRANSLATIONS.en[key] ?? key;

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, LANGUAGES }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLang = () => useContext(LanguageContext);

// Compact EN | ગુ toggle shown in the header and on public/login screens
export const LanguageSwitcher = ({ style }) => {
  const { lang, setLang } = useLang();
  return (
    <div style={{ display: 'inline-flex', gap: '0.25rem', ...style }}>
      {LANGUAGES.map(l => (
        <button
          key={l.code}
          onClick={() => setLang(l.code)}
          className="btn btn-ghost"
          style={{
            padding: '0.25rem 0.6rem',
            fontSize: '0.8rem',
            fontWeight: lang === l.code ? 700 : 400,
            color: lang === l.code ? 'var(--accent)' : 'var(--text-muted)',
            border: lang === l.code ? '1px solid var(--accent)' : '1px solid var(--border-color)',
            borderRadius: 'var(--radius-sm)'
          }}
          title={l.code === 'en' ? 'English' : 'ગુજરાતી'}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
};

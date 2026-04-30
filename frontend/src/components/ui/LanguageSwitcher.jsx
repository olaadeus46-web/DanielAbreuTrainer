import { useTranslation } from 'react-i18next';

const LANGUAGES = [
  { code: 'en', label: 'EN', flag: '🇬🇧' },
  { code: 'pt', label: 'PT', flag: '🇵🇹' },
  { code: 'de', label: 'DE', flag: '🇩🇪' },
];

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const handleChange = (code) => {
    i18n.changeLanguage(code);
    localStorage.setItem('fc_lang', code);
    document.documentElement.lang = code;
  };

  return (
    <div style={{ display: 'flex', gap: 4, padding: '0 4px' }}>
      {LANGUAGES.map(({ code, label, flag }) => {
        const active = i18n.language === code;
        return (
          <button
            key={code}
            onClick={() => handleChange(code)}
            title={flag}
            style={{
              flex: 1,
              padding: '5px 0',
              border: active ? '1.5px solid rgba(159,189,217,0.6)' : '1.5px solid rgba(255,255,255,0.2)',
              borderRadius: 6,
              background: active ? 'linear-gradient(135deg, rgba(86,130,177,0.5) 0%, rgba(115,158,201,0.45) 100%)' : 'rgba(255,255,255,0.06)',
              color: active ? '#FFFFFF' : '#C8DBED',
              fontSize: 11,
              fontWeight: active ? 700 : 500,
              cursor: 'pointer',
              letterSpacing: '0.04em',
              transition: 'all .15s',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

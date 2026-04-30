import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authApi } from '../services/api';
import { useTranslation } from 'react-i18next';
import useMediaQuery from '../hooks/useMediaQuery';
import logoHeader from '../assets/daniel-abreu-logo.svg';

export default function RegisterPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isMobile = useMediaQuery('(max-width: 640px)');
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await authApi.register(form);
      localStorage.setItem('fc_token', res.data.token);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || t('register.error'));
    } finally { setLoading(false); }
  };

  const fields = [
    { label: t('register.fullName'), type: 'text', key: 'name', placeholder: t('register.namePlaceholder') },
    { label: t('register.email'), type: 'email', key: 'email', placeholder: t('register.emailPlaceholder') },
    { label: t('register.password'), type: 'password', key: 'password', placeholder: '••••••••' },
    { label: t('register.phone'), type: 'tel', key: 'phone', placeholder: t('register.phonePlaceholder'), required: false },
  ];

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #000000 0%, #2C4F73 48%, #5682B1 100%)',
      padding: isMobile ? 12 : 24,
    }}>
      <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: '-20%', right: '-10%', width: isMobile ? 360 : 600, height: isMobile ? 360 : 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(159,189,217,0.22) 0%, transparent 70%)' }} />
        <div style={{ position: 'absolute', bottom: '-20%', left: '-10%', width: isMobile ? 320 : 500, height: isMobile ? 320 : 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(115,158,201,0.2) 0%, transparent 70%)' }} />
      </div>

      <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1 }}>
        <div style={{ background: 'linear-gradient(180deg, #FFFFFF 0%, #F7FBFF 100%)', borderRadius: 20, padding: isMobile ? '28px 18px' : '44px 40px', border: '1px solid rgba(159,189,217,0.7)', boxShadow: '0 30px 60px rgba(0,0,0,0.32), 0 10px 18px rgba(44,79,115,0.2)' }}>
          <div style={{ marginBottom: 28 }}>
            <img
              src={logoHeader}
              alt="Daniel Abreu Personal Trainer"
              style={{ width: isMobile ? 150 : 190, height: 'auto', display: 'block', marginBottom: 10 }}
            />
            <p style={{ fontSize: 14, color: '#5682B1', lineHeight: 1.5 }}>{t('register.subtitle')}</p>
          </div>

          {error && (
            <div style={{ background: '#FFFFFF', color: '#5682B1', padding: '11px 14px', borderRadius: 8, fontSize: 13, marginBottom: 20, border: '1px solid #739EC9' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {fields.map(({ label, type, key, placeholder, required = true }) => (
              <div key={key} style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#000000', marginBottom: 7, letterSpacing: '0.07em' }}>
                  {label}
                </label>
                <input
                  type={type} placeholder={placeholder} required={required}
                  value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })}
                />
              </div>
            ))}
            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '12px', marginTop: 10,
              background: loading ? '#739EC9' : 'linear-gradient(135deg, #2C4F73 0%, #5682B1 52%, #739EC9 100%)',
              color: '#FFFFFF', border: 'none', borderRadius: 10,
              fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: loading ? 'none' : '0 10px 22px rgba(44,79,115,0.35)',
              transition: 'all .2s',
            }}>
              {loading ? t('register.creating') : t('register.createAccount')}
            </button>
          </form>

          <div style={{ marginTop: 24, textAlign: 'center', fontSize: 13, color: '#739EC9' }}>
            {t('register.alreadyHaveAccount')}{' '}
            <Link to="/login" style={{ color: '#5682B1', fontWeight: 600 }}>{t('register.signIn')}</Link>
          </div>
        </div>
      </div>
    </div>
  );
}


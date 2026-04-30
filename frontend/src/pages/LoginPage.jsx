import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import useMediaQuery from '../hooks/useMediaQuery';
import logoHeader from '../assets/daniel-abreu-header-black.svg';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isMobile = useMediaQuery('(max-width: 640px)');
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await login(form.email, form.password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || t('login.invalidCredentials'));
    } finally { setLoading(false); }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #000000 0%, #10253C 45%, #2C4F73 100%)',
      padding: isMobile ? 12 : 28,
    }}>
      <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: '-20%', left: '-10%', width: isMobile ? 360 : 600, height: isMobile ? 360 : 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(159,189,217,0.22) 0%, transparent 70%)' }} />
        <div style={{ position: 'absolute', bottom: '-20%', right: '-10%', width: isMobile ? 320 : 500, height: isMobile ? 320 : 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(115,158,201,0.2) 0%, transparent 70%)' }} />
      </div>

      <div style={{ width: '100%', maxWidth: 520, position: 'relative', zIndex: 1 }}>
        <div style={{
          background: 'linear-gradient(180deg, #FFFFFF 0%, #F7FBFF 100%)',
          borderRadius: 22,
          padding: isMobile ? '28px 18px' : '44px 40px',
          border: '1px solid rgba(159,189,217,0.7)',
          boxShadow: '0 34px 70px rgba(0,0,0,0.36), 0 10px 20px rgba(44,79,115,0.24)',
        }}>
          <div style={{ marginBottom: 30 }}>
            <img
              src={logoHeader}
              alt="Daniel Abreu Personal Trainer"
              style={{ width: isMobile ? '88%' : '82%', maxWidth: 340, height: 'auto', display: 'block', margin: '0 auto 12px' }}
            />
            <p style={{ fontSize: 14, color: '#5682B1', lineHeight: 1.5 }}>{t('login.subtitle')}</p>
          </div>

          {error && (
            <div style={{ background: '#FFFFFF', color: '#5682B1', padding: '11px 14px', borderRadius: 8, fontSize: 13, marginBottom: 20, border: '1px solid #739EC9' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#000000', marginBottom: 7, letterSpacing: '0.07em' }}>
                {t('login.email')}
              </label>
              <input
                type="email" value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder={t('login.emailPlaceholder')} required
              />
            </div>
            <div style={{ marginBottom: 28 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#000000', marginBottom: 7, letterSpacing: '0.07em' }}>
                {t('login.password')}
              </label>
              <input
                type="password" value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••" required
              />
            </div>
            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '12px 14px',
              background: loading ? '#739EC9' : 'linear-gradient(135deg, #2C4F73 0%, #5682B1 52%, #739EC9 100%)',
              color: '#FFFFFF', border: 'none', borderRadius: 10,
              fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: loading ? 'none' : '0 10px 22px rgba(44,79,115,0.35)',
              transition: 'all .2s',
            }}>
              {loading ? t('login.signingIn') : t('login.signIn')}
            </button>
          </form>

          <div style={{ marginTop: 24, textAlign: 'center', fontSize: 13, color: '#739EC9' }}>
            {t('login.noAccount')}{' '}
            <Link to="/register" style={{ color: '#5682B1', fontWeight: 600 }}>{t('login.createTrainerAccount')}</Link>
          </div>
        </div>
      </div>
    </div>
  );
}


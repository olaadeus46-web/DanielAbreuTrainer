import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './LanguageSwitcher';
import useMediaQuery from '../../hooks/useMediaQuery';
import logoHeader from '../../assets/daniel-abreu-logo.svg';
import logoHeaderBlack from '../../assets/daniel-abreu-logo-black.svg';
import profileImage from '../../assets/daniel-abreu.png';

const DashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
  </svg>
);

const ClientsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

const FinanceIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
  </svg>
);

const MetricsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="16" rx="2"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
    <line x1="9" y1="10" x2="9" y2="20"/>
    <line x1="15" y1="10" x2="15" y2="20"/>
  </svg>
);

const AutomationsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
  </svg>
);

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isMobile = useMediaQuery('(max-width: 900px)');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!isMobile) setMenuOpen(false);
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile || !menuOpen) {
      document.body.style.overflow = '';
      return;
    }

    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [isMobile, menuOpen]);

  const handleLogout = () => {
    logout();
    setMenuOpen(false);
    navigate('/login');
  };

  const navItems = [
    { to: '/', label: t('nav.dashboard'), icon: <DashIcon />, end: true },
    ...(user?.role === 'TRAINER' ? [
      { to: '/clients', label: t('nav.clients'), icon: <ClientsIcon /> },
      { to: '/finance', label: t('nav.finance'), icon: <FinanceIcon /> },
      { to: '/automations', label: t('nav.automations'), icon: <AutomationsIcon /> },
    ] : []),
    ...(user?.role === 'CLIENT' ? [
      { to: '/my-metrics', label: t('nav.metrics'), icon: <MetricsIcon /> },
    ] : []),
  ];

  return (
    <div style={{ display: isMobile ? 'block' : 'grid', gridTemplateColumns: isMobile ? undefined : '240px 1fr', minHeight: '100vh' }}>
      <aside style={{
        background: 'linear-gradient(180deg, #000000 0%, #10253C 62%, #2C4F73 100%)',
        display: 'flex', flexDirection: 'column',
        position: isMobile ? 'fixed' : 'sticky',
        top: 0,
        left: 0,
        height: isMobile ? '100dvh' : '100vh',
        width: isMobile ? 260 : 'auto',
        transform: isMobile ? (menuOpen ? 'translateX(0)' : 'translateX(-105%)') : 'none',
        transition: 'transform .2s ease',
        zIndex: 40,
      }}>
        {/* Logo */}
        <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid rgba(255,255,255,0.14)' }}>
          <img
            src={logoHeader}
            alt="Daniel Abreu Personal Trainer"
            style={{ width: '100%', height: 'auto', maxWidth: 180, display: 'block' }}
          />
          <div style={{ fontSize: 10, color: '#9FBDD9', marginTop: 4, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>
            {t('nav.platform')}
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '16px 12px', overflowY: 'auto' }}>
          {navItems.map(({ to, label, icon, end }) => (
            <NavLink key={to} to={to} end={end} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 8, marginBottom: 2,
              fontSize: 13.5, fontWeight: isActive ? 600 : 400,
              color: isActive ? '#FFFFFF' : '#C8DBED',
              background: isActive ? 'linear-gradient(135deg, rgba(86,130,177,0.45) 0%, rgba(115,158,201,0.18) 100%)' : 'transparent',
              borderLeft: isActive ? '3px solid #5682B1' : '3px solid transparent',
              transition: 'all .15s',
              textDecoration: 'none',
            })}
            onClick={() => isMobile && setMenuOpen(false)}>
              {icon}
              {label}
            </NavLink>
          ))}
        </nav>
        {/* User */}
        <div style={{ borderBottom: '1px solid rgba(255,255,255,0.14)', display: 'flex', justifyContent: 'center' }}>
          <img
            src={profileImage}
            alt="Profile"
            style={{ width: isMobile ? '78px' : '120px', height: 'auto', display: 'block' }}
          />
        </div>
        <div style={{ padding: '16px 16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{
                width: 34, height: 34, borderRadius: '50%',
                background: 'linear-gradient(135deg, #5682B1, #739EC9)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, color: '#FFFFFF', flexShrink: 0,
              }}>
                {getInitials(user?.name)}
              </div>
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user?.name}
                </div>
                <div style={{ fontSize: 11, color: '#5682B1', marginTop: 1 }}>
                  {user?.role === 'TRAINER' ? t('nav.personalTrainer') : t('nav.client')}
                </div>
              </div>
            </div>
            <button onClick={handleLogout} style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '8px 12px', borderRadius: 7,
              background: 'linear-gradient(135deg, rgba(115,158,201,0.14) 0%, rgba(86,130,177,0.2) 100%)', border: '1px solid rgba(159,189,217,0.36)',
              color: '#FFFFFF', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', transition: 'all .15s',
            }}>
              {t('nav.signOut')}
            </button>
            <div style={{ marginTop: 10 }}>
              <LanguageSwitcher />
            </div>
          </div>
      </aside>

      {isMobile && menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            zIndex: 30,
          }}
        />
      )}

      <main style={{ overflow: 'auto', background: 'linear-gradient(180deg, #FFFFFF 0%, #EDF5FC 50%, #FFFFFF 100%)', minHeight: '100vh' }}>
        {isMobile && (
          <div style={{
            position: 'sticky', top: 0, zIndex: 20,
            background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)',
            borderBottom: '1px solid #9FBDD9',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px',
          }}>
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                border: '1px solid #9FBDD9',
                background: 'linear-gradient(180deg, #FFFFFF 0%, #F7FBFF 100%)',
                color: '#000000',
                fontSize: 18,
                fontWeight: 700,
              }}
            >
              ≡
            </button>
            <img
              src={logoHeaderBlack}
              alt="Daniel Abreu Personal Trainer"
              style={{ width: 110, height: 'auto', display: 'block' }}
            />
            <div style={{ width: 38 }} />
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}


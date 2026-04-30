import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import useMediaQuery from '../hooks/useMediaQuery';
import MetricSheet from '../components/metrics/MetricSheet';

export default function MyMetricsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isMobile = useMediaQuery('(max-width: 760px)');

  if (!user?.clientId) {
    return (
      <div style={{ padding: isMobile ? '16px 14px 20px' : '28px 32px', color: '#739EC9', fontSize: 13 }}>
        {t('myMetrics.noClientLinked')}
      </div>
    );
  }

  return (
    <div style={{ padding: isMobile ? '14px 12px 20px' : '28px 32px' }}>
      <div
        style={{
          marginBottom: 14,
          borderRadius: isMobile ? 16 : 20,
          padding: isMobile ? '12px 12px 10px' : '16px 18px 14px',
          border: '1px solid rgba(115,158,201,0.35)',
          background: 'linear-gradient(150deg, rgba(255,255,255,0.98) 0%, rgba(236,245,252,0.94) 100%)',
          boxShadow: '0 12px 30px rgba(44,79,115,0.1), 0 2px 8px rgba(0,0,0,0.05)',
        }}
      >
        <h1 style={{ fontSize: isMobile ? 21 : 24, fontWeight: 800, color: '#0F2438', letterSpacing: '-0.5px' }}>
          {t('myMetrics.title')}
        </h1>
        <p style={{ fontSize: isMobile ? 13 : 14, color: '#5682B1', marginTop: 5, lineHeight: 1.45 }}>{t('myMetrics.subtitle')}</p>
      </div>
      <MetricSheet clientId={user.clientId} />
    </div>
  );
}

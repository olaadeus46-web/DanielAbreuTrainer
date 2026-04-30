import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { clientsApi, financeApi } from '../services/api';
import useMediaQuery from '../hooks/useMediaQuery';
import BrandLoadingScreen from '../components/ui/BrandLoadingScreen';

const card = {
  background: '#FFFFFF',
  borderRadius: 20,
  padding: '20px 24px',
  boxShadow: '0 18px 40px rgba(16,37,60,0.08)',
  border: '1px solid rgba(159,189,217,0.24)',
};

const statusTheme = {
  PAID: { bg: '#EAF8EF', color: '#2D7A47' },
  PENDING: { bg: '#FFF4E8', color: '#B66A17' },
  OVERDUE: { bg: '#FDECEC', color: '#C53131' },
};

const metricAccent = ['#10253C', '#5682B1', '#B66A17', '#2D7A47'];

function Avatar({ name, size = 40 }) {
  const initials = name?.split(' ').slice(0, 2).map((chunk) => chunk[0]).join('').toUpperCase() || '?';
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #10253C 0%, #5682B1 100%)',
        color: '#FFFFFF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.34,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

function PayBadge({ status, compact = false }) {
  const { t } = useTranslation();
  const theme = statusTheme[status] || statusTheme.PENDING;
  const labelMap = {
    PAID: t('common.payment.paid'),
    PENDING: t('common.payment.pending'),
    OVERDUE: t('common.payment.overdue'),
  };

  return (
    <span
      style={{
        fontSize: compact ? 10 : 11,
        padding: compact ? '4px 8px' : '5px 10px',
        borderRadius: 999,
        fontWeight: 700,
        background: theme.bg,
        color: theme.color,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
      }}
    >
      {labelMap[status] || labelMap.PENDING}
    </span>
  );
}

function MetricCard({ eyebrow, value, detail, accent }) {
  return (
    <div style={{ ...card, padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          inset: '0 auto auto 0',
          width: 6,
          height: '100%',
          background: accent,
        }}
      />
      <div style={{ marginLeft: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#6B86A3', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {eyebrow}
        </div>
        <div style={{ fontSize: 28, fontWeight: 800, color: '#10253C', marginTop: 8, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 12, color: '#6B86A3', marginTop: 6 }}>{detail}</div>
      </div>
    </div>
  );
}

function formatCurrency(value) {
  return `CHF ${Number(value || 0).toFixed(0)}`;
}

function getFocusMessage({ t, overdueCount, unpaidCount, pendingAmount, collectionRate }) {
  if (overdueCount > 0) {
    return t('dashboard.focusOverdue', { count: overdueCount });
  }
  if (unpaidCount > 0) {
    return t('dashboard.focusPending', { count: unpaidCount, amount: formatCurrency(pendingAmount) });
  }
  if (collectionRate >= 100) {
    return t('dashboard.focusHealthy');
  }
  return t('dashboard.focusStable', { pct: Math.round(collectionRate) });
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const isMobile = useMediaQuery('(max-width: 760px)');
  const isTablet = useMediaQuery('(max-width: 1100px)');
  const [clients, setClients] = useState([]);
  const [finance, setFinance] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.role !== 'TRAINER') {
      setLoading(false);
      return;
    }

    Promise.all([clientsApi.list(), financeApi.overview(), financeApi.stats()])
      .then(([clientsResponse, financeResponse, statsResponse]) => {
        setClients(clientsResponse.data);
        setFinance(financeResponse.data);
        setStats(statsResponse.data);
      })
      .finally(() => setLoading(false));
  }, [user]);

  const locale = { en: 'en-US', pt: 'pt-PT', de: 'de-DE' }[i18n.language] || 'en-US';

  const dashboardData = useMemo(() => {
    if (!finance) return null;

    const paymentRows = finance.clients || [];
    const paidCount = paymentRows.filter((client) => client.paymentStatus === 'PAID').length;
    const overdueCount = paymentRows.filter((client) => client.paymentStatus === 'OVERDUE').length;
    const unpaidClients = paymentRows.filter((client) => client.paymentStatus !== 'PAID');
    const unpaidCount = unpaidClients.length;
    const collectionRate = finance.totalExpected > 0 ? (finance.totalReceived / finance.totalExpected) * 100 : 0;
    const averageTicket = finance.totalClients > 0 ? finance.totalExpected / finance.totalClients : 0;
    const packageCoverage = finance.totalClients > 0
      ? ((stats?.totals?.clientsWithPackage || 0) / finance.totalClients) * 100
      : 0;
    const trend = (stats?.monthlySeries || []).map((item) => ({
      ...item,
      label: new Date(item.year, item.month - 1, 1).toLocaleDateString(locale, { month: 'short' }),
    }));

    return {
      paidCount,
      overdueCount,
      unpaidClients,
      unpaidCount,
      collectionRate,
      averageTicket,
      packageCoverage,
      trend,
    };
  }, [finance, stats, locale]);

  if (loading) return <BrandLoadingScreen />;

  if (user?.role === 'CLIENT') {
    return (
      <div style={{ padding: isMobile ? '16px 14px 20px' : '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ ...card, textAlign: 'center', padding: isMobile ? '32px 20px' : '60px 40px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏋️</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#000000', marginBottom: 8 }}>{t('dashboard.welcomeClient')}</h2>
          <p style={{ color: '#739EC9', fontSize: 14, marginBottom: 14 }}>{t('dashboard.trainerSetup')}</p>
          <Link
            to="/my-metrics"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 10,
              padding: '9px 14px',
              background: '#739EC9',
              color: '#FFFFFF',
              fontSize: 13,
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            {t('dashboard.openMetricsSheet')}
          </Link>
        </div>
      </div>
    );
  }

  if (!finance || !dashboardData) return null;

  const now = new Date();
  const monthLabel = now.toLocaleDateString(locale, { month: 'long' });
  const focusMessage = getFocusMessage({
    t,
    overdueCount: dashboardData.overdueCount,
    unpaidCount: dashboardData.unpaidCount,
    pendingAmount: finance.totalPending,
    collectionRate: dashboardData.collectionRate,
  });
  const attentionClients = dashboardData.unpaidClients.length > 0
    ? dashboardData.unpaidClients
    : (finance.clients || []).slice(0, 5);
  const portfolioClients = [...clients]
    .sort((left, right) => {
      const leftStatus = left.payments?.[0]?.status === 'PAID' ? 1 : 0;
      const rightStatus = right.payments?.[0]?.status === 'PAID' ? 1 : 0;
      if (leftStatus !== rightStatus) return leftStatus - rightStatus;
      return Number(right.monthlyPrice || 0) - Number(left.monthlyPrice || 0);
    })
    .slice(0, 6);

  return (
    <div style={{ padding: isMobile ? '16px 14px 20px' : '28px 32px', maxWidth: 1340, margin: '0 auto' }}>
      <section
        style={{
          background: 'linear-gradient(135deg, #10253C 0%, #1D3C5A 52%, #5682B1 100%)',
          borderRadius: 28,
          padding: isMobile ? '22px 18px' : '28px 30px',
          color: '#FFFFFF',
          boxShadow: '0 24px 50px rgba(16,37,60,0.24)',
          marginBottom: 18,
        }}
      >
        <div style={{ display: 'flex', flexDirection: isTablet ? 'column' : 'row', justifyContent: 'space-between', gap: 18 }}>
          <div style={{ maxWidth: 720 }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#C8DBED', marginBottom: 12 }}>
              {monthLabel} {now.getFullYear()} · {t('dashboard.businessSummary')}
            </div>
            <h1 style={{ fontSize: isMobile ? 24 : 34, lineHeight: 1.05, fontWeight: 800, margin: 0 }}>
              {t('dashboard.greeting', { name: user?.name?.split(' ')[0] })}
            </h1>
            <p style={{ fontSize: isMobile ? 14 : 16, lineHeight: 1.6, color: '#E4EFF9', maxWidth: 640, margin: '14px 0 0' }}>
              {focusMessage}
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(180px, 1fr))', gap: 10, minWidth: isTablet ? 'auto' : 380 }}>
            <Link
              to="/clients"
              style={{
                textDecoration: 'none',
                color: '#FFFFFF',
                padding: '14px 16px',
                borderRadius: 18,
                background: 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.16)',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#C8DBED' }}>
                {t('dashboard.quickActions')}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 8 }}>{t('dashboard.reviewClients')}</div>
            </Link>
            <Link
              to="/finance"
              style={{
                textDecoration: 'none',
                color: '#FFFFFF',
                padding: '14px 16px',
                borderRadius: 18,
                background: 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.16)',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#C8DBED' }}>
                {t('dashboard.quickActions')}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 8 }}>{t('dashboard.openFinance')}</div>
            </Link>
            <Link
              to="/automations"
              style={{
                textDecoration: 'none',
                color: '#FFFFFF',
                padding: '14px 16px',
                borderRadius: 18,
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.16)',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#C8DBED' }}>
                {t('dashboard.operations')}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 8 }}>{t('dashboard.openAutomations')}</div>
            </Link>
            <Link
              to="/clients"
              style={{
                textDecoration: 'none',
                color: '#10253C',
                padding: '14px 16px',
                borderRadius: 18,
                background: '#FFFFFF',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6B86A3' }}>
                {t('dashboard.quickActions')}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 8 }}>{t('dashboard.newClient')}</div>
            </Link>
          </div>
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 14, marginBottom: 18 }}>
        <MetricCard
          eyebrow={t('dashboard.activeClients')}
          value={finance.totalClients}
          detail={t('dashboard.metricDetailClients')}
          accent={metricAccent[0]}
        />
        <MetricCard
          eyebrow={t('dashboard.collectionRate')}
          value={`${Math.round(dashboardData.collectionRate)}%`}
          detail={t('dashboard.metricDetailCollection', { received: formatCurrency(finance.totalReceived) })}
          accent={metricAccent[1]}
        />
        <MetricCard
          eyebrow={t('dashboard.unpaidClients')}
          value={dashboardData.unpaidCount}
          detail={t('dashboard.metricDetailUnpaid', { amount: formatCurrency(finance.totalPending) })}
          accent={metricAccent[2]}
        />
        <MetricCard
          eyebrow={t('dashboard.avgTicket')}
          value={formatCurrency(dashboardData.averageTicket)}
          detail={t('dashboard.metricDetailTicket')}
          accent={metricAccent[3]}
        />
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : '1.25fr 0.95fr', gap: 16, marginBottom: 18 }}>
        <div style={{ ...card, padding: isMobile ? '18px 16px' : '22px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: 8, marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#10253C' }}>{t('dashboard.paymentFollowUp')}</div>
              <div style={{ fontSize: 13, color: '#6B86A3', marginTop: 4 }}>{t('dashboard.paymentFollowUpDescription', { month: monthLabel })}</div>
            </div>
            <Link to="/finance" style={{ fontSize: 12, fontWeight: 700, color: '#5682B1', textDecoration: 'none' }}>{t('dashboard.viewAll')}</Link>
          </div>

          {attentionClients.length > 0 ? attentionClients.map((client, index) => (
            <div
              key={client.clientId}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '13px 0',
                borderTop: index === 0 ? '1px solid rgba(159,189,217,0.24)' : 'none',
                borderBottom: '1px solid rgba(159,189,217,0.24)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <Avatar name={client.clientName} size={42} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#10253C', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {client.clientName}
                  </div>
                  <div style={{ fontSize: 12, color: '#6B86A3', marginTop: 2 }}>{formatCurrency(client.monthlyPrice)}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <PayBadge status={client.paymentStatus} />
                <Link to="/finance" style={{ fontSize: 12, fontWeight: 700, color: '#5682B1', textDecoration: 'none' }}>{t('dashboard.openFinance')}</Link>
              </div>
            </div>
          )) : (
            <div style={{ padding: '20px 0 6px', fontSize: 14, color: '#6B86A3' }}>{t('dashboard.allSettled')}</div>
          )}
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ ...card, padding: isMobile ? '18px 16px' : '22px 24px' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#10253C', marginBottom: 18 }}>{t('dashboard.portfolioMix')}</div>
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 13 }}>
                <span style={{ color: '#6B86A3' }}>{t('dashboard.received')}</span>
                <strong style={{ color: '#10253C' }}>{formatCurrency(finance.totalReceived)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 13 }}>
                <span style={{ color: '#6B86A3' }}>{t('dashboard.pending')}</span>
                <strong style={{ color: '#10253C' }}>{formatCurrency(finance.totalPending)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 13 }}>
                <span style={{ color: '#6B86A3' }}>{t('dashboard.paidClients')}</span>
                <strong style={{ color: '#10253C' }}>{dashboardData.paidCount}/{finance.totalClients}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 13 }}>
                <span style={{ color: '#6B86A3' }}>{t('dashboard.clientsOnPackages')}</span>
                <strong style={{ color: '#10253C' }}>{Math.round(dashboardData.packageCoverage)}%</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 13 }}>
                <span style={{ color: '#6B86A3' }}>{t('dashboard.avgCollectionLastMonths')}</span>
                <strong style={{ color: '#10253C' }}>{Math.round(stats?.totals?.averageCollectionRate || 0)}%</strong>
              </div>
            </div>
          </div>

          <div style={{ ...card, padding: isMobile ? '18px 16px' : '22px 24px' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#10253C', marginBottom: 18 }}>{t('dashboard.priorityList')}</div>
            {portfolioClients.length > 0 ? portfolioClients.map((client, index) => (
              <Link
                key={client.id}
                to={`/clients/${client.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '11px 0',
                  textDecoration: 'none',
                  borderTop: index === 0 ? '1px solid rgba(159,189,217,0.24)' : 'none',
                  borderBottom: '1px solid rgba(159,189,217,0.24)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <Avatar name={client.name} size={38} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#10253C', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{client.name}</div>
                    <div style={{ fontSize: 12, color: '#6B86A3', marginTop: 2 }}>{t('dashboard.perWeekMonth', { freq: client.trainingFrequency, price: client.monthlyPrice })}</div>
                  </div>
                </div>
                <PayBadge status={client.payments?.[0]?.status || 'PENDING'} compact />
              </Link>
            )) : (
              <div style={{ fontSize: 14, color: '#6B86A3' }}>{t('dashboard.noClients')}</div>
            )}
          </div>
        </div>
      </section>

      <section style={{ ...card, padding: isMobile ? '18px 16px' : '22px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: 8, marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#10253C' }}>{t('dashboard.lastMonthsRevenue')}</div>
            <div style={{ fontSize: 13, color: '#6B86A3', marginTop: 4 }}>{t('dashboard.lastMonthsRevenueDescription')}</div>
          </div>
          <div style={{ fontSize: 12, color: '#6B86A3' }}>{t('dashboard.billing', { month: monthLabel })}</div>
        </div>

        <div style={{ height: isMobile ? 250 : 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dashboardData.trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(159,189,217,0.24)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#6B86A3', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6B86A3', fontSize: 12 }} axisLine={false} tickLine={false} width={80} />
              <Tooltip
                formatter={(value) => formatCurrency(value)}
                contentStyle={{ borderRadius: 14, border: '1px solid rgba(159,189,217,0.24)', boxShadow: '0 14px 28px rgba(16,37,60,0.12)' }}
              />
              <Line type="monotone" dataKey="received" stroke="#10253C" strokeWidth={3} dot={false} name={t('dashboard.received')} />
              <Line type="monotone" dataKey="pending" stroke="#B66A17" strokeWidth={3} dot={false} name={t('dashboard.pending')} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
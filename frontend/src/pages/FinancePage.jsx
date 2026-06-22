import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { financeApi, packagesApi } from '../services/api';
import { useTranslation } from 'react-i18next';
import useMediaQuery from '../hooks/useMediaQuery';
import BrandLoadingScreen from '../components/ui/BrandLoadingScreen';
import { useAppFeedback } from '../components/ui/FeedbackProvider';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const card = {
  background: '#FFFFFF',
  borderRadius: 20,
  padding: '20px 24px',
  boxShadow: '0 18px 40px rgba(16,37,60,0.08)',
  border: '1px solid rgba(159,189,217,0.24)',
};

const labelStyle = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  color: '#10253C',
  marginBottom: 7,
  letterSpacing: '0.07em',
};

const emptyPackageForm = {
  name: '',
  description: '',
  monthlyPrice: '',
  sessionsPerWeek: '',
  sessionsPerMonth: '',
  hasOnlineSupport: true,
};

const emptyExpenseForm = {
  title: '',
  description: '',
  amount: '',
  category: '',
  paymentMethod: '',
  type: 'FIXED',
  expenseDate: new Date().toISOString().slice(0, 10),
};

const statusColors = {
  PAID: '#2D7A47',
  PENDING: '#B66A17',
  OVERDUE: '#C53131',
};

function formatCurrency(value) {
  return `CHF ${Number(value || 0).toFixed(0)}`;
}

function PayBadge({ status }) {
  const { t } = useTranslation();
  const map = {
    PAID: ['#EAF8EF', '#2D7A47', t('finance.paid')],
    OVERDUE: ['#FDECEC', '#C53131', t('finance.overdue')],
    PENDING: ['#FFF4E8', '#B66A17', t('finance.pending')],
  };
  const [bg, color, label] = map[status] || map.PENDING;
  return (
    <span
      style={{
        fontSize: 11,
        padding: '5px 11px',
        borderRadius: 999,
        fontWeight: 700,
        background: bg,
        color,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

function KpiCard({ title, value, detail, accent }) {
  return (
    <div style={{ ...card, padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 6, height: '100%', background: accent }} />
      <div style={{ marginLeft: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#6B86A3', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{title}</div>
        <div style={{ fontSize: 28, lineHeight: 1.12, fontWeight: 800, color: '#10253C', marginTop: 8 }}>{value}</div>
        <div style={{ fontSize: 12, color: '#6B86A3', marginTop: 6 }}>{detail}</div>
      </div>
    </div>
  );
}

function getFinanceFocus({ t, overdueCount, unpaidCount, pendingAmount, collectionRate }) {
  if (overdueCount > 0) return t('finance.focusOverdue', { count: overdueCount });
  if (unpaidCount > 0) return t('finance.focusPending', { count: unpaidCount, amount: formatCurrency(pendingAmount) });
  if (collectionRate >= 100) return t('finance.focusHealthy');
  return t('finance.focusStable', { pct: Math.round(collectionRate) });
}

export default function FinancePage() {
  const { t, i18n } = useTranslation();
  const { confirm, showError } = useAppFeedback();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useMediaQuery('(max-width: 760px)');
  const isTablet = useMediaQuery('(max-width: 1100px)');
  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') || 'status');
  const [data, setData] = useState(null);
  const [stats, setStats] = useState(null);
  const [expensesData, setExpensesData] = useState({ items: [], totals: { count: 0, amount: 0, byType: {} } });
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);
  const [showPackageModal, setShowPackageModal] = useState(false);
  const [editingPackage, setEditingPackage] = useState(null);
  const [packageForm, setPackageForm] = useState(emptyPackageForm);
  const [savingPackage, setSavingPackage] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [expenseForm, setExpenseForm] = useState(emptyExpenseForm);
  const [expenseFile, setExpenseFile] = useState(null);
  const [savingExpense, setSavingExpense] = useState(false);
  const [statsYearFilter, setStatsYearFilter] = useState('ALL');
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth() + 1);
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [showExpectedModal, setShowExpectedModal] = useState(false);
  const [editingExpectedClient, setEditingExpectedClient] = useState(null);
  const [expectedAmountInput, setExpectedAmountInput] = useState('');
  const [savingExpected, setSavingExpected] = useState(false);

  const isCurrentMonth = viewMonth === new Date().getMonth() + 1 && viewYear === new Date().getFullYear();

  const goToPrevMonth = () => {
    setViewMonth((m) => {
      if (m === 1) {
        setViewYear((y) => y - 1);
        return 12;
      }
      return m - 1;
    });
  };

  const goToNextMonth = () => {
    if (isCurrentMonth) return;
    setViewMonth((m) => {
      if (m === 12) {
        setViewYear((y) => y + 1);
        return 1;
      }
      return m + 1;
    });
  };

  useEffect(() => {
    const tabFromUrl = searchParams.get('tab');
    if (tabFromUrl && ['status', 'packages', 'expenses', 'stats'].includes(tabFromUrl)) {
      setActiveTab(tabFromUrl);
    }
  }, [searchParams]);

  const loadFinance = async () => {
    const results = await Promise.allSettled([
      financeApi.overview({ month: viewMonth, year: viewYear }),
      financeApi.stats(),
    ]);
    if (results[0].status === 'fulfilled') setData(results[0].value.data);
    if (results[1].status === 'fulfilled') setStats(results[1].value.data);
  };

  const loadPackages = async () => {
    const response = await packagesApi.list();
    setPackages(response.data);
  };

  const loadExpenses = async () => {
    const response = await financeApi.listExpenses();
    setExpensesData(response.data || { items: [], totals: { count: 0, amount: 0, byType: {} } });
  };

  const load = async () => {
    setLoading(true);
    try {
      await Promise.all([loadFinance(), loadPackages(), loadExpenses()]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [viewMonth, viewYear]);

  const togglePayment = async (clientId, currentStatus) => {
    const newStatus = currentStatus === 'PAID' ? 'PENDING' : 'PAID';
    setUpdating(clientId);
    try {
      await financeApi.updatePayment(clientId, {
        month: viewMonth,
        year: viewYear,
        status: newStatus,
      });
      await loadFinance();
    } finally {
      setUpdating(null);
    }
  };

  const openExpectedModal = (client) => {
    setEditingExpectedClient(client);
    setExpectedAmountInput(client.expectedAmount > 0 ? String(client.expectedAmount) : '');
    setShowExpectedModal(true);
  };

  const onSaveExpected = async (value) => {
    if (!editingExpectedClient) return;
    setSavingExpected(true);
    try {
      await financeApi.updateExpectedAmount(editingExpectedClient.clientId, {
        month: viewMonth,
        year: viewYear,
        amount: Number(value),
      });
      setShowExpectedModal(false);
      setEditingExpectedClient(null);
      setExpectedAmountInput('');
      await loadFinance();
    } catch (err) {
      showError(err.response?.data?.error || t('finance.expectedError'));
    } finally {
      setSavingExpected(false);
    }
  };

  const openCreatePackage = () => {
    setEditingPackage(null);
    setPackageForm(emptyPackageForm);
    setShowPackageModal(true);
  };

  const openEditPackage = (pkg) => {
    setEditingPackage(pkg);
    setPackageForm({
      name: pkg.name || '',
      description: pkg.description || '',
      monthlyPrice: pkg.monthlyPrice ?? '',
      sessionsPerWeek: pkg.sessionsPerWeek ?? '',
      sessionsPerMonth: pkg.sessionsPerMonth ?? '',
      hasOnlineSupport: pkg.hasOnlineSupport !== false,
    });
    setShowPackageModal(true);
  };

  const packageField = (key) => ({
    value: packageForm[key],
    onChange: (e) => setPackageForm({ ...packageForm, [key]: e.target.value }),
  });

  const onSavePackage = async (e) => {
    e.preventDefault();
    setSavingPackage(true);
    try {
      const payload = {
        ...packageForm,
        monthlyPrice: parseFloat(packageForm.monthlyPrice),
        sessionsPerWeek: packageForm.sessionsPerWeek === '' ? null : Number(packageForm.sessionsPerWeek),
        sessionsPerMonth: packageForm.sessionsPerMonth === '' ? null : Number(packageForm.sessionsPerMonth),
      };

      if (editingPackage?.id) await packagesApi.update(editingPackage.id, payload);
      else await packagesApi.create(payload);

      setShowPackageModal(false);
      setEditingPackage(null);
      setPackageForm(emptyPackageForm);
      await Promise.all([loadPackages(), loadFinance()]);
    } catch (err) {
      showError(err.response?.data?.error || t('packages.errorSave'));
    } finally {
      setSavingPackage(false);
    }
  };

  const onDeletePackage = async (pkg) => {
    if (!(await confirm(t('packages.confirmDelete', { name: pkg.name })))) return;
    try {
      await packagesApi.delete(pkg.id);
      await Promise.all([loadPackages(), loadFinance()]);
    } catch (err) {
      showError(err.response?.data?.error || t('packages.errorDelete'));
    }
  };

  const openCreateExpense = () => {
    setEditingExpense(null);
    setExpenseForm({ ...emptyExpenseForm, expenseDate: new Date().toISOString().slice(0, 10) });
    setExpenseFile(null);
    setShowExpenseModal(true);
  };

  const openEditExpense = (expense) => {
    setEditingExpense(expense);
    setExpenseForm({
      title: expense.title || '',
      description: expense.description || '',
      amount: expense.amount ?? '',
      category: expense.category || '',
      paymentMethod: expense.paymentMethod || '',
      type: expense.type || 'FIXED',
      expenseDate: expense.expenseDate ? String(expense.expenseDate).slice(0, 10) : new Date().toISOString().slice(0, 10),
    });
    setExpenseFile(null);
    setShowExpenseModal(true);
  };

  const onSaveExpense = async (e) => {
    e.preventDefault();
    setSavingExpense(true);
    try {
      const formData = new FormData();
      formData.append('title', expenseForm.title);
      formData.append('description', expenseForm.description || '');
      formData.append('amount', String(expenseForm.amount));
      formData.append('category', expenseForm.category || '');
      formData.append('paymentMethod', expenseForm.paymentMethod || '');
      formData.append('type', expenseForm.type || 'FIXED');
      formData.append('expenseDate', expenseForm.expenseDate || new Date().toISOString().slice(0, 10));

      if (expenseFile) formData.append('attachment', expenseFile);

      if (editingExpense?.id) await financeApi.updateExpense(editingExpense.id, formData);
      else await financeApi.createExpense(formData);

      setShowExpenseModal(false);
      setEditingExpense(null);
      setExpenseForm(emptyExpenseForm);
      setExpenseFile(null);
      await Promise.all([loadExpenses(), loadFinance()]);
    } catch (err) {
      showError(err.response?.data?.error || t('finance.expenses.errorSave'));
    } finally {
      setSavingExpense(false);
    }
  };

  const onDeleteExpense = async (expense) => {
    if (!(await confirm(t('finance.expenses.confirmDelete', { name: expense.title })))) return;
    try {
      await financeApi.deleteExpense(expense.id);
      await Promise.all([loadExpenses(), loadFinance()]);
    } catch (err) {
      showError(err.response?.data?.error || t('finance.expenses.errorDelete'));
    }
  };

  const onDownloadExpenseAttachment = async (expense) => {
    try {
      const response = await financeApi.downloadExpenseAttachment(expense.id);
      const contentDisposition = response.headers?.['content-disposition'] || '';
      const fileNameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
      const fallbackName = expense.attachments?.[0]?.fileName || 'anexo';
      const fileName = fileNameMatch?.[1] || fallbackName;

      const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      showError(err.response?.data?.error || t('finance.expenses.errorDownload'));
    }
  };

  const switchTab = (tabKey) => {
    setActiveTab(tabKey);
    setSearchParams({ tab: tabKey }, { replace: true });
  };

  const locale = { en: 'en-US', pt: 'pt-PT', de: 'de-DE' }[i18n.language] || 'en-US';
  const viewDate = new Date(viewYear, viewMonth - 1, 1);
  const monthName = viewDate.toLocaleDateString(locale, { month: 'long' });

  const monthlyCharts = useMemo(() => {
    if (!stats?.monthlySeries) return [];
    return stats.monthlySeries.map((item) => {
      const d = new Date(item.year, item.month - 1, 1);
      return {
        ...item,
        label: d.toLocaleDateString(locale, { month: 'short' }),
      };
    });
  }, [stats, locale]);

  const packageCharts = (stats?.packageDistribution || []).map((pkg) => ({
    ...pkg,
    name: pkg.name || t('finance.noPackage'),
  }));

  const revenueVsExpenseCharts = useMemo(() => {
    if (!stats?.monthlyRevenueVsExpenses) return [];
    return stats.monthlyRevenueVsExpenses.map((item) => {
      const d = new Date(item.year, item.month - 1, 1);
      return {
        ...item,
        label: d.toLocaleDateString(locale, { month: 'short' }),
      };
    });
  }, [stats, locale]);

  const yearlyRevenueCharts = (stats?.yearlyRevenue || []).map((item) => ({ year: String(item.year), value: Number(item.value || 0) }));
  const yearlyExpenseCharts = (stats?.yearlyExpenses || []).map((item) => ({ year: String(item.year), value: Number(item.value || 0) }));
  const expenseCategoryCharts = (stats?.expenseStats?.byCategory || []).map((item) => ({ name: item.name, value: Number(item.value || 0) }));
  const statsYearOptions = useMemo(() => {
    const years = [...new Set((revenueVsExpenseCharts || []).map((item) => String(item.year)))].sort((a, b) => Number(b) - Number(a));
    return years;
  }, [revenueVsExpenseCharts]);
  const filteredRevenueVsExpenseRows = useMemo(() => {
    const base = revenueVsExpenseCharts.slice(-12);
    if (statsYearFilter === 'ALL') return base;
    return base.filter((row) => String(row.year) === String(statsYearFilter));
  }, [revenueVsExpenseCharts, statsYearFilter]);

  const overview = useMemo(() => {
    if (!data) return null;
    const paidCount = data.clients.filter((client) => client.paymentStatus === 'PAID').length;
    const overdueCount = data.clients.filter((client) => client.paymentStatus === 'OVERDUE').length;
    const unpaidClients = data.clients
      .filter((client) => client.paymentStatus !== 'PAID')
      .sort((left, right) => {
        const statusWeight = { OVERDUE: 0, PENDING: 1, PAID: 2 };
        const byStatus = statusWeight[left.paymentStatus] - statusWeight[right.paymentStatus];
        if (byStatus !== 0) return byStatus;
        return Number(right.expectedAmount || 0) - Number(left.expectedAmount || 0);
      });
    const unpaidCount = unpaidClients.length;
    const collectionRate = data.totalExpected > 0 ? (data.totalReceived / data.totalExpected) * 100 : 0;
    const averageTicket = data.totalClients > 0 ? data.totalExpected / data.totalClients : 0;
    const packageCoverage = data.totalClients > 0
      ? ((stats?.totals?.clientsWithPackage || 0) / data.totalClients) * 100
      : 0;

    return {
      paidCount,
      overdueCount,
      unpaidClients,
      unpaidCount,
      collectionRate,
      averageTicket,
      packageCoverage,
      atRiskRevenue: data.totalPending,
    };
  }, [data, stats]);

  const topPackage = packageCharts.length ? packageCharts[0] : null;
  const statsChartHeight = isMobile ? 220 : 280;
  const expenseCategoryTotal = expenseCategoryCharts.reduce((sum, item) => sum + Number(item.value || 0), 0);

  if (loading) return <BrandLoadingScreen />;
  if (!data || !overview) return null;

  const focusMessage = getFinanceFocus({
    t,
    overdueCount: overview.overdueCount,
    unpaidCount: overview.unpaidCount,
    pendingAmount: data.totalPending,
    collectionRate: overview.collectionRate,
  });

  const renderStatusTab = () => (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 14, marginBottom: 18 }}>
        <KpiCard title={t('finance.expected')} value={formatCurrency(data.totalExpected)} detail={t('finance.monthTarget')} accent="#10253C" />
        <KpiCard title={t('finance.received')} value={formatCurrency(data.totalReceived)} detail={t('finance.alreadyCollected')} accent="#2D7A47" />
        <KpiCard title={t('finance.pending')} value={formatCurrency(data.totalPending)} detail={t('finance.atRiskRevenue')} accent="#B66A17" />
        <KpiCard title={t('finance.collectionRate')} value={`${Math.round(overview.collectionRate)}%`} detail={t('finance.paidClients', { count: overview.paidCount, total: data.totalClients })} accent="#5682B1" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : '1.15fr 1fr', gap: 16, marginBottom: 18 }}>
        <div style={{ ...card, padding: isMobile ? '18px 16px' : '22px 24px' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#10253C', marginBottom: 10 }}>{t('finance.billingProgress')}</div>
          <div style={{ fontSize: 13, color: '#6B86A3', marginBottom: 14 }}>
            {t('finance.statusOverview', { month: monthName, year: viewYear })}
          </div>
          <div style={{ fontSize: 12, color: '#5682B1', marginBottom: 14, padding: '8px 10px', background: '#F7FBFF', borderRadius: 10, border: '1px solid rgba(159,189,217,0.3)' }}>
            {t('finance.monthResetHint')}
          </div>
          <div style={{ height: 12, background: '#EDF5FC', borderRadius: 999, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${Math.min(overview.collectionRate, 100)}%`,
                background: 'linear-gradient(90deg, #2D7A47 0%, #5682B1 100%)',
                borderRadius: 999,
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 9, fontSize: 12, color: '#6B86A3' }}>
            <span>{formatCurrency(0)}</span>
            <strong style={{ color: '#10253C' }}>{formatCurrency(data.totalExpected)}</strong>
          </div>
          <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 14, background: '#F7FBFF', border: '1px solid rgba(159,189,217,0.3)', fontSize: 13, color: '#2C4F73', lineHeight: 1.5 }}>
            {focusMessage}
          </div>
        </div>

        <div style={{ ...card, padding: isMobile ? '18px 16px' : '22px 24px' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#10253C', marginBottom: 6 }}>{t('finance.priorityFollowUp')}</div>
          <div style={{ fontSize: 13, color: '#6B86A3', marginBottom: 12 }}>{t('finance.priorityFollowUpHint')}</div>

          {overview.unpaidClients.length > 0 ? overview.unpaidClients.slice(0, 6).map((client, index) => (
            <div
              key={client.clientId}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 10,
                padding: '10px 0',
                borderTop: index === 0 ? '1px solid rgba(159,189,217,0.24)' : 'none',
                borderBottom: '1px solid rgba(159,189,217,0.24)',
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#10253C' }}>{client.clientName}</div>
                <div style={{ fontSize: 12, color: '#6B86A3', marginTop: 2 }}>{formatCurrency(client.expectedAmount)}</div>
              </div>
              <PayBadge status={client.paymentStatus} />
            </div>
          )) : (
            <div style={{ fontSize: 13, color: '#6B86A3', marginTop: 12 }}>{t('finance.allPaymentsSettled')}</div>
          )}
        </div>
      </div>

      <div style={{ ...card, padding: isMobile ? '18px 16px' : '22px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#10253C' }}>{t('finance.statusByClient')}</div>
          <div style={{ fontSize: 12, color: '#6B86A3' }}>{t('finance.statusHelp')}</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 660, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(159,189,217,0.24)' }}>
                {[t('finance.clientCol'), t('finance.monthlyFeeCol'), t('finance.statusCol'), t('finance.actionCol')].map((label, index) => (
                  <th
                    key={label}
                    style={{
                      textAlign: index === 0 ? 'left' : 'center',
                      padding: '8px 8px 12px',
                      color: '#6B86A3',
                      fontSize: 11,
                      letterSpacing: '0.08em',
                      fontWeight: 700,
                    }}
                  >
                    {label.toUpperCase()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.clients.map((client, index) => (
                <tr key={client.clientId} style={{ borderBottom: index < data.clients.length - 1 ? '1px solid rgba(159,189,217,0.24)' : 'none' }}>
                  <td style={{ padding: '14px 8px 14px 0', color: '#10253C', fontWeight: 700 }}>{client.clientName}</td>
                  <td style={{ textAlign: 'center', padding: '14px 8px' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: client.expectedAmount > 0 ? '#10253C' : '#9FBDD9', fontWeight: 700 }}>
                        {formatCurrency(client.expectedAmount)}
                      </span>
                      {client.paymentStatus !== 'PAID' && (
                        <button
                          type="button"
                          onClick={() => openExpectedModal(client)}
                          style={{
                            background: 'none',
                            border: '1px solid #9FBDD9',
                            borderRadius: 6,
                            width: 26,
                            height: 26,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            fontSize: 13,
                            color: '#5682B1',
                            flexShrink: 0,
                          }}
                          title={t('finance.editExpected')}
                        >
                          &#9998;
                        </button>
                      )}
                    </div>
                  </td>
                  <td style={{ textAlign: 'center', padding: '14px 8px' }}><PayBadge status={client.paymentStatus} /></td>
                  <td style={{ textAlign: 'right', padding: '14px 0' }}>
                    <button
                      type="button"
                      onClick={() => togglePayment(client.clientId, client.paymentStatus)}
                      disabled={updating === client.clientId}
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        padding: '7px 14px',
                        border: '1px solid #739EC9',
                        borderRadius: 10,
                        background: '#FFFFFF',
                        color: '#2C4F73',
                        cursor: updating === client.clientId ? 'not-allowed' : 'pointer',
                        opacity: updating === client.clientId ? 0.55 : 1,
                      }}
                    >
                      {client.paymentStatus === 'PAID' ? t('finance.markPending') : t('finance.markPaid')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );

  const renderPackagesTab = () => (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : 'repeat(3, minmax(0,1fr))', gap: 14, marginBottom: 18 }}>
        <KpiCard title={t('finance.packageCount')} value={packages.length} detail={t('finance.portfolioOverview')} accent="#10253C" />
        <KpiCard title={t('finance.clientsWithPackage')} value={stats?.totals?.clientsWithPackage || 0} detail={t('finance.activeInPackages')} accent="#5682B1" />
        <KpiCard title={t('finance.topPackageShort')} value={topPackage?.name || t('finance.noTopPackage')} detail={topPackage ? `${topPackage.clients} ${t('nav.clients').toLowerCase()}` : t('packages.noPackages')} accent="#2D7A47" />
      </div>

      <div style={{ display: 'flex', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between', marginBottom: 18, flexDirection: isMobile ? 'column' : 'row', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: isMobile ? 19 : 22, margin: 0, color: '#10253C', fontWeight: 800 }}>{t('packages.title')}</h2>
          <p style={{ fontSize: 13, color: '#6B86A3', margin: '4px 0 0' }}>{t('packages.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={openCreatePackage}
          style={{
            border: 'none',
            borderRadius: 12,
            padding: '11px 18px',
            background: 'linear-gradient(135deg, #10253C 0%, #5682B1 100%)',
            color: '#FFFFFF',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            width: isMobile ? '100%' : 'auto',
          }}
        >
          {t('packages.newPackage')}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 14 }}>
        {packages.map((pkg) => (
          <div key={pkg.id} style={{ ...card, padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 18, color: '#10253C' }}>{pkg.name}</div>
                <div style={{ marginTop: 6, fontSize: 13, color: '#6B86A3' }}>{formatCurrency(pkg.monthlyPrice)} {t('packages.monthly')}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" onClick={() => openEditPackage(pkg)} style={{ border: '1px solid #9FBDD9', color: '#2C4F73', background: '#FFFFFF', borderRadius: 8, fontSize: 12, padding: '6px 10px', cursor: 'pointer', fontWeight: 700 }}>{t('common.edit')}</button>
                <button type="button" onClick={() => onDeletePackage(pkg)} style={{ border: '1px solid #D9A2A2', color: '#9F4A4A', background: '#FFFFFF', borderRadius: 8, fontSize: 12, padding: '6px 10px', cursor: 'pointer', fontWeight: 700 }}>{t('packages.delete')}</button>
              </div>
            </div>

            {pkg.description && <p style={{ marginTop: 10, marginBottom: 0, fontSize: 13, color: '#3A4F63', lineHeight: 1.45 }}>{pkg.description}</p>}

            <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {pkg.sessionsPerWeek ? <span style={{ fontSize: 11, padding: '4px 8px', borderRadius: 999, background: '#EDF5FC', color: '#2C4F73', fontWeight: 700 }}>{pkg.sessionsPerWeek}x {t('packages.perWeek')}</span> : null}
              {pkg.sessionsPerMonth ? <span style={{ fontSize: 11, padding: '4px 8px', borderRadius: 999, background: '#EDF5FC', color: '#2C4F73', fontWeight: 700 }}>{pkg.sessionsPerMonth}x {t('packages.perMonth')}</span> : null}
              {pkg.hasOnlineSupport ? <span style={{ fontSize: 11, padding: '4px 8px', borderRadius: 999, background: '#EDF5FC', color: '#2C4F73', fontWeight: 700 }}>{t('packages.onlineSupport')}</span> : null}
            </div>
          </div>
        ))}
      </div>

      {packages.length === 0 && (
        <div style={{ ...card, textAlign: 'center', padding: isMobile ? '32px 20px' : '56px 40px', marginTop: 14 }}>
          <p style={{ color: '#6B86A3', marginBottom: 18, fontSize: 14 }}>{t('packages.noPackages')}</p>
          <button
            type="button"
            onClick={openCreatePackage}
            style={{
              border: 'none',
              borderRadius: 12,
              padding: '11px 22px',
              background: 'linear-gradient(135deg, #10253C 0%, #5682B1 100%)',
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            {t('packages.createFirst')}
          </button>
        </div>
      )}
    </>
  );

  const renderExpensesTab = () => (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0,1fr))', gap: 14, marginBottom: 18 }}>
        <KpiCard title={t('finance.expenses.totalExpenses')} value={formatCurrency(expensesData?.totals?.amount || 0)} detail={t('finance.expenses.currentTotal')} accent="#9F4A4A" />
        <KpiCard title={t('finance.expenses.totalRecords')} value={expensesData?.totals?.count || 0} detail={t('finance.expenses.entriesCount')} accent="#5682B1" />
        <KpiCard title={t('finance.expenses.fixedExpenses')} value={formatCurrency(expensesData?.totals?.byType?.FIXED || 0)} detail={t('finance.expenses.fixedHint')} accent="#B66A17" />
      </div>

      <div style={{ display: 'flex', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between', marginBottom: 14, flexDirection: isMobile ? 'column' : 'row', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: isMobile ? 19 : 22, margin: 0, color: '#10253C', fontWeight: 800 }}>{t('finance.expenses.title')}</h2>
          <p style={{ fontSize: 13, color: '#6B86A3', margin: '4px 0 0' }}>{t('finance.expenses.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={openCreateExpense}
          style={{
            border: 'none',
            borderRadius: 12,
            padding: '11px 18px',
            background: 'linear-gradient(135deg, #10253C 0%, #5682B1 100%)',
            color: '#FFFFFF',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            width: isMobile ? '100%' : 'auto',
          }}
        >
          {t('finance.expenses.newExpense')}
        </button>
      </div>

      <div style={{ ...card, padding: isMobile ? '16px 14px' : '20px 24px' }}>
        {expensesData.items.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: '#6B86A3' }}>{t('finance.expenses.empty')}</p>
        ) : isMobile ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {expensesData.items.map((expense) => (
              <div key={expense.id} style={{ border: '1px solid rgba(159,189,217,0.3)', borderRadius: 14, padding: '12px 12px 10px', background: '#FFFFFF' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#10253C' }}>{expense.title}</div>
                    <div style={{ fontSize: 12, color: '#6B86A3', marginTop: 3 }}>{new Date(expense.expenseDate).toLocaleDateString(locale)}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#10253C', whiteSpace: 'nowrap' }}>{formatCurrency(expense.amount)}</div>
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  <span style={{ fontSize: 11, borderRadius: 999, padding: '4px 8px', background: '#EDF5FC', color: '#2C4F73', fontWeight: 700 }}>{expense.category || '-'}</span>
                  <span style={{ fontSize: 11, borderRadius: 999, padding: '4px 8px', background: '#F5EEF7', color: '#5A3A73', fontWeight: 700 }}>{expense.type || 'FIXED'}</span>
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                  {expense.attachments?.length ? (
                    <button
                      type="button"
                      onClick={() => onDownloadExpenseAttachment(expense)}
                      style={{ border: '1px solid #9FBDD9', color: '#2C4F73', background: '#FFFFFF', borderRadius: 8, fontSize: 12, padding: '6px 10px', cursor: 'pointer', fontWeight: 700 }}
                    >
                      {t('finance.expenses.download')}
                    </button>
                  ) : null}
                  <button type="button" onClick={() => openEditExpense(expense)} style={{ border: '1px solid #9FBDD9', color: '#2C4F73', background: '#FFFFFF', borderRadius: 8, fontSize: 12, padding: '6px 10px', cursor: 'pointer', fontWeight: 700 }}>
                    {t('common.edit')}
                  </button>
                  <button type="button" onClick={() => onDeleteExpense(expense)} style={{ border: '1px solid #D9A2A2', color: '#9F4A4A', background: '#FFFFFF', borderRadius: 8, fontSize: 12, padding: '6px 10px', cursor: 'pointer', fontWeight: 700 }}>
                    {t('packages.delete')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(159,189,217,0.24)' }}>
                  {[t('finance.expenses.colDate'), t('finance.expenses.colTitle'), t('finance.expenses.colCategory'), t('finance.expenses.colType'), t('finance.expenses.colAmount'), t('finance.expenses.colAttachments'), t('finance.actionCol')].map((label, index) => (
                    <th key={label} style={{ textAlign: index === 0 ? 'left' : index === 6 ? 'right' : 'center', padding: '8px 8px 12px', color: '#6B86A3', fontSize: 11, letterSpacing: '0.08em', fontWeight: 700 }}>
                      {label.toUpperCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {expensesData.items.map((expense, index) => (
                  <tr key={expense.id} style={{ borderBottom: index < expensesData.items.length - 1 ? '1px solid rgba(159,189,217,0.24)' : 'none' }}>
                    <td style={{ padding: '12px 8px 12px 0', color: '#10253C', fontWeight: 700 }}>{new Date(expense.expenseDate).toLocaleDateString(locale)}</td>
                    <td style={{ textAlign: 'center', padding: '12px 8px', color: '#10253C' }}>{expense.title}</td>
                    <td style={{ textAlign: 'center', padding: '12px 8px', color: '#2C4F73' }}>{expense.category || '-'}</td>
                    <td style={{ textAlign: 'center', padding: '12px 8px', color: '#2C4F73' }}>{expense.type || 'FIXED'}</td>
                    <td style={{ textAlign: 'center', padding: '12px 8px', color: '#10253C', fontWeight: 700 }}>{formatCurrency(expense.amount)}</td>
                    <td style={{ textAlign: 'center', padding: '12px 8px' }}>
                      {expense.attachments?.length ? (
                        <button
                          type="button"
                          onClick={() => onDownloadExpenseAttachment(expense)}
                          style={{ border: '1px solid #9FBDD9', color: '#2C4F73', background: '#FFFFFF', borderRadius: 8, fontSize: 12, padding: '6px 10px', cursor: 'pointer', fontWeight: 700 }}
                        >
                          {t('finance.expenses.download')} ({expense.attachments[0]?.fileName || t('finance.expenses.file')})
                        </button>
                      ) : <span style={{ color: '#6B86A3' }}>-</span>}
                    </td>
                    <td style={{ textAlign: 'right', padding: '12px 0' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button type="button" onClick={() => openEditExpense(expense)} style={{ border: '1px solid #9FBDD9', color: '#2C4F73', background: '#FFFFFF', borderRadius: 8, fontSize: 12, padding: '6px 10px', cursor: 'pointer', fontWeight: 700 }}>{t('common.edit')}</button>
                        <button type="button" onClick={() => onDeleteExpense(expense)} style={{ border: '1px solid #D9A2A2', color: '#9F4A4A', background: '#FFFFFF', borderRadius: 8, fontSize: 12, padding: '6px 10px', cursor: 'pointer', fontWeight: 700 }}>{t('packages.delete')}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );

  const renderStatsTab = () => (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 14, marginBottom: 18 }}>
        <KpiCard title={t('finance.totalClients')} value={stats?.totals?.totalClients || 0} detail={t('finance.monthTarget')} accent="#10253C" />
        <KpiCard title={t('finance.annualRevenue')} value={formatCurrency(stats?.totals?.annualRevenue || 0)} detail={t('finance.currentYear')} accent="#2D7A47" />
        <KpiCard title={t('finance.annualExpenses')} value={formatCurrency(stats?.totals?.annualExpenses || 0)} detail={t('finance.currentYear')} accent="#9F4A4A" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 14, marginBottom: 14 }}>
        <div style={card}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#10253C', marginBottom: 8 }}>{t('finance.collectionTrend')}</div>
          <div style={{ fontSize: 12, color: '#6B86A3', marginBottom: 12 }}>{t('finance.collectionTrendHint')}</div>
          <div style={{ width: '100%', height: statsChartHeight }}>
            <ResponsiveContainer>
              <LineChart data={monthlyCharts} margin={{ left: 8, right: 8, top: 4, bottom: 0 }}>
                <CartesianGrid stroke="rgba(159,189,217,0.24)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#6B86A3' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#6B86A3' }} tickLine={false} axisLine={false} width={80} />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Line type="monotone" dataKey="expected" stroke="#739EC9" strokeWidth={2} dot={false} name={t('finance.expected')} />
                <Line type="monotone" dataKey="received" stroke="#2D7A47" strokeWidth={3} dot={false} name={t('finance.received')} />
                <Line type="monotone" dataKey="pending" stroke="#B66A17" strokeWidth={2} dot={false} name={t('finance.pending')} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={card}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#10253C', marginBottom: 8 }}>{t('finance.clientsPerPackage')}</div>
          <div style={{ fontSize: 12, color: '#6B86A3', marginBottom: 12 }}>{t('finance.revenueByPackage')}</div>
          <div style={{ width: '100%', height: statsChartHeight }}>
            <ResponsiveContainer>
              <BarChart data={packageCharts} layout="vertical" margin={{ left: 8, right: 8, top: 4, bottom: 0 }}>
                <CartesianGrid stroke="rgba(159,189,217,0.24)" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: '#6B86A3' }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12, fill: '#2C4F73' }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(value, key) => (key === 'revenue' ? formatCurrency(value) : value)} />
                <Bar dataKey="clients" name={t('nav.clients')} fill="#5682B1" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 14, marginBottom: 14 }}>
        <div style={card}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#10253C', marginBottom: 8 }}>{t('finance.revenueVsExpenses')}</div>
          <div style={{ fontSize: 12, color: '#6B86A3', marginBottom: 12 }}>{t('finance.revenueVsExpensesHint')}</div>
          <div style={{ width: '100%', height: statsChartHeight }}>
            <ResponsiveContainer>
              <BarChart data={revenueVsExpenseCharts} margin={{ left: 8, right: 8, top: 4, bottom: 0 }}>
                <CartesianGrid stroke="rgba(159,189,217,0.24)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#6B86A3' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#6B86A3' }} tickLine={false} axisLine={false} width={80} />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Legend />
                <Bar dataKey="revenue" name={t('finance.received')} fill="#2D7A47" radius={[8, 8, 0, 0]} />
                <Bar dataKey="expenses" name={t('finance.expenses.title')} fill="#9F4A4A" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={card}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#10253C', marginBottom: 8 }}>{t('finance.yearlyRevenueExpenses')}</div>
          <div style={{ fontSize: 12, color: '#6B86A3', marginBottom: 12 }}>{t('finance.yearlyRevenueExpensesHint')}</div>
          <div style={{ width: '100%', height: statsChartHeight }}>
            <ResponsiveContainer>
              <LineChart
                data={yearlyRevenueCharts.map((item, idx) => ({
                  year: item.year,
                  revenue: item.value,
                  expenses: yearlyExpenseCharts[idx]?.value || 0,
                }))}
                margin={{ left: 8, right: 8, top: 4, bottom: 0 }}
              >
                <CartesianGrid stroke="rgba(159,189,217,0.24)" vertical={false} />
                <XAxis dataKey="year" tick={{ fontSize: 12, fill: '#6B86A3' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#6B86A3' }} tickLine={false} axisLine={false} width={80} />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Legend />
                <Line type="monotone" dataKey="revenue" stroke="#2D7A47" strokeWidth={3} dot />
                <Line type="monotone" dataKey="expenses" stroke="#9F4A4A" strokeWidth={3} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : '1.15fr 1fr', gap: 14 }}>
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#10253C' }}>{t('finance.revenueVsExpensesTable')}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: '#6B86A3', fontWeight: 700 }}>{t('finance.filterYear')}</span>
              <select
                value={statsYearFilter}
                onChange={(e) => setStatsYearFilter(e.target.value)}
                style={{ border: '1px solid #9FBDD9', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: '#2C4F73', fontWeight: 700 }}
              >
                <option value="ALL">{t('finance.allYears')}</option>
                {statsYearOptions.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
          </div>
          {isMobile ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {filteredRevenueVsExpenseRows.map((row) => (
                <div key={`${row.year}-${row.month}`} style={{ border: '1px solid rgba(159,189,217,0.3)', borderRadius: 14, padding: '12px 12px 10px' }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#10253C', marginBottom: 8 }}>{row.label} {row.year}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div style={{ background: '#F4FBF6', borderRadius: 10, padding: '8px 10px' }}>
                      <div style={{ fontSize: 10, color: '#5F806A', textTransform: 'uppercase', fontWeight: 700 }}>{t('finance.received')}</div>
                      <div style={{ fontSize: 13, color: '#2D7A47', fontWeight: 800, marginTop: 2 }}>{formatCurrency(row.revenue)}</div>
                    </div>
                    <div style={{ background: '#FEF4F4', borderRadius: 10, padding: '8px 10px' }}>
                      <div style={{ fontSize: 10, color: '#8F5A5A', textTransform: 'uppercase', fontWeight: 700 }}>{t('finance.expenses.title')}</div>
                      <div style={{ fontSize: 13, color: '#9F4A4A', fontWeight: 800, marginTop: 2 }}>{formatCurrency(row.expenses)}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12, color: '#6B86A3' }}>
                    {t('finance.netResult')}: <strong style={{ color: row.net >= 0 ? '#2D7A47' : '#9F4A4A' }}>{formatCurrency(row.net)}</strong>
                  </div>
                </div>
              ))}
              {filteredRevenueVsExpenseRows.length === 0 ? (
                <div style={{ padding: '10px 8px', textAlign: 'center', color: '#6B86A3', fontSize: 13 }}>{t('finance.expenses.empty')}</div>
              ) : null}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 620, borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(159,189,217,0.24)' }}>
                    {[t('finance.monthCol'), t('finance.received'), t('finance.expenses.title'), t('finance.netResult')].map((label, index) => (
                      <th key={label} style={{ textAlign: index === 0 ? 'left' : 'center', padding: '8px 8px 12px', color: '#6B86A3', fontSize: 11, letterSpacing: '0.08em', fontWeight: 700 }}>
                        {label.toUpperCase()}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRevenueVsExpenseRows.map((row, index) => (
                    <tr key={`${row.year}-${row.month}`} style={{ borderBottom: index < filteredRevenueVsExpenseRows.length - 1 ? '1px solid rgba(159,189,217,0.24)' : 'none' }}>
                      <td style={{ padding: '12px 8px 12px 0', color: '#10253C', fontWeight: 700 }}>{row.label} {row.year}</td>
                      <td style={{ textAlign: 'center', padding: '12px 8px', color: '#2D7A47', fontWeight: 700 }}>{formatCurrency(row.revenue)}</td>
                      <td style={{ textAlign: 'center', padding: '12px 8px', color: '#9F4A4A', fontWeight: 700 }}>{formatCurrency(row.expenses)}</td>
                      <td style={{ textAlign: 'center', padding: '12px 8px', color: row.net >= 0 ? '#2D7A47' : '#9F4A4A', fontWeight: 700 }}>{formatCurrency(row.net)}</td>
                    </tr>
                  ))}
                  {filteredRevenueVsExpenseRows.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ padding: '14px 8px', textAlign: 'center', color: '#6B86A3' }}>{t('finance.expenses.empty')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={card}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#10253C', marginBottom: 8 }}>{t('finance.expensesByCategory')}</div>
          <div style={{ fontSize: 12, color: '#6B86A3', marginBottom: 12 }}>{t('finance.expensesByCategoryHint')}</div>
          <div style={{ width: '100%', height: statsChartHeight }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={expenseCategoryCharts} dataKey="value" nameKey="name" outerRadius={95} innerRadius={55} paddingAngle={2}>
                  {expenseCategoryCharts.map((entry, index) => (
                    <Cell key={`cell-${entry.name}`} fill={['#9F4A4A', '#B66A17', '#5682B1', '#2D7A47', '#739EC9'][index % 5]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(value)} />
                {!isMobile ? <Legend /> : null}
              </PieChart>
            </ResponsiveContainer>
          </div>
          {isMobile && expenseCategoryCharts.length > 0 ? (
            <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
              {expenseCategoryCharts.map((item, index) => {
                const pct = expenseCategoryTotal > 0 ? Math.round((Number(item.value || 0) / expenseCategoryTotal) * 100) : 0;
                return (
                  <div key={item.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#2C4F73', minWidth: 0 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 999, background: ['#9F4A4A', '#B66A17', '#5682B1', '#2D7A47', '#739EC9'][index % 5], flexShrink: 0 }} />
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</span>
                    </div>
                    <strong style={{ color: '#10253C', whiteSpace: 'nowrap' }}>{formatCurrency(item.value)} ({pct}%)</strong>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );

  return (
    <div style={{ padding: isMobile ? '16px 14px 20px' : '28px 32px', maxWidth: 1340, margin: '0 auto' }}>
      <section
        style={{
          background: 'linear-gradient(135deg, #10253C 0%, #1D3C5A 52%, #5682B1 100%)',
          borderRadius: isMobile ? 20 : 28,
          padding: isMobile ? '16px 14px' : '28px 30px',
          color: '#FFFFFF',
          boxShadow: '0 24px 50px rgba(16,37,60,0.24)',
          marginBottom: isMobile ? 14 : 18,
        }}
      >
        <div style={{ display: 'flex', flexDirection: isTablet ? 'column' : 'row', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <button
                type="button"
                onClick={goToPrevMonth}
                style={{
                  background: 'rgba(255,255,255,0.15)',
                  border: '1px solid rgba(255,255,255,0.25)',
                  borderRadius: 8,
                  width: 30,
                  height: 30,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#FFFFFF',
                  fontSize: 16,
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.25)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}
              >
                &#8249;
              </button>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#C8DBED', minWidth: 0 }}>
                {monthName} {viewYear}
              </span>
              <button
                type="button"
                onClick={goToNextMonth}
                disabled={isCurrentMonth}
                style={{
                  background: isCurrentMonth ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.15)',
                  border: '1px solid rgba(255,255,255,0.25)',
                  borderRadius: 8,
                  width: 30,
                  height: 30,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: isCurrentMonth ? 'not-allowed' : 'pointer',
                  color: '#FFFFFF',
                  fontSize: 16,
                  opacity: isCurrentMonth ? 0.35 : 1,
                  transition: 'background 0.2s, opacity 0.2s',
                }}
                onMouseEnter={(e) => { if (!isCurrentMonth) e.currentTarget.style.background = 'rgba(255,255,255,0.25)'; }}
                onMouseLeave={(e) => { if (!isCurrentMonth) e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}
              >
                &#8250;
              </button>
            </div>
            <h1 style={{ margin: 0, fontSize: isMobile ? 21 : 34, lineHeight: 1.06, fontWeight: 800 }}>{t('finance.title')}</h1>
            <p style={{ margin: '8px 0 0', maxWidth: 680, fontSize: isMobile ? 13 : 16, lineHeight: 1.45, color: '#E4EFF9' }}>
              {t('finance.subtitle')}
            </p>
          </div>
          <div style={{ minWidth: isTablet ? 'auto' : 320, alignSelf: 'stretch', width: isMobile ? '100%' : 'auto' }}>
            <div style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 16, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#C8DBED' }}>{t('finance.todayPriority')}</div>
              <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.45, fontWeight: 600 }}>{focusMessage}</div>
            </div>
          </div>
        </div>
      </section>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: isMobile ? 'nowrap' : 'wrap', overflowX: isMobile ? 'auto' : 'visible', paddingBottom: isMobile ? 2 : 0 }}>
        {[
          { key: 'status', label: t('finance.statusByClientTab') },
          { key: 'packages', label: t('finance.monthlyPackagesTab') },
          { key: 'expenses', label: t('finance.expensesTab') },
          { key: 'stats', label: t('finance.statsDashboardsTab') },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => switchTab(tab.key)}
            style={{
              border: activeTab === tab.key ? '1px solid #10253C' : '1px solid #9FBDD9',
              background: activeTab === tab.key ? '#10253C' : '#FFFFFF',
              color: activeTab === tab.key ? '#FFFFFF' : '#2C4F73',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              padding: isMobile ? '8px 12px' : '8px 13px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'status' && renderStatusTab()}
      {activeTab === 'packages' && renderPackagesTab()}
      {activeTab === 'expenses' && renderExpensesTab()}
      {activeTab === 'stats' && renderStatsTab()}

      {showExpenseModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: isMobile ? '16px 16px 0 0' : 20,
              padding: isMobile ? '22px 16px 18px' : '32px 36px',
              width: '100%',
              maxWidth: isMobile ? '100%' : 560,
              boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
              maxHeight: isMobile ? '92vh' : '90vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: '#000000' }}>{editingExpense ? t('finance.expenses.modal.editTitle') : t('finance.expenses.modal.createTitle')}</h2>
                <p style={{ fontSize: 12, color: '#739EC9', marginTop: 3 }}>{t('finance.expenses.modal.subtitle')}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowExpenseModal(false)}
                style={{ background: '#FFFFFF', border: 'none', width: 32, height: 32, borderRadius: 8, fontSize: 18, color: '#5682B1', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >
                x
              </button>
            </div>
            <form onSubmit={onSaveExpense}>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>{t('finance.expenses.modal.title')}</label>
                <input type="text" value={expenseForm.title} onChange={(e) => setExpenseForm({ ...expenseForm, title: e.target.value })} required />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>{t('finance.expenses.modal.amount')}</label>
                <input type="number" step="0.01" min="0" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} required />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>{t('finance.expenses.modal.date')}</label>
                <input type="date" value={expenseForm.expenseDate} onChange={(e) => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })} required />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div>
                  <label style={labelStyle}>{t('finance.expenses.modal.category')}</label>
                  <input type="text" value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })} />
                </div>
                <div>
                  <label style={labelStyle}>{t('finance.expenses.modal.type')}</label>
                  <select value={expenseForm.type} onChange={(e) => setExpenseForm({ ...expenseForm, type: e.target.value })}>
                    <option value="FIXED">{t('finance.expenses.typeFixed')}</option>
                    <option value="VARIABLE">{t('finance.expenses.typeVariable')}</option>
                    <option value="ONE_OFF">{t('finance.expenses.typeOneOff')}</option>
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>{t('finance.expenses.modal.paymentMethod')}</label>
                <input type="text" value={expenseForm.paymentMethod} onChange={(e) => setExpenseForm({ ...expenseForm, paymentMethod: e.target.value })} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>{t('finance.expenses.modal.description')}</label>
                <textarea value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} rows={3} style={{ resize: 'vertical' }} />
              </div>
              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>{t('finance.expenses.modal.attachments')}</label>
                <input type="file" onChange={(e) => setExpenseFile(e.target.files?.[0] || null)} />
                {expenseFile ? (
                  <div style={{ marginTop: 6, fontSize: 12, color: '#2C4F73' }}>{expenseFile.name}</div>
                ) : null}
                {editingExpense?.attachments?.length > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => onDownloadExpenseAttachment(editingExpense)}
                      style={{ border: '1px solid #9FBDD9', color: '#2C4F73', background: '#FFFFFF', borderRadius: 8, fontSize: 12, padding: '6px 10px', cursor: 'pointer', fontWeight: 700 }}
                    >
                      {t('finance.expenses.download')} ({editingExpense.attachments[0]?.fileName || t('finance.expenses.file')})
                    </button>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexDirection: isMobile ? 'column-reverse' : 'row' }}>
                <button
                  type="button"
                  onClick={() => setShowExpenseModal(false)}
                  style={{ padding: '10px 18px', border: '1.5px solid #739EC9', borderRadius: 10, background: 'none', fontSize: 13, fontWeight: 500, color: '#5682B1', cursor: 'pointer', width: isMobile ? '100%' : 'auto' }}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={savingExpense}
                  style={{ padding: '10px 22px', background: savingExpense ? '#739EC9' : 'linear-gradient(135deg, #5682B1 0%, #739EC9 100%)', color: '#FFFFFF', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: savingExpense ? 'not-allowed' : 'pointer', width: isMobile ? '100%' : 'auto' }}
                >
                  {savingExpense ? t('finance.expenses.modal.saving') : editingExpense ? t('finance.expenses.modal.update') : t('finance.expenses.modal.create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showExpectedModal && editingExpectedClient && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: isMobile ? '16px 16px 0 0' : 20,
              padding: isMobile ? '22px 16px 18px' : '28px 32px',
              width: '100%',
              maxWidth: isMobile ? '100%' : 440,
              boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: '#000000', margin: 0 }}>{t('finance.expectedModal.title')}</h2>
                <p style={{ fontSize: 13, color: '#6B86A3', marginTop: 4, marginBottom: 0 }}>
                  {editingExpectedClient.clientName} — {monthName} {viewYear}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowExpectedModal(false)}
                style={{ background: '#FFFFFF', border: 'none', width: 32, height: 32, borderRadius: 8, fontSize: 18, color: '#5682B1', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >
                x
              </button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6B86A3', letterSpacing: '0.08em', marginBottom: 8, textTransform: 'uppercase' }}>
                {t('finance.expectedModal.quickOptions')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {editingExpectedClient.previousMonthAmount != null && editingExpectedClient.previousMonthAmount > 0 && (
                  <button
                    type="button"
                    onClick={() => onSaveExpected(editingExpectedClient.previousMonthAmount)}
                    disabled={savingExpected}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 14px',
                      border: '1px solid rgba(159,189,217,0.4)',
                      borderRadius: 12,
                      background: '#F7FBFF',
                      cursor: savingExpected ? 'not-allowed' : 'pointer',
                      fontSize: 13,
                      color: '#10253C',
                      fontWeight: 600,
                    }}
                  >
                    <span>{t('finance.expectedModal.previousMonth')}</span>
                    <strong>{formatCurrency(editingExpectedClient.previousMonthAmount)}</strong>
                  </button>
                )}
                {editingExpectedClient.packagePrice != null && editingExpectedClient.packagePrice > 0 && (
                  <button
                    type="button"
                    onClick={() => onSaveExpected(editingExpectedClient.packagePrice)}
                    disabled={savingExpected}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 14px',
                      border: '1px solid rgba(159,189,217,0.4)',
                      borderRadius: 12,
                      background: '#F7FBFF',
                      cursor: savingExpected ? 'not-allowed' : 'pointer',
                      fontSize: 13,
                      color: '#10253C',
                      fontWeight: 600,
                    }}
                  >
                    <span>{t('finance.expectedModal.package', { name: editingExpectedClient.packageName })}</span>
                    <strong>{formatCurrency(editingExpectedClient.packagePrice)}</strong>
                  </button>
                )}
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const val = parseFloat(expectedAmountInput);
                if (!Number.isNaN(val) && val >= 0) onSaveExpected(val);
              }}
            >
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>{t('finance.expectedModal.customAmount')}</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={expectedAmountInput}
                  onChange={(e) => setExpectedAmountInput(e.target.value)}
                  placeholder="0"
                  style={{ width: '100%' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexDirection: isMobile ? 'column-reverse' : 'row' }}>
                <button
                  type="button"
                  onClick={() => setShowExpectedModal(false)}
                  style={{ padding: '10px 18px', border: '1.5px solid #739EC9', borderRadius: 10, background: 'none', fontSize: 13, fontWeight: 500, color: '#5682B1', cursor: 'pointer', width: isMobile ? '100%' : 'auto' }}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={savingExpected || expectedAmountInput === ''}
                  style={{
                    padding: '10px 22px',
                    background: savingExpected || expectedAmountInput === '' ? '#739EC9' : 'linear-gradient(135deg, #5682B1 0%, #739EC9 100%)',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: savingExpected || expectedAmountInput === '' ? 'not-allowed' : 'pointer',
                    width: isMobile ? '100%' : 'auto',
                  }}
                >
                  {savingExpected ? t('finance.expectedModal.saving') : t('finance.expectedModal.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPackageModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: isMobile ? '16px 16px 0 0' : 20,
              padding: isMobile ? '22px 16px 18px' : '32px 36px',
              width: '100%',
              maxWidth: isMobile ? '100%' : 520,
              boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
              maxHeight: isMobile ? '92vh' : '90vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: '#000000' }}>{editingPackage ? t('packages.modal.editTitle') : t('packages.modal.createTitle')}</h2>
                <p style={{ fontSize: 12, color: '#739EC9', marginTop: 3 }}>{t('packages.modal.subtitle')}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowPackageModal(false)}
                style={{
                  background: '#FFFFFF',
                  border: 'none',
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  fontSize: 18,
                  color: '#5682B1',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                x
              </button>
            </div>
            <form onSubmit={onSavePackage}>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>{t('packages.modal.name')}</label>
                <input type="text" placeholder={t('packages.modal.namePlaceholder')} {...packageField('name')} required />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>{t('packages.modal.monthlyPrice')}</label>
                <input type="number" step="0.01" min="0" placeholder="450" {...packageField('monthlyPrice')} required />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>{t('packages.modal.sessionsPerWeek')}</label>
                <input type="number" min="0" placeholder="1" {...packageField('sessionsPerWeek')} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>{t('packages.modal.sessionsPerMonth')}</label>
                <input type="number" min="0" placeholder="4" {...packageField('sessionsPerMonth')} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>{t('packages.modal.description')}</label>
                <textarea {...packageField('description')} placeholder={t('packages.modal.descriptionPlaceholder')} rows={3} style={{ resize: 'vertical' }} />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#2C4F73', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={!!packageForm.hasOnlineSupport}
                    onChange={(e) => setPackageForm({ ...packageForm, hasOnlineSupport: e.target.checked })}
                  />
                  {t('packages.modal.onlineSupport')}
                </label>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexDirection: isMobile ? 'column-reverse' : 'row' }}>
                <button
                  type="button"
                  onClick={() => setShowPackageModal(false)}
                  style={{
                    padding: '10px 18px',
                    border: '1.5px solid #739EC9',
                    borderRadius: 10,
                    background: 'none',
                    fontSize: 13,
                    fontWeight: 500,
                    color: '#5682B1',
                    cursor: 'pointer',
                    width: isMobile ? '100%' : 'auto',
                  }}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={savingPackage}
                  style={{
                    padding: '10px 22px',
                    background: savingPackage ? '#739EC9' : 'linear-gradient(135deg, #5682B1 0%, #739EC9 100%)',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: savingPackage ? 'not-allowed' : 'pointer',
                    width: isMobile ? '100%' : 'auto',
                  }}
                >
                  {savingPackage ? t('packages.modal.saving') : editingPackage ? t('packages.modal.update') : t('packages.modal.create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
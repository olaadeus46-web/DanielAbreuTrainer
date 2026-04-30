import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { clientsApi, packagesApi } from '../services/api';
import { useTranslation } from 'react-i18next';
import useMediaQuery from '../hooks/useMediaQuery';
import BrandLoadingScreen from '../components/ui/BrandLoadingScreen';
import { useAppFeedback } from '../components/ui/FeedbackProvider';

const card = {
  background: '#FFFFFF',
  borderRadius: 20,
  padding: '20px 24px',
  boxShadow: '0 18px 40px rgba(16,37,60,0.08)',
  border: '1px solid rgba(159,189,217,0.24)',
};

function Avatar({ name, size = 40 }) {
  const initials = name?.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'linear-gradient(135deg, #10253C 0%, #5682B1 100%)', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.35, fontWeight: 700, flexShrink: 0 }}>
      {initials}
    </div>
  );
}

function PayBadge({ status }) {
  const { t } = useTranslation();
  const map = {
    PAID: ['#EAF8EF', '#2D7A47', t('common.payment.paid')],
    OVERDUE: ['#FDECEC', '#C53131', t('common.payment.overdue')],
    PENDING: ['#FDECEC', '#C53131', t('common.payment.pending')],
  };
  const [bg, color, label] = map[status] || map.PENDING;
  return <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 99, fontWeight: 600, background: bg, color }}>{label}</span>;
}

const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, color: '#000000', marginBottom: 7, letterSpacing: '0.07em' };

function formatCurrency(value) {
  return `CHF ${Number(value || 0).toFixed(0)}`;
}

export default function ClientsPage() {
  const { t, i18n } = useTranslation();
  const { showError, showSuccess, showWarning, showToast } = useAppFeedback();
  const isMobile = useMediaQuery('(max-width: 760px)');
  const [clients, setClients] = useState([]);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    heightCm: '',
    age: '',
    initialWeight: '',
    waistCircumferenceCm: '',
    birthDate: '',
    address: '',
    startDate: '',
    goal: '',
    gymExperience: '',
    motivation: '',
    activityAndWork: '',
    trainingAvailability: '',
    nutritionHabits: '',
    healthIssues: '',
    trainingPlanNotes: '',
    trainingFrequency: '',
    pricingMode: 'FIXED',
    packageId: '',
    monthlyPrice: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [creatingOnlineLink, setCreatingOnlineLink] = useState(false);
  const [showOnlineLinkModal, setShowOnlineLinkModal] = useState(false);
  const [generatedOnlineLink, setGeneratedOnlineLink] = useState('');
  const [copiedOnlineLink, setCopiedOnlineLink] = useState(false);
  const [extractingIntake, setExtractingIntake] = useState(false);
  const [intakeFile, setIntakeFile] = useState(null);

  const load = async () => {
    const results = await Promise.allSettled([
      clientsApi.list(),
      packagesApi.list(),
    ]);

    if (results[0].status === 'fulfilled') {
      setClients(results[0].value.data);
    }

    if (results[1].status === 'fulfilled') {
      setPackages(results[1].value.data);
    } else {
      setPackages([]);
    }

    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const payload = {
        ...form,
        language: i18n.language,
        packageId: form.pricingMode === 'PACKAGE' ? form.packageId : null,
        monthlyPrice: form.pricingMode === 'PACKAGE' ? undefined : form.monthlyPrice,
      };

      if (payload.packageId === '') payload.packageId = null;
      if (form.pricingMode === 'PACKAGE' && !payload.packageId) {
        throw new Error(t('clients.modal.packageRequired'));
      }

      await clientsApi.create(payload);
      setShowModal(false);
      setForm({
        name: '',
        email: '',
        phone: '',
        heightCm: '',
        age: '',
        initialWeight: '',
        waistCircumferenceCm: '',
        birthDate: '',
        address: '',
        startDate: '',
        goal: '',
        gymExperience: '',
        motivation: '',
        activityAndWork: '',
        trainingAvailability: '',
        nutritionHabits: '',
        healthIssues: '',
        trainingPlanNotes: '',
        trainingFrequency: '',
        pricingMode: 'FIXED',
        packageId: '',
        monthlyPrice: '',
        notes: '',
      });
      load();
    } catch (err) { showError(err.response?.data?.error || err.message || t('clients.errorCreate')); }
    finally { setSaving(false); }
  };

  const handleCreateOnlineLink = async () => {
    setCreatingOnlineLink(true);
    try {
      const response = await clientsApi.createOnlineLink({});
      const url = response.data?.publicUrl || '';
      setGeneratedOnlineLink(url);
      setCopiedOnlineLink(false);
      setShowOnlineLinkModal(true);
    } catch (err) {
      showError(err.response?.data?.error || 'Não foi possível gerar o link de cliente online.');
    } finally {
      setCreatingOnlineLink(false);
    }
  };

  const copyOnlineLink = async () => {
    if (!generatedOnlineLink) return;

    try {
      await navigator.clipboard.writeText(generatedOnlineLink);
      setCopiedOnlineLink(true);
      window.setTimeout(() => setCopiedOnlineLink(false), 1800);
    } catch {
      showToast(generatedOnlineLink, { title: 'Link' });
    }
  };

  const handleExtractIntake = async () => {
    if (!intakeFile) {
      showWarning(t('clients.modal.ai.selectFileError'));
      return;
    }

    setExtractingIntake(true);
    try {
      const formData = new FormData();
      formData.append('intakeFile', intakeFile);

      const response = await clientsApi.extractIntakeAi(formData);
      const extractedFields = response.data?.fields || {};

      setForm((prev) => {
        const next = { ...prev };
        for (const [key, value] of Object.entries(extractedFields)) {
          if (value === null || value === undefined || value === '') continue;
          next[key] = typeof value === 'number' ? String(value) : String(value);
        }
        return next;
      });

      showSuccess(t('clients.modal.ai.success', { count: response.data?.recognizedCount || 0 }));
    } catch (err) {
      showError(err.response?.data?.error || t('clients.modal.ai.error'));
    } finally {
      setExtractingIntake(false);
    }
  };

  const f = (k) => ({ value: form[k], onChange: e => setForm({ ...form, [k]: e.target.value }) });

  const rosterStats = useMemo(() => {
    const onlineClients = clients.filter((client) => client.isOnline).length;
    const clientsWithPackage = clients.filter((client) => Boolean(client.packageId || client.package)).length;
    const clientsNeedingAttention = clients.filter((client) => client.payments?.[0]?.status !== 'PAID').length;
    const monthlyRevenue = clients.reduce((total, client) => total + Number(client.monthlyPrice || 0), 0);
    return {
      onlineClients,
      clientsWithPackage,
      clientsNeedingAttention,
      monthlyRevenue,
    };
  }, [clients]);

  const sortedClients = useMemo(() => {
    const statusPriority = { OVERDUE: 0, PENDING: 1, PAID: 2 };
    return [...clients].sort((left, right) => {
      const leftStatus = left.payments?.[0]?.status || 'PENDING';
      const rightStatus = right.payments?.[0]?.status || 'PENDING';
      if (statusPriority[leftStatus] !== statusPriority[rightStatus]) {
        return statusPriority[leftStatus] - statusPriority[rightStatus];
      }
      return Number(right.monthlyPrice || 0) - Number(left.monthlyPrice || 0);
    });
  }, [clients]);

  if (loading) return <BrandLoadingScreen />;

  return (
    <div style={{ padding: isMobile ? '16px 14px 20px' : '28px 32px' }}>
      <section style={{
        background: 'linear-gradient(135deg, #10253C 0%, #1D3C5A 52%, #5682B1 100%)',
        borderRadius: 28,
        padding: isMobile ? '22px 18px' : '28px 30px',
        color: '#FFFFFF',
        boxShadow: '0 24px 50px rgba(16,37,60,0.24)',
        marginBottom: 18,
      }}>
        <div style={{ display: 'flex', alignItems: isMobile ? 'stretch' : 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexDirection: isMobile ? 'column' : 'row', gap: 16 }}>
          <div style={{ maxWidth: 720 }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#C8DBED', marginBottom: 12 }}>
              {t('clients.title')}
            </div>
            <h1 style={{ fontSize: isMobile ? 24 : 34, lineHeight: 1.05, fontWeight: 800, margin: 0 }}>
              {t('clients.activeCount', { count: clients.length })}
            </h1>
            <p style={{ fontSize: isMobile ? 14 : 16, lineHeight: 1.6, color: '#E4EFF9', margin: '14px 0 0', maxWidth: 620 }}>
              {t('clients.portfolioSummary', { amount: formatCurrency(rosterStats.monthlyRevenue), attention: rosterStats.clientsNeedingAttention })}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, width: isMobile ? '100%' : 'auto', flexDirection: isMobile ? 'column' : 'row' }}>
            <button onClick={handleCreateOnlineLink} disabled={creatingOnlineLink} style={{
              background: 'rgba(255,255,255,0.12)', color: '#FFFFFF',
              padding: '12px 16px', borderRadius: 14, fontSize: 13, fontWeight: 700, border: '1px solid rgba(255,255,255,0.18)',
              cursor: creatingOnlineLink ? 'not-allowed' : 'pointer',
              width: isMobile ? '100%' : 'auto',
              opacity: creatingOnlineLink ? 0.7 : 1,
            }}>
              {creatingOnlineLink ? t('clients.creatingOnlineLink') : t('clients.newOnlineClient')}
            </button>
            <button onClick={() => setShowModal(true)} style={{
              background: '#FFFFFF', color: '#10253C',
              padding: '12px 18px', borderRadius: 14, fontSize: 13, fontWeight: 800, border: 'none',
              cursor: 'pointer',
              width: isMobile ? '100%' : 'auto',
            }}>
              {t('clients.newClient')}
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
          {[
            { label: t('clients.monthlyRevenue'), value: formatCurrency(rosterStats.monthlyRevenue) },
            { label: t('clients.onlineClients'), value: rosterStats.onlineClients },
            { label: t('clients.clientsOnPackages'), value: rosterStats.clientsWithPackage },
            { label: t('clients.followUpNeeded'), value: rosterStats.clientsNeedingAttention },
          ].map((item) => (
            <div key={item.label} style={{ padding: '14px 16px', borderRadius: 18, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#C8DBED' }}>{item.label}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#FFFFFF', marginTop: 8 }}>{item.value}</div>
            </div>
          ))}
        </div>
      </section>

      <div style={{ ...card, display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', flexDirection: isMobile ? 'column' : 'row', gap: 10, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#10253C' }}>{t('clients.clientRoster')}</div>
          <div style={{ fontSize: 13, color: '#6B86A3', marginTop: 4 }}>{t('clients.clientRosterHint')}</div>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 999, background: '#F8FBFF', border: '1px solid rgba(159,189,217,0.28)', fontSize: 12, fontWeight: 700, color: '#10253C' }}>
          {t('clients.followUpNeeded')}: {rosterStats.clientsNeedingAttention}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {sortedClients.map((c) => {
          const payment = c.payments?.[0];
          const status = payment?.status || 'PENDING';
          return (
            <Link key={c.id} to={`/clients/${c.id}`}
              style={{ ...card, textDecoration: 'none', color: 'inherit', display: 'block', transition: 'box-shadow .2s, transform .2s', padding: '18px 20px', position: 'relative', overflow: 'hidden' }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 22px 46px rgba(16,37,60,0.12)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = card.boxShadow; e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <div style={{ position: 'absolute', inset: '0 auto auto 0', width: 6, height: '100%', background: status === 'PAID' ? '#2D7A47' : status === 'OVERDUE' ? '#C53131' : '#B66A17' }} />
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 18, marginLeft: 6 }}>
                <Avatar name={c.name} size={44} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontWeight: 800, fontSize: 16, color: '#10253C', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                    <PayBadge status={status} />
                  </div>
                  <div style={{ fontSize: 12, color: '#6B86A3', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.email}</div>
                  {c.isOnline ? (
                    <span style={{ display: 'inline-block', marginTop: 8, fontSize: 10, padding: '4px 9px', borderRadius: 99, fontWeight: 700, background: '#EAF8EF', color: '#2D7A47' }}>
                      {t('clients.onlineLabel')}
                    </span>
                  ) : null}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginLeft: 6 }}>
                {[
                  { label: t('clients.frequency'), val: c.trainingFrequency ? t('clients.freqPerWeek', { freq: c.trainingFrequency }) : '—' },
                  { label: t('clients.monthlyFee'), val: c.package ? `${c.package.name} · ${formatCurrency(c.monthlyPrice)}` : formatCurrency(c.monthlyPrice) },
                ].map(({ label, val }) => (
                  <div key={label} style={{ background: '#F8FBFF', borderRadius: 14, padding: '10px 12px', border: '1px solid rgba(159,189,217,0.2)' }}>
                    <div style={{ fontSize: 10, color: '#6B86A3', fontWeight: 700, marginBottom: 4, letterSpacing: '0.06em' }}>{label.toUpperCase()}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#10253C' }}>{val}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(159,189,217,0.2)', marginLeft: 6 }}>
                <div style={{ fontSize: 12, color: '#6B86A3' }}>
                  {c.goal || t('clients.noGoal')}
                </div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#5682B1' }}>{t('clients.openClient')}</div>
              </div>
            </Link>
          );
        })}
      </div>

      {clients.length === 0 && (
        <div style={{ ...card, textAlign: 'center', padding: isMobile ? '32px 20px' : '60px 40px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>👥</div>
          <p style={{ color: '#739EC9', marginBottom: 20, fontSize: 14 }}>{t('clients.noClients')}</p>
          <button onClick={() => setShowModal(true)} style={{
            background: 'linear-gradient(135deg, #5682B1 0%, #739EC9 100%)', color: '#FFFFFF',
            padding: '10px 24px', borderRadius: 10, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
          }}>{t('clients.createFirstClient')}</button>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
          backdropFilter: 'blur(4px)',
        }}>
          <div style={{ background: '#FFFFFF', borderRadius: isMobile ? '16px 16px 0 0' : 20, padding: isMobile ? '22px 16px 18px' : '32px 36px', width: '100%', maxWidth: isMobile ? '100%' : 480, boxShadow: '0 25px 50px rgba(0,0,0,0.25)', maxHeight: isMobile ? '92vh' : '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: '#000000' }}>{t('clients.modal.title')}</h2>
                <p style={{ fontSize: 12, color: '#739EC9', marginTop: 3 }}>{t('clients.modal.subtitle')}</p>
              </div>
              <button onClick={() => setShowModal(false)} style={{
                background: '#FFFFFF', border: 'none', width: 32, height: 32, borderRadius: 8,
                fontSize: 18, color: '#5682B1', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>×</button>
            </div>
            <form onSubmit={handleCreate}>
              <div style={{ marginBottom: 18, border: '1px dashed #739EC9', borderRadius: 10, padding: '12px 12px' }}>
                <label style={labelStyle}>{t('clients.modal.ai.title')}</label>
                <p style={{ marginTop: 0, marginBottom: 10, fontSize: 12, color: '#5682B1' }}>{t('clients.modal.ai.hint')}</p>
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={(e) => setIntakeFile(e.target.files?.[0] || null)}
                  style={{ marginBottom: 10 }}
                />
                <button
                  type="button"
                  onClick={handleExtractIntake}
                  disabled={extractingIntake}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid #739EC9',
                    background: '#FFFFFF',
                    color: '#5682B1',
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: extractingIntake ? 'not-allowed' : 'pointer',
                  }}
                >
                  {extractingIntake ? t('clients.modal.ai.processing') : t('clients.modal.ai.action')}
                </button>
              </div>

              {[
                [t('clients.modal.form.fullName'), 'text', 'name', t('clients.modal.placeholder.fullName'), true],
                [t('clients.modal.form.email'), 'email', 'email', t('clients.modal.placeholder.email'), true],
                [t('clients.modal.form.phone'), 'text', 'phone', t('clients.modal.placeholder.phone'), true],
                [t('clients.modal.form.heightCm'), 'number', 'heightCm', '180', true],
                [t('clients.modal.form.weightKg'), 'number', 'initialWeight', '82.5', true],
                [t('clients.modal.form.waistCm'), 'number', 'waistCircumferenceCm', '90', true],
                [t('clients.modal.form.birthDate'), 'date', 'birthDate', '', true],
                [t('clients.modal.form.address'), 'text', 'address', t('clients.modal.placeholder.address'), true],
                [t('clients.modal.startDate'), 'date', 'startDate', '', false],
                [t('clients.modal.age'), 'number', 'age', '28', false],
                [t('clients.modal.form.trainingFrequency'), 'number', 'trainingFrequency', '3', true],
              ].map(([label, type, key, ph, required]) => (
                <div key={key} style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>{label}</label>
                  <input
                    type={type}
                    placeholder={ph}
                    required={required}
                    step={['heightCm', 'initialWeight', 'waistCircumferenceCm'].includes(key) ? '0.1' : undefined}
                    {...f(key)}
                  />
                </div>
              ))}
              {[
                [t('clients.modal.form.gymExperience'), 'gymExperience', t('clients.modal.placeholder.gymExperience')],
                [t('clients.modal.form.goalQuestion'), 'goal', t('clients.modal.placeholder.goalQuestion')],
                [t('clients.modal.form.motivation'), 'motivation', t('clients.modal.placeholder.motivation')],
                [t('clients.modal.form.activityWork'), 'activityAndWork', t('clients.modal.placeholder.activityWork')],
                [t('clients.modal.form.trainingAvailability'), 'trainingAvailability', t('clients.modal.placeholder.trainingAvailability')],
                [t('clients.modal.form.nutritionHabits'), 'nutritionHabits', t('clients.modal.placeholder.nutritionHabits')],
                [t('clients.modal.form.healthIssues'), 'healthIssues', t('clients.modal.placeholder.healthIssues')],
                [t('clients.modal.form.trainingPlanNotes'), 'trainingPlanNotes', t('clients.modal.placeholder.trainingPlanNotes')],
              ].map(([label, key, placeholder]) => (
                <div key={key} style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>{label}</label>
                  <textarea
                    {...f(key)}
                    required
                    placeholder={placeholder}
                    rows={3}
                    style={{ resize: 'vertical' }}
                  />
                </div>
              ))}
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>{t('clients.modal.pricingType')}</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, pricingMode: 'FIXED', packageId: '' })}
                    style={{
                      border: form.pricingMode === 'FIXED' ? '1px solid #5682B1' : '1px solid #9FBDD9',
                      background: form.pricingMode === 'FIXED' ? '#EDF5FC' : '#FFFFFF',
                      color: '#2C4F73', borderRadius: 8, fontSize: 12, padding: '8px 12px', cursor: 'pointer',
                    }}
                  >
                    {t('clients.modal.fixedPrice')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, pricingMode: 'PACKAGE' })}
                    style={{
                      border: form.pricingMode === 'PACKAGE' ? '1px solid #5682B1' : '1px solid #9FBDD9',
                      background: form.pricingMode === 'PACKAGE' ? '#EDF5FC' : '#FFFFFF',
                      color: '#2C4F73', borderRadius: 8, fontSize: 12, padding: '8px 12px', cursor: 'pointer',
                    }}
                  >
                    {t('clients.modal.packagePrice')}
                  </button>
                </div>
              </div>
              {form.pricingMode === 'FIXED' ? (
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>{t('clients.modal.monthlyPrice')}</label>
                  <input type="number" placeholder="150" required step="0.01" min="0" {...f('monthlyPrice')} />
                </div>
              ) : (
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>{t('clients.modal.package')}</label>
                  <select
                    value={form.packageId}
                    onChange={(e) => setForm({ ...form, packageId: e.target.value })}
                    required
                  >
                    <option value="">{t('clients.modal.selectPackage')}</option>
                    {packages.map((pkg) => (
                      <option key={pkg.id} value={pkg.id}>{pkg.name} - CHF {Number(pkg.monthlyPrice || 0).toFixed(2)}</option>
                    ))}
                  </select>
                  {packages.length === 0 && (
                    <p style={{ marginTop: 8, fontSize: 12, color: '#9F4A4A' }}>{t('clients.modal.noPackagesHint')}</p>
                  )}
                </div>
              )}
              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>{t('clients.modal.notes')}</label>
                <textarea {...f('notes')} placeholder={t('clients.modal.notesPlaceholder')} rows={3} style={{ resize: 'vertical' }} />
              </div>
              <div style={{ fontSize: 12, color: '#5682B1', marginBottom: 20, background: '#FFFFFF', padding: '10px 14px', borderRadius: 8, fontWeight: 500 }}>
                {t('clients.modal.defaultPasswordNote')} <strong>fitcoach123</strong> {t('clients.modal.defaultPasswordSuffix')}
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexDirection: isMobile ? 'column-reverse' : 'row' }}>
                <button type="button" onClick={() => setShowModal(false)} style={{
                  padding: '10px 18px', border: '1.5px solid #739EC9', borderRadius: 10,
                  background: 'none', fontSize: 13, fontWeight: 500, color: '#5682B1', cursor: 'pointer',
                  width: isMobile ? '100%' : 'auto',
                }}>{t('clients.modal.cancel')}</button>
                <button type="submit" disabled={saving} style={{
                  padding: '10px 22px',
                  background: saving ? '#739EC9' : 'linear-gradient(135deg, #5682B1 0%, #739EC9 100%)',
                  color: '#FFFFFF', border: 'none', borderRadius: 10,
                  fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
                  width: isMobile ? '100%' : 'auto',
                }}>
                  {saving ? t('clients.modal.creating') : t('clients.modal.create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showOnlineLinkModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 55,
          backdropFilter: 'blur(4px)',
          padding: isMobile ? '12px' : '20px',
        }}>
          <div style={{
            background: '#FFFFFF', borderRadius: 18, width: '100%', maxWidth: 560,
            boxShadow: '0 25px 50px rgba(0,0,0,0.25)', border: '1px solid #D7E3F0',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '18px 20px 0' }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 800, color: '#000000' }}>Link de cliente online</h3>
                <p style={{ marginTop: 6, fontSize: 13, color: '#5682B1' }}>
                  Envia este link ao cliente para preencher o formulário de onboarding.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowOnlineLinkModal(false)}
                style={{ background: '#FFFFFF', border: 'none', width: 32, height: 32, borderRadius: 8, fontSize: 18, color: '#5682B1', cursor: 'pointer' }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: '16px 20px 20px' }}>
              <div style={{ border: '1px solid #D7E3F0', borderRadius: 12, background: '#F8FBFF', padding: '10px 12px', marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: '#5682B1', marginBottom: 4, fontWeight: 700 }}>LINK</div>
                <div style={{ fontSize: 12, color: '#2C4F73', lineHeight: 1.5, wordBreak: 'break-all' }}>{generatedOnlineLink || '—'}</div>
              </div>

              <div style={{ display: 'flex', gap: 10, flexDirection: isMobile ? 'column' : 'row' }}>
                <button
                  type="button"
                  onClick={copyOnlineLink}
                  disabled={!generatedOnlineLink}
                  style={{
                    flex: 1,
                    minHeight: 42,
                    borderRadius: 10,
                    border: 'none',
                    background: 'linear-gradient(135deg, #5682B1 0%, #739EC9 100%)',
                    color: '#FFFFFF',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: generatedOnlineLink ? 'pointer' : 'not-allowed',
                    opacity: generatedOnlineLink ? 1 : 0.6,
                  }}
                >
                  {copiedOnlineLink ? 'Copiado' : 'Copiar link'}
                </button>

                <button
                  type="button"
                  onClick={() => generatedOnlineLink && window.open(generatedOnlineLink, '_blank', 'noopener,noreferrer')}
                  disabled={!generatedOnlineLink}
                  style={{
                    flex: 1,
                    minHeight: 42,
                    borderRadius: 10,
                    border: '1px solid #739EC9',
                    background: '#FFFFFF',
                    color: '#5682B1',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: generatedOnlineLink ? 'pointer' : 'not-allowed',
                    opacity: generatedOnlineLink ? 1 : 0.6,
                  }}
                >
                  Abrir link
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


import { useEffect, useState } from 'react';
import { packagesApi } from '../services/api';
import { useTranslation } from 'react-i18next';
import useMediaQuery from '../hooks/useMediaQuery';
import BrandLoadingScreen from '../components/ui/BrandLoadingScreen';
import { useAppFeedback } from '../components/ui/FeedbackProvider';

const card = {
  background: '#FFFFFF',
  borderRadius: 16,
  padding: '20px 24px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
};

const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, color: '#000000', marginBottom: 7, letterSpacing: '0.07em' };

const emptyForm = {
  name: '',
  description: '',
  monthlyPrice: '',
  sessionsPerWeek: '',
  sessionsPerMonth: '',
  hasOnlineSupport: true,
};

export default function PackagesPage() {
  const { t } = useTranslation();
  const { confirm, showError } = useAppFeedback();
  const isMobile = useMediaQuery('(max-width: 760px)');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = () => packagesApi.list().then((r) => setItems(r.data)).finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const f = (k) => ({
    value: form[k],
    onChange: (e) => setForm({ ...form, [k]: e.target.value }),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (pkg) => {
    setEditing(pkg);
    setForm({
      name: pkg.name || '',
      description: pkg.description || '',
      monthlyPrice: pkg.monthlyPrice ?? '',
      sessionsPerWeek: pkg.sessionsPerWeek ?? '',
      sessionsPerMonth: pkg.sessionsPerMonth ?? '',
      hasOnlineSupport: pkg.hasOnlineSupport !== false,
    });
    setShowModal(true);
  };

  const onSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        monthlyPrice: parseFloat(form.monthlyPrice),
        sessionsPerWeek: form.sessionsPerWeek === '' ? null : Number(form.sessionsPerWeek),
        sessionsPerMonth: form.sessionsPerMonth === '' ? null : Number(form.sessionsPerMonth),
      };
      if (editing?.id) await packagesApi.update(editing.id, payload);
      else await packagesApi.create(payload);
      setShowModal(false);
      setEditing(null);
      setForm(emptyForm);
      load();
    } catch (err) {
      showError(err.response?.data?.error || t('packages.errorSave'));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (pkg) => {
    if (!(await confirm(t('packages.confirmDelete', { name: pkg.name })))) return;
    try {
      await packagesApi.delete(pkg.id);
      load();
    } catch (err) {
      showError(err.response?.data?.error || t('packages.errorDelete'));
    }
  };

  if (loading) return <BrandLoadingScreen />;

  return (
    <div style={{ padding: isMobile ? '16px 14px 20px' : '28px 32px' }}>
      <div style={{ display: 'flex', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between', marginBottom: 24, flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 12 : 16 }}>
        <div>
          <h1 style={{ fontSize: isMobile ? 20 : 22, fontWeight: 700, color: '#000000', letterSpacing: '-0.5px' }}>{t('packages.title')}</h1>
          <p style={{ fontSize: 13, color: '#739EC9', marginTop: 4 }}>{t('packages.subtitle')}</p>
        </div>
        <button
          onClick={openCreate}
          style={{
            background: 'linear-gradient(135deg, #5682B1 0%, #739EC9 100%)', color: '#FFFFFF',
            padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600, border: 'none',
            boxShadow: '0 4px 12px rgba(86,130,177,0.3)', cursor: 'pointer', width: isMobile ? '100%' : 'auto',
          }}
        >
          {t('packages.newPackage')}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
        {items.map((pkg) => (
          <div key={pkg.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: '#000000' }}>{pkg.name}</div>
                <div style={{ marginTop: 4, fontSize: 12, color: '#5682B1' }}>CHF {Number(pkg.monthlyPrice || 0).toFixed(2)} {t('packages.monthly')}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => openEdit(pkg)} style={{ border: '1px solid #9FBDD9', color: '#000000', background: '#FFFFFF', borderRadius: 8, fontSize: 12, padding: '6px 10px', cursor: 'pointer' }}>{t('common.edit')}</button>
                <button onClick={() => onDelete(pkg)} style={{ border: '1px solid #D9A2A2', color: '#9F4A4A', background: '#FFFFFF', borderRadius: 8, fontSize: 12, padding: '6px 10px', cursor: 'pointer' }}>{t('packages.delete')}</button>
              </div>
            </div>
            {pkg.description && <p style={{ marginTop: 10, marginBottom: 0, fontSize: 13, color: '#3A4F63' }}>{pkg.description}</p>}
            <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {pkg.sessionsPerWeek ? <span style={{ fontSize: 11, padding: '4px 8px', borderRadius: 99, background: '#EDF5FC', color: '#2C4F73' }}>{pkg.sessionsPerWeek}x {t('packages.perWeek')}</span> : null}
              {pkg.sessionsPerMonth ? <span style={{ fontSize: 11, padding: '4px 8px', borderRadius: 99, background: '#EDF5FC', color: '#2C4F73' }}>{pkg.sessionsPerMonth}x {t('packages.perMonth')}</span> : null}
              {pkg.hasOnlineSupport ? <span style={{ fontSize: 11, padding: '4px 8px', borderRadius: 99, background: '#EDF5FC', color: '#2C4F73' }}>{t('packages.onlineSupport')}</span> : null}
            </div>
          </div>
        ))}
      </div>

      {items.length === 0 && (
        <div style={{ ...card, textAlign: 'center', padding: isMobile ? '32px 20px' : '60px 40px', marginTop: 14 }}>
          <p style={{ color: '#739EC9', marginBottom: 20, fontSize: 14 }}>{t('packages.noPackages')}</p>
          <button onClick={openCreate} style={{
            background: 'linear-gradient(135deg, #5682B1 0%, #739EC9 100%)', color: '#FFFFFF',
            padding: '10px 24px', borderRadius: 10, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
          }}>{t('packages.createFirst')}</button>
        </div>
      )}

      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, backdropFilter: 'blur(4px)',
        }}>
          <div style={{ background: '#FFFFFF', borderRadius: isMobile ? '16px 16px 0 0' : 20, padding: isMobile ? '22px 16px 18px' : '32px 36px', width: '100%', maxWidth: isMobile ? '100%' : 520, boxShadow: '0 25px 50px rgba(0,0,0,0.25)', maxHeight: isMobile ? '92vh' : '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: '#000000' }}>{editing ? t('packages.modal.editTitle') : t('packages.modal.createTitle')}</h2>
                <p style={{ fontSize: 12, color: '#739EC9', marginTop: 3 }}>{t('packages.modal.subtitle')}</p>
              </div>
              <button onClick={() => setShowModal(false)} style={{
                background: '#FFFFFF', border: 'none', width: 32, height: 32, borderRadius: 8,
                fontSize: 18, color: '#5682B1', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>×</button>
            </div>
            <form onSubmit={onSave}>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>{t('packages.modal.name')}</label>
                <input type="text" placeholder={t('packages.modal.namePlaceholder')} {...f('name')} required />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>{t('packages.modal.monthlyPrice')}</label>
                <input type="number" step="0.01" min="0" placeholder="450" {...f('monthlyPrice')} required />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>{t('packages.modal.sessionsPerWeek')}</label>
                <input type="number" min="0" placeholder="1" {...f('sessionsPerWeek')} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>{t('packages.modal.sessionsPerMonth')}</label>
                <input type="number" min="0" placeholder="4" {...f('sessionsPerMonth')} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>{t('packages.modal.description')}</label>
                <textarea {...f('description')} placeholder={t('packages.modal.descriptionPlaceholder')} rows={3} style={{ resize: 'vertical' }} />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#2C4F73', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={!!form.hasOnlineSupport}
                    onChange={(e) => setForm({ ...form, hasOnlineSupport: e.target.checked })}
                  />
                  {t('packages.modal.onlineSupport')}
                </label>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexDirection: isMobile ? 'column-reverse' : 'row' }}>
                <button type="button" onClick={() => setShowModal(false)} style={{
                  padding: '10px 18px', border: '1.5px solid #739EC9', borderRadius: 10,
                  background: 'none', fontSize: 13, fontWeight: 500, color: '#5682B1', cursor: 'pointer', width: isMobile ? '100%' : 'auto',
                }}>{t('common.cancel')}</button>
                <button type="submit" disabled={saving} style={{
                  padding: '10px 22px',
                  background: saving ? '#739EC9' : 'linear-gradient(135deg, #5682B1 0%, #739EC9 100%)',
                  color: '#FFFFFF', border: 'none', borderRadius: 10,
                  fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', width: isMobile ? '100%' : 'auto',
                }}>
                  {saving ? t('packages.modal.saving') : (editing ? t('packages.modal.update') : t('packages.modal.create'))}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

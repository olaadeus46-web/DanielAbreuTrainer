import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import useMediaQuery from '../hooks/useMediaQuery';
import { useAppFeedback } from '../components/ui/FeedbackProvider';
import { automationsApi, clientsApi } from '../services/api';
import BrandLoadingScreen from '../components/ui/BrandLoadingScreen';

const card = {
  background: '#FFFFFF',
  borderRadius: 20,
  padding: '20px 24px',
  boxShadow: '0 18px 40px rgba(16,37,60,0.08)',
  border: '1px solid rgba(159,189,217,0.24)',
};

const label = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  color: '#10253C',
  marginBottom: 7,
  letterSpacing: '0.07em',
};

const input = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 13px',
  borderRadius: 10,
  border: '1.5px solid #C0D8EE',
  fontSize: 13.5,
  outline: 'none',
  fontFamily: 'inherit',
  background: '#FBFDFF',
  color: '#11253E',
};

const textarea = {
  ...input,
  minHeight: 180,
  resize: 'vertical',
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
};

const btn = (variant = 'primary') => ({
  padding: '9px 20px',
  borderRadius: 10,
  border: 'none',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  transition: 'opacity .15s',
  ...(variant === 'primary'
    ? { background: 'linear-gradient(135deg, #10253C, #2C4F73)', color: '#FFFFFF' }
    : variant === 'danger'
      ? { background: 'linear-gradient(135deg, #C53131, #E05757)', color: '#FFFFFF' }
      : { background: '#F0F4F8', color: '#10253C', border: '1px solid #C0D8EE' }),
});

function ResultsModal({ results, onClose }) {
  const { t } = useTranslation();
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div style={{ ...card, maxWidth: 500, width: '90%', maxHeight: '70vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>{t('automations.results.title')}</h3>
        {results.map((result, index) => (
          <div key={index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #EEF3F8' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{result.clientName}</div>
              <div style={{ fontSize: 11, color: '#5682B1' }}>{result.email || '—'}</div>
              {result.error && <div style={{ fontSize: 11, color: '#C53131', marginTop: 2 }}>{result.error}</div>}
            </div>
            <span
              style={{
                fontSize: 10,
                padding: '3px 9px',
                borderRadius: 99,
                fontWeight: 700,
                background: result.status === 'sent' ? '#EAF8EF' : result.status === 'skipped' ? '#FFF8E1' : '#FDECEC',
                color: result.status === 'sent' ? '#2D7A47' : result.status === 'skipped' ? '#B45309' : '#C53131',
              }}
            >
              {result.status === 'sent' ? t('automations.results.sent') : result.status === 'skipped' ? t('automations.results.skipped') : t('automations.results.failed')}
            </span>
          </div>
        ))}
        <button type="button" style={{ ...btn('secondary'), marginTop: 18, width: '100%' }} onClick={onClose}>
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}

function buildDefaultMessageTemplate(t, type, isFollowUp = false) {
  if (type === 'FEEDBACK') {
    return t(isFollowUp ? 'automations.templates.feedbackFollowUp' : 'automations.templates.feedback');
  }
  if (type === 'MESSAGE_ONLY') {
    return t(isFollowUp ? 'automations.templates.messageOnlyFollowUp' : 'automations.templates.messageOnly');
  }
  return t(isFollowUp ? 'automations.templates.checkInFollowUp' : 'automations.templates.checkIn');
}

function buildDefaultSubject(t, type) {
  if (type === 'FEEDBACK') return t('automations.defaultSubjects.feedback');
  if (type === 'MESSAGE_ONLY') return t('automations.defaultSubjects.messageOnly');
  return t('automations.defaultSubjects.checkIn');
}

function normalizeTemplateLanguage(language) {
  return ['pt', 'en', 'de'].includes(language) ? language : 'en';
}

function GmailBanner({ gmailStatus, onConnect, onDisconnect }) {
  const { t } = useTranslation();
  const [connecting, setConnecting] = useState(false);

  async function handleConnect() {
    setConnecting(true);
    try {
      await onConnect();
    } finally {
      setConnecting(false);
    }
  }

  if (gmailStatus?.connected) {
    return (
      <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 20px', marginBottom: 14, background: '#EAF8EF', border: '1px solid #9FD7B1' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1F6A3A' }}>{t('automations.gmail.connected')}</div>
          <div style={{ fontSize: 12, color: '#2D7A47', marginTop: 2 }}>{gmailStatus.email}</div>
        </div>
        <button type="button" style={{ ...btn('secondary'), fontSize: 11, padding: '6px 14px' }} onClick={onDisconnect}>
          {t('automations.gmail.disconnect')}
        </button>
      </div>
    );
  }

  return (
    <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 20px', marginBottom: 14, background: '#FFF8E1', border: '1px solid #F3D690' }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#8A5A00' }}>{t('automations.gmail.notConnected')}</div>
        <div style={{ fontSize: 12, color: '#B45309', marginTop: 2 }}>{t('automations.gmail.notConnectedHint')}</div>
      </div>
      <button type="button" style={{ ...btn('primary'), fontSize: 12, padding: '8px 18px' }} onClick={handleConnect} disabled={connecting}>
        {connecting ? t('automations.gmail.connecting') : t('automations.gmail.connect')}
      </button>
    </div>
  );
}

function CreateModal({ clients, automation, parentAutomation, onClose, onSaved }) {
  const { t, i18n } = useTranslation();
  const { showError } = useAppFeedback();
  const fileInputRef = useRef(null);
  const isEditing = !!automation;
  const followUpParent = parentAutomation || null;
  const isFollowUp = !!(automation?.parentAutomationId || followUpParent?.id);
  const initialType = automation?.type || followUpParent?.type || 'MESSAGE_ONLY';
  const [templateLanguage, setTemplateLanguage] = useState(normalizeTemplateLanguage(i18n.language));
  const templateT = i18n.getFixedT(templateLanguage);
  const initialDefaultTemplate = buildDefaultMessageTemplate(templateT, initialType, isFollowUp);
  const [form, setForm] = useState({
    name: automation?.name || '',
    type: initialType,
    sendMode: automation?.sendMode || (isFollowUp ? 'SCHEDULED' : 'IMMEDIATE'),
    scheduledAt: automation?.scheduledAt ? automation.scheduledAt.slice(0, 16) : '',
    messageTemplate: automation?.messageTemplate || initialDefaultTemplate,
    subject: automation?.subject || buildDefaultSubject(templateT, initialType),
  });
  const [selectedIds, setSelectedIds] = useState(automation?.clientIds || followUpParent?.clientIds || []);
  const [attachments, setAttachments] = useState(automation?.attachments || []);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lastDefaultTemplate, setLastDefaultTemplate] = useState(initialDefaultTemplate);

  const clientsWithEmail = clients.filter((c) => c.email);

  function setType(nextType) {
    const nextDefault = buildDefaultMessageTemplate(templateT, nextType, isFollowUp);
    setForm((prev) => ({
      ...prev,
      type: nextType,
      subject: buildDefaultSubject(templateT, nextType),
      messageTemplate: !prev.messageTemplate || prev.messageTemplate === lastDefaultTemplate ? nextDefault : prev.messageTemplate,
    }));
    setLastDefaultTemplate(nextDefault);
  }

  useEffect(() => {
    const nextDefault = buildDefaultMessageTemplate(templateT, form.type, isFollowUp);
    setForm((prev) => ({
      ...prev,
      messageTemplate: !prev.messageTemplate || prev.messageTemplate === lastDefaultTemplate ? nextDefault : prev.messageTemplate,
    }));
    setLastDefaultTemplate(nextDefault);
  }, [form.type, isFollowUp, templateLanguage]);

  function toggleClient(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleAll() {
    if (selectedIds.length === clientsWithEmail.length) setSelectedIds([]);
    else setSelectedIds(clientsWithEmail.map((client) => client.id));
  }

  async function handleFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await automationsApi.uploadAttachment(formData);
      setAttachments((prev) => [...prev, response.data]);
    } catch {
      showError(t('automations.modal.uploadError'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function removeAttachment(index) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!selectedIds.length) {
      showError(t('automations.modal.noClientsHint'));
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name,
        type: form.type,
        sendMode: form.sendMode,
        scheduledAt: form.sendMode === 'SCHEDULED' && form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined,
        clientIds: selectedIds,
        messageTemplate: form.messageTemplate,
        subject: form.subject,
        attachments,
        parentAutomationId: automation?.parentAutomationId || followUpParent?.id || undefined,
      };
      const response = isEditing ? await automationsApi.update(automation.id, payload) : await automationsApi.create(payload);
      onSaved(response.data);
    } catch {
      showError(t(isEditing ? 'automations.updateError' : 'automations.createError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)' }}>
      <div style={{ ...card, maxWidth: 560, width: '92%', maxHeight: '88vh', overflow: 'auto' }} onClick={(event) => event.stopPropagation()}>
        <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 700 }}>
          {t(isEditing ? 'automations.modal.editTitle' : isFollowUp ? 'automations.modal.followUpTitle' : 'automations.modal.title')}
        </h3>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: '#5682B1' }}>
          {t(isFollowUp
            ? (followUpParent && !followUpParent.sentAt ? 'automations.modal.followUpPendingSubtitle' : 'automations.modal.followUpSubtitle')
            : 'automations.modal.subtitle')}
        </p>

        {isFollowUp && followUpParent ? (
          <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 12, background: '#F7FBFF', border: '1px solid #DCE9F5', fontSize: 12.5, color: '#10253C' }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{t('automations.modal.parentAutomationLabel')}</div>
            <div>{followUpParent.name}</div>
            {followUpParent.sentAt ? (
              <div style={{ color: '#5682B1', marginTop: 4 }}>{t('automations.modal.parentAutomationSentAt', { date: new Date(followUpParent.sentAt).toLocaleString() })}</div>
            ) : (
              <div style={{ color: '#B45309', marginTop: 4 }}>{t('automations.modal.parentAutomationPending', { date: followUpParent.scheduledAt ? new Date(followUpParent.scheduledAt).toLocaleString() : '' })}</div>
            )}
          </div>
        ) : null}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <span style={label}>{t('automations.modal.name')}</span>
            <input style={input} required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={t('automations.modal.namePlaceholder')} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <span style={label}>{t('automations.modal.sendMode')}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {['IMMEDIATE', 'SCHEDULED'].map((value) => (
                <button
                  key={value}
                  type="button"
                  style={{
                    flex: 1,
                    padding: '9px 12px',
                    borderRadius: 9,
                    border: '1.5px solid',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all .15s',
                    borderColor: form.sendMode === value ? '#2C4F73' : '#C0D8EE',
                    background: form.sendMode === value ? 'linear-gradient(135deg,#10253C,#2C4F73)' : '#FBFDFF',
                    color: form.sendMode === value ? '#FFFFFF' : '#10253C',
                  }}
                  onClick={() => setForm({ ...form, sendMode: value })}
                >
                  {t(`automations.sendMode.${value}`)}
                </button>
              ))}
            </div>
          </div>

          {form.sendMode === 'SCHEDULED' && (
            <div style={{ marginBottom: 16 }}>
              <span style={label}>{t('automations.modal.scheduleDate')}</span>
              <input type="datetime-local" style={input} required value={form.scheduledAt} onChange={(event) => setForm({ ...form, scheduledAt: event.target.value })} />
              <p style={{ margin: '5px 0 0', fontSize: 11.5, color: '#5682B1' }}>
                {t('automations.modal.scheduleDateHint')}
              </p>
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <span style={label}>{t('automations.modal.subject')}</span>
            <input style={input} required value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} placeholder={t('automations.modal.subjectPlaceholder')} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
              <span style={label}>{t('automations.modal.message')}</span>
              <button
                type="button"
                onClick={() => {
                  const nextDefault = buildDefaultMessageTemplate(templateT, form.type, isFollowUp);
                  setForm((prev) => ({ ...prev, messageTemplate: nextDefault }));
                  setLastDefaultTemplate(nextDefault);
                }}
                style={{ fontSize: 11, fontWeight: 600, color: '#2C4F73', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                {t('automations.modal.resetMessage')}
              </button>
            </div>

            <div style={{ marginBottom: 10 }}>
              <span style={label}>{t('automations.modal.templateLanguage')}</span>
              <select style={input} value={templateLanguage} onChange={(event) => setTemplateLanguage(normalizeTemplateLanguage(event.target.value))}>
                <option value="pt">{t('automations.modal.templateLanguageOptions.pt')}</option>
                <option value="en">{t('automations.modal.templateLanguageOptions.en')}</option>
                <option value="de">{t('automations.modal.templateLanguageOptions.de')}</option>
              </select>
            </div>

            <textarea style={textarea} required value={form.messageTemplate} onChange={(event) => setForm({ ...form, messageTemplate: event.target.value })} placeholder={t('automations.modal.messagePlaceholder')} />
            <p style={{ margin: '5px 0 0', fontSize: 11.5, color: '#5682B1' }}>
              {form.type === 'MESSAGE_ONLY' ? t('automations.modal.messageHintMessageOnly') : t('automations.modal.messageHint')}
            </p>
          </div>

          <div style={{ marginBottom: 16 }}>
            <span style={label}>{t('automations.modal.attachments')}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {attachments.map((att, index) => (
                <div key={index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: '#F7FBFF', border: '1px solid #DCE9F5' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#10253C', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                    {att.originalName || att.filename}
                  </div>
                  <button type="button" onClick={() => removeAttachment(index)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C53131', fontSize: 14, padding: '2px 6px', fontWeight: 700 }}>
                    x
                  </button>
                </div>
              ))}
              <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileUpload} />
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                style={{ ...btn('secondary'), fontSize: 12, textAlign: 'center' }}
              >
                {uploading ? t('automations.modal.uploading') : t('automations.modal.addAttachment')}
              </button>
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={label}>{t('automations.modal.clients')}</span>
              <button type="button" onClick={toggleAll} style={{ fontSize: 11, fontWeight: 600, color: '#2C4F73', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                {selectedIds.length === clientsWithEmail.length ? t('automations.modal.deselectAll') : t('automations.modal.selectAll')}
              </button>
            </div>

            {clientsWithEmail.length === 0 ? (
              <p style={{ fontSize: 13, color: '#B45309', background: '#FFF8E1', padding: '10px 14px', borderRadius: 9 }}>
                {t('automations.modal.noClientsHint')}
              </p>
            ) : (
              <div style={{ maxHeight: 200, overflow: 'auto', border: '1.5px solid #C0D8EE', borderRadius: 9 }}>
                {clientsWithEmail.map((client) => {
                  const checked = selectedIds.includes(client.id);
                  return (
                    <label
                      key={client.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '9px 14px',
                        cursor: 'pointer',
                        background: checked ? 'rgba(86,130,177,0.07)' : 'transparent',
                        borderBottom: '1px solid #EEF3F8',
                      }}
                    >
                      <input type="checkbox" checked={checked} onChange={() => toggleClient(client.id)} style={{ accentColor: '#2C4F73', width: 15, height: 15 }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#11253E' }}>{client.name}</div>
                        <div style={{ fontSize: 11, color: '#5682B1' }}>{client.email}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" style={{ ...btn('secondary'), flex: 1 }} onClick={onClose}>{t('automations.modal.cancel')}</button>
            <button type="submit" style={{ ...btn('primary'), flex: 2 }} disabled={saving}>
              {saving ? t(isEditing ? 'automations.modal.saving' : 'automations.modal.creating') : t(isEditing ? 'automations.modal.save' : 'automations.modal.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AutomationCard({ automation, parentAutomation, onDeleted, onExecuted, onEdit, onCreateFollowUp, isNestedFollowUp = false }) {
  const { t, i18n } = useTranslation();
  const { confirm, showError } = useAppFeedback();
  const [executing, setExecuting] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const formatDate = (iso) => (iso ? new Date(iso).toLocaleString(i18n.language === 'pt' ? 'pt-PT' : i18n.language === 'de' ? 'de-DE' : 'en-GB') : '—');

  async function handleDelete() {
    if (!(await confirm(t('automations.deleteConfirm', { name: automation.name })))) return;
    try {
      await automationsApi.delete(automation.id);
      onDeleted(automation.id);
    } catch {
      showError(t('automations.deleteError'));
    }
  }

  async function handleExecute() {
    setExecuting(true);
    try {
      const response = await automationsApi.execute(automation.id);
      onExecuted(response.data);
      setShowResults(true);
    } catch {
      showError(t('automations.executeError'));
    } finally {
      setExecuting(false);
    }
  }

  const results = automation.results || [];
  const isFollowUp = !!automation.parentAutomationId;
  const formLabel = automation.type === 'FEEDBACK' ? t('automations.type.FEEDBACK') : automation.type === 'MESSAGE_ONLY' ? t('automations.type.MESSAGE_ONLY') : t('automations.type.CHECK_IN');
  const attachmentCount = Array.isArray(automation.attachments) ? automation.attachments.length : 0;

  return (
    <>
      <div
        style={{
          ...card,
          padding: '18px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          border: isNestedFollowUp ? '1px solid #9FBDD9' : '1px solid rgba(159,189,217,0.24)',
          boxShadow: isNestedFollowUp ? '0 10px 20px rgba(17,37,62,0.08)' : card.boxShadow,
          background: isNestedFollowUp ? 'linear-gradient(180deg, #F7FBFF 0%, #FCFEFF 100%)' : '#FFFFFF',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.02em',
              background: automation.status === 'SENT' ? '#DDF4E6' : '#EEF3F8',
              color: automation.status === 'SENT' ? '#1F6A3A' : '#204667',
              border: automation.status === 'SENT' ? '1px solid #9FD7B1' : '1px solid #CFE0F1',
            }}
          >
            <span>{t('automations.type.' + automation.type)}</span>
            <span style={{ opacity: 0.45 }}>|</span>
            <span>{t('automations.status.' + automation.status, automation.status)}</span>
          </div>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 10, background: '#EDF4FF', border: '1px solid #B8D4F0', color: '#1F4B72', fontSize: 11, fontWeight: 800 }}>
            {automation.type === 'MESSAGE_ONLY' ? (
              <span>{t('automations.type.MESSAGE_ONLY')}</span>
            ) : (
              <>
                <span>{t('automations.formSent')}</span>
                <span style={{ opacity: 0.45 }}>|</span>
                <span>{formLabel}</span>
              </>
            )}
          </div>
        </div>

        {isFollowUp && parentAutomation ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: '#E8F2FB', border: '1px solid #BFD7EC', color: '#1F4B72', fontSize: 12, fontWeight: 700 }}>
            <span>{t('automations.followUpBadge')}</span>
            <span style={{ opacity: 0.55 }}>|</span>
            <span>{t('automations.followUpFrom', { name: parentAutomation.name })}</span>
          </div>
        ) : null}

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#11253E' }}>{automation.name}</div>

            <div style={{ fontSize: 12, color: '#6B86A3', marginTop: 4 }}>
              {t('automations.clients', { count: (automation.clientIds || []).length })}
              {attachmentCount > 0 && ` · ${t('automations.attachmentCount', { count: attachmentCount })}`}
              {' · '}
              {automation.status === 'SENT' && automation.sentAt
                ? t('automations.sentAt', { date: formatDate(automation.sentAt) })
                : automation.scheduledAt && automation.status === 'PENDING'
                  ? t('automations.scheduledFor', { date: formatDate(automation.scheduledAt) })
                  : t(`automations.sendMode.${automation.sendMode}`)}
            </div>

            {automation.subject && (
              <div style={{ fontSize: 12, color: '#5682B1', marginTop: 2 }}>
                {t('automations.subjectLabel')}: {automation.subject}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              style={{
                ...btn('secondary'),
                fontSize: 11,
                padding: '7px 10px',
                borderRadius: 8,
                minWidth: 86,
              }}
            >
              {expanded ? t('automations.hideDetails') : t('automations.viewDetails')}
            </button>
            <button type="button" onClick={handleDelete} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C53131', fontSize: 16, padding: '2px 4px' }}>
              x
            </button>
          </div>
        </div>

        {expanded && !!automation.messageTemplate && (
          <div style={{ fontSize: 12, color: '#10253C', marginTop: -2, background: '#F7FBFF', border: '1px solid #DCE9F5', borderRadius: 10, padding: '10px 12px', whiteSpace: 'pre-wrap' }}>
            {automation.messageTemplate}
          </div>
        )}

        {expanded && results.length > 0 && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {['sent', 'failed', 'skipped'].map((status) => {
              const count = results.filter((result) => result.status === status).length;
              if (!count) return null;
              const colors = {
                sent: ['#EAF8EF', '#2D7A47'],
                failed: ['#FDECEC', '#C53131'],
                skipped: ['#FFF8E1', '#B45309'],
              };
              return (
                <span key={status} style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 99, background: colors[status][0], color: colors[status][1] }}>
                  {t(`automations.results.${status}`)}: {count}
                </span>
              );
            })}
            <button type="button" onClick={() => setShowResults(true)} style={{ fontSize: 11, fontWeight: 700, color: '#2C4F73', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              {t('automations.results.title')} {'>'}
            </button>
          </div>
        )}

        {expanded && automation.status === 'PENDING' && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" style={{ ...btn('secondary'), fontSize: 12, flex: 1 }} onClick={() => onEdit(automation)}>
              {t('automations.edit')}
            </button>
            <button type="button" style={{ ...btn('primary'), fontSize: 12, flex: 1 }} onClick={handleExecute} disabled={executing}>
              {executing ? t('automations.sending') : t('automations.sendNow')}
            </button>
          </div>
        )}

        {expanded && (automation.status === 'SENT' || automation.status === 'PENDING') && !automation.parentAutomationId && (
          <button type="button" style={{ ...btn('secondary'), fontSize: 12 }} onClick={() => onCreateFollowUp(automation)}>
            {t('automations.createFollowUp')}
          </button>
        )}
      </div>

      {showResults && results.length > 0 && <ResultsModal results={results} onClose={() => setShowResults(false)} />}
    </>
  );
}

function WelcomeEmailConfigCard({ config, onEdit, onDelete }) {
  const { t } = useTranslation();
  const { confirm, showError } = useAppFeedback();
  const [expanded, setExpanded] = useState(false);
  const attachmentCount = Array.isArray(config?.attachments) ? config.attachments.length : 0;

  async function handleDelete() {
    if (!(await confirm(t('automations.welcomeEmail.deleteConfirm')))) return;
    try {
      await automationsApi.delete(config.id);
      onDelete(config.id);
    } catch {
      showError(t('automations.deleteError'));
    }
  }

  if (!config) {
    return (
      <div style={{ ...card, padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#F7FBFF', border: '1px solid #DCE9F5' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#10253C' }}>{t('automations.welcomeEmail.title')}</div>
          <div style={{ fontSize: 12, color: '#5682B1', marginTop: 4 }}>{t('automations.welcomeEmail.notConfigured')}</div>
        </div>
        <button type="button" style={{ ...btn('primary'), fontSize: 12 }} onClick={() => onEdit(null)}>
          {t('automations.welcomeEmail.configure')}
        </button>
      </div>
    );
  }

  return (
    <div style={{ ...card, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12, background: 'linear-gradient(180deg, #F0FFF4 0%, #FCFEFF 100%)', border: '1px solid #9FD7B1' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, fontSize: 11, fontWeight: 800, background: '#DDF4E6', color: '#1F6A3A', border: '1px solid #9FD7B1' }}>
          {t('automations.welcomeEmail.title')}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => setExpanded((p) => !p)} style={{ ...btn('secondary'), fontSize: 11, padding: '7px 10px', borderRadius: 8 }}>
            {expanded ? t('automations.hideDetails') : t('automations.viewDetails')}
          </button>
          <button type="button" onClick={handleDelete} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C53131', fontSize: 16, padding: '2px 4px', fontWeight: 700 }}>
            x
          </button>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#11253E' }}>{config.name}</div>
        <div style={{ fontSize: 12, color: '#6B86A3', marginTop: 4 }}>
          {t('automations.welcomeEmail.activeHint')}
          {attachmentCount > 0 && ` · ${t('automations.attachmentCount', { count: attachmentCount })}`}
        </div>
        {config.subject && (
          <div style={{ fontSize: 12, color: '#5682B1', marginTop: 2 }}>
            {t('automations.subjectLabel')}: {config.subject}
          </div>
        )}
      </div>

      {expanded && config.messageTemplate && (
        <div style={{ fontSize: 12, color: '#10253C', background: '#F7FBFF', border: '1px solid #DCE9F5', borderRadius: 10, padding: '10px 12px', whiteSpace: 'pre-wrap' }}>
          {config.messageTemplate}
        </div>
      )}

      {expanded && (
        <button type="button" style={{ ...btn('secondary'), fontSize: 12, alignSelf: 'flex-start' }} onClick={() => onEdit(config)}>
          {t('automations.edit')}
        </button>
      )}
    </div>
  );
}

function WelcomeEmailConfigModal({ config, onClose, onSaved }) {
  const { t } = useTranslation();
  const { showError } = useAppFeedback();
  const fileInputRef = useRef(null);
  const isEditing = !!config;

  const defaultTemplate = `Hallo {{name}}\n\nI'm Anhang findest du wie heute besprochen sowohl meine AGBs als auch den Zahlungsschein, über den du den Betrag für die Betreuung begleichen kannst.\n\nNächster Termin (Trainingsplan Abgabe + Geräte-Einweisung): (DATUM)\nBetrag: {{amount}}\nZahlungsfrist: (DATUM)\n\nDanke für dein Vertrauen,\n\nSportliche Grüsse\nDaniel Abreu / Fitness Trainer`;

  const [form, setForm] = useState({
    name: config?.name || t('automations.welcomeEmail.defaultName'),
    subject: config?.subject || 'Daniel Abreu PT — Willkommen',
    messageTemplate: config?.messageTemplate || defaultTemplate,
  });
  const [attachments, setAttachments] = useState(config?.attachments || []);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function handleFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await automationsApi.uploadAttachment(formData);
      setAttachments((prev) => [...prev, response.data]);
    } catch {
      showError(t('automations.modal.uploadError'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function removeAttachment(index) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        type: 'CLIENT_WELCOME_EMAIL',
        sendMode: 'IMMEDIATE',
        messageTemplate: form.messageTemplate,
        subject: form.subject,
        attachments,
        clientIds: [],
      };
      const response = isEditing
        ? await automationsApi.update(config.id, payload)
        : await automationsApi.create(payload);
      onSaved(response.data);
    } catch {
      showError(t(isEditing ? 'automations.updateError' : 'automations.createError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)' }}>
      <div style={{ ...card, maxWidth: 560, width: '92%', maxHeight: '88vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 700 }}>
          {t(isEditing ? 'automations.welcomeEmail.editTitle' : 'automations.welcomeEmail.createTitle')}
        </h3>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: '#5682B1' }}>
          {t('automations.welcomeEmail.configSubtitle')}
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <span style={label}>{t('automations.modal.name')}</span>
            <input style={input} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <span style={label}>{t('automations.modal.subject')}</span>
            <input style={input} required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
              <span style={label}>{t('automations.welcomeEmail.template')}</span>
              <button
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, messageTemplate: defaultTemplate }))}
                style={{ fontSize: 11, fontWeight: 600, color: '#2C4F73', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                {t('automations.modal.resetMessage')}
              </button>
            </div>
            <textarea style={textarea} required value={form.messageTemplate} onChange={(e) => setForm({ ...form, messageTemplate: e.target.value })} />
            <p style={{ margin: '5px 0 0', fontSize: 11.5, color: '#5682B1' }}>
              {t('automations.welcomeEmail.templateHint')}
            </p>
          </div>

          <div style={{ marginBottom: 16 }}>
            <span style={label}>{t('automations.welcomeEmail.defaultAttachments')}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {attachments.map((att, index) => (
                <div key={index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: '#F7FBFF', border: '1px solid #DCE9F5' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#10253C', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                    {att.originalName || att.filename}
                  </div>
                  <button type="button" onClick={() => removeAttachment(index)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C53131', fontSize: 14, padding: '2px 6px', fontWeight: 700 }}>
                    x
                  </button>
                </div>
              ))}
              <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileUpload} />
              <button type="button" disabled={uploading} onClick={() => fileInputRef.current?.click()} style={{ ...btn('secondary'), fontSize: 12, textAlign: 'center' }}>
                {uploading ? t('automations.modal.uploading') : t('automations.modal.addAttachment')}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" style={{ ...btn('secondary'), flex: 1 }} onClick={onClose}>{t('automations.modal.cancel')}</button>
            <button type="submit" style={{ ...btn('primary'), flex: 2 }} disabled={saving}>
              {saving ? t('automations.modal.saving') : t(isEditing ? 'automations.modal.save' : 'automations.welcomeEmail.configure')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StatCard({ label, value, detail, accent }) {
  return (
    <div style={{ ...card, padding: '16px 18px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 6, height: '100%', background: accent }} />
      <div style={{ marginLeft: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#6B86A3', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</div>
        <div style={{ marginTop: 8, fontSize: 28, lineHeight: 1.1, fontWeight: 800, color: '#10253C' }}>{value}</div>
        <div style={{ marginTop: 6, fontSize: 12, color: '#6B86A3' }}>{detail}</div>
      </div>
    </div>
  );
}

export default function AutomationsPage() {
  const { t } = useTranslation();
  const { showError, showSuccess } = useAppFeedback();
  const isMobile = useMediaQuery('(max-width: 760px)');
  const isTablet = useMediaQuery('(max-width: 1100px)');
  const [automations, setAutomations] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState(null);
  const [parentAutomation, setParentAutomation] = useState(null);
  const [gmailStatus, setGmailStatus] = useState(null);
  const [welcomeConfig, setWelcomeConfig] = useState(null);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [editingWelcomeConfig, setEditingWelcomeConfig] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [automationsResponse, clientsResponse, gmailResponse, welcomeResponse] = await Promise.all([
        automationsApi.list(),
        clientsApi.list(),
        automationsApi.gmailStatus(),
        automationsApi.getWelcomeConfig(),
      ]);
      const allAutomations = automationsResponse.data || [];
      setAutomations(allAutomations.filter((a) => a.type !== 'CLIENT_WELCOME_EMAIL'));
      setClients((clientsResponse.data || []).map((c) => ({ ...c, email: c.email || c.user?.email || '' })));
      setGmailStatus(gmailResponse.data || null);
      setWelcomeConfig(welcomeResponse.data || null);
    } catch {
      showError('Erro ao carregar automações.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const code = searchParams.get('code');
    if (code) {
      setSearchParams({}, { replace: true });
      automationsApi.gmailCallback(code)
        .then((res) => {
          setGmailStatus({ connected: true, email: res.data.email });
          showSuccess(t('automations.gmail.connectSuccess'));
        })
        .catch(() => {
          showError(t('automations.gmail.connectError'));
        });
    }
  }, []);

  async function handleGmailConnect() {
    try {
      const response = await automationsApi.gmailAuthUrl();
      window.location.href = response.data.url;
    } catch {
      showError(t('automations.gmail.connectError'));
    }
  }

  async function handleGmailDisconnect() {
    try {
      await automationsApi.gmailDisconnect();
      setGmailStatus({ connected: false, email: null });
    } catch {
      showError(t('automations.gmail.disconnectError'));
    }
  }

  function handleDeleted(id) {
    setAutomations((prev) => prev.filter((automation) => automation.id !== id));
  }

  function handleExecuted(data) {
    if (data?.automation) {
      setAutomations((prev) => prev.map((automation) => (automation.id === data.automation.id ? data.automation : automation)));
    }
  }

  function handleSaved(data) {
    const automation = data?.automation;
    if (automation) {
      setAutomations((prev) => {
        const exists = prev.some((item) => item.id === automation.id);
        return exists ? prev.map((item) => (item.id === automation.id ? automation : item)) : [automation, ...prev];
      });
    }
    setShowModal(false);
    setEditingAutomation(null);
    setParentAutomation(null);
  }

  const automationsById = new Map(automations.map((item) => [item.id, item]));
  const rootAutomations = automations.filter((item) => !item.parentAutomationId);
  const followUpsByParentId = automations.filter((item) => item.parentAutomationId).reduce((acc, item) => {
    if (!acc[item.parentAutomationId]) acc[item.parentAutomationId] = [];
    acc[item.parentAutomationId].push(item);
    return acc;
  }, {});
  const orphanFollowUps = automations.filter((item) => item.parentAutomationId && !automationsById.has(item.parentAutomationId));

  const summary = useMemo(() => {
    const pending = automations.filter((item) => item.status === 'PENDING').length;
    const sent = automations.filter((item) => item.status === 'SENT').length;
    const followUps = automations.filter((item) => item.parentAutomationId).length;
    return {
      total: automations.length,
      pending,
      sent,
      followUps,
    };
  }, [automations]);

  const focusMessage = summary.pending > 0
    ? t('automations.focusPending', { count: summary.pending })
    : t('automations.focusStable');

  return (
    <div style={{ padding: isMobile ? '16px 14px 20px' : '28px 32px', maxWidth: 1280, margin: '0 auto' }}>
      <section
        style={{
          background: 'linear-gradient(135deg, #10253C 0%, #1D3C5A 52%, #5682B1 100%)',
          borderRadius: 28,
          padding: isMobile ? '22px 18px' : '28px 30px',
          color: '#FFFFFF',
          boxShadow: '0 24px 50px rgba(16,37,60,0.24)',
          marginBottom: 18,
          display: 'flex',
          flexDirection: isTablet ? 'column' : 'row',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: isMobile ? 24 : 34, lineHeight: 1.06, fontWeight: 800 }}>{t('automations.title')}</h1>
          <p style={{ margin: '12px 0 0', maxWidth: 680, fontSize: isMobile ? 14 : 16, lineHeight: 1.55, color: '#E4EFF9' }}>
            {t('automations.subtitle')}
          </p>
        </div>
        <div style={{ display: 'grid', gap: 10, minWidth: isTablet ? 'auto' : 320 }}>
          <div style={{ padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#C8DBED' }}>{t('automations.todayFocus')}</div>
            <div style={{ marginTop: 6, fontSize: 14, fontWeight: 600, lineHeight: 1.45 }}>{focusMessage}</div>
          </div>
          <button
            type="button"
            style={{ ...btn('primary'), background: '#FFFFFF', color: '#10253C' }}
            onClick={() => {
              setEditingAutomation(null);
              setParentAutomation(null);
              setShowModal(true);
            }}
          >
            {t('automations.newAutomation')}
          </button>
        </div>
      </section>

      <GmailBanner gmailStatus={gmailStatus} onConnect={handleGmailConnect} onDisconnect={handleGmailDisconnect} />

      <div style={{ marginBottom: 14 }}>
        <WelcomeEmailConfigCard
          config={welcomeConfig}
          onEdit={(cfg) => {
            setEditingWelcomeConfig(cfg);
            setShowWelcomeModal(true);
          }}
          onDelete={() => {
            setWelcomeConfig(null);
          }}
        />
      </div>

      <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 14, marginBottom: 18 }}>
        <StatCard label={t('automations.total')} value={summary.total} detail={t('automations.totalHint')} accent="#10253C" />
        <StatCard label={t('automations.pendingQueue')} value={summary.pending} detail={t('automations.pendingHint')} accent="#B45309" />
        <StatCard label={t('automations.sent')} value={summary.sent} detail={t('automations.sentHint')} accent="#2D7A47" />
        <StatCard label={t('automations.followUps')} value={summary.followUps} detail={t('automations.followUpsHint')} accent="#5682B1" />
      </section>

      {loading ? (
        <BrandLoadingScreen />
      ) : automations.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '56px 24px' }}>
          <p style={{ color: '#6B86A3', fontSize: 15, marginBottom: 18 }}>{t('automations.noAutomations')}</p>
          <button
            type="button"
            style={btn('primary')}
            onClick={() => {
              setEditingAutomation(null);
              setParentAutomation(null);
              setShowModal(true);
            }}
          >
            {t('automations.createFirst')}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {rootAutomations.map((automation) => {
            const followUps = (followUpsByParentId[automation.id] || []).slice().sort((left, right) => {
              const l = new Date(left.createdAt || 0).getTime();
              const r = new Date(right.createdAt || 0).getTime();
              return l - r;
            });

            return (
              <div key={automation.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <AutomationCard
                  automation={automation}
                  parentAutomation={null}
                  onDeleted={handleDeleted}
                  onExecuted={handleExecuted}
                  onEdit={(item) => {
                    setEditingAutomation(item);
                    setParentAutomation(null);
                    setShowModal(true);
                  }}
                  onCreateFollowUp={(item) => {
                    setEditingAutomation(null);
                    setParentAutomation(item);
                    setShowModal(true);
                  }}
                />

                {followUps.length > 0 ? (
                  <div style={{ marginLeft: isMobile ? 10 : 20, paddingLeft: isMobile ? 10 : 16, borderLeft: '2px dashed #9FBDD9', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: 8, padding: '5px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: '#EEF3F8', color: '#2C4F73' }}>
                      <span aria-hidden="true">-</span>
                      <span>{t('automations.followUpGroup', { count: followUps.length })}</span>
                    </div>

                    {followUps.map((followUp) => (
                      <AutomationCard
                        key={followUp.id}
                        automation={followUp}
                        parentAutomation={automation}
                        isNestedFollowUp
                        onDeleted={handleDeleted}
                        onExecuted={handleExecuted}
                        onEdit={(item) => {
                          setEditingAutomation(item);
                          setParentAutomation(automation);
                          setShowModal(true);
                        }}
                        onCreateFollowUp={(item) => {
                          setEditingAutomation(null);
                          setParentAutomation(item);
                          setShowModal(true);
                        }}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}

          {orphanFollowUps.length > 0 ? (
            <div style={{ ...card, background: '#FFF8E1', border: '1px solid #F3D690', boxShadow: 'none', fontSize: 12.5, color: '#8A5A00' }}>
              {t('automations.orphanFollowUpWarning', { count: orphanFollowUps.length })}
            </div>
          ) : null}
        </div>
      )}

      {showModal && (
        <CreateModal
          clients={clients}
          automation={editingAutomation}
          parentAutomation={parentAutomation}
          onClose={() => {
            setShowModal(false);
            setEditingAutomation(null);
            setParentAutomation(null);
          }}
          onSaved={handleSaved}
        />
      )}

      {showWelcomeModal && (
        <WelcomeEmailConfigModal
          config={editingWelcomeConfig}
          onClose={() => {
            setShowWelcomeModal(false);
            setEditingWelcomeConfig(null);
          }}
          onSaved={(data) => {
            setWelcomeConfig(data?.automation || null);
            setShowWelcomeModal(false);
            setEditingWelcomeConfig(null);
          }}
        />
      )}
    </div>
  );
}

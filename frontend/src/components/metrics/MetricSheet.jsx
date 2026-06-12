import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clientsApi, metricsApi } from '../../services/api';
import useMediaQuery from '../../hooks/useMediaQuery';
import { useAppFeedback } from '../ui/FeedbackProvider';

const MAX_DATE_COLUMNS = 16;

const SHEET_THEME = {
  navy: '#2C4F73',
  primary: '#5682B1',
  accent: '#739EC9',
  text: '#0F2438',
  border: 'rgba(115,158,201,0.45)',
  borderStrong: '#739EC9',
  surface: 'linear-gradient(155deg, rgba(255,255,255,0.97) 0%, rgba(238,246,253,0.94) 100%)',
  panel: 'linear-gradient(180deg, #FFFFFF 0%, #F3F8FD 100%)',
  cardShadow: '0 16px 34px rgba(44,79,115,0.12), 0 2px 8px rgba(0,0,0,0.06)',
};

function toDateKey(value) {
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toISOString().slice(0, 10);
}

function toDateLabel(dateKey, locale) {
  const dt = new Date(`${dateKey}T12:00:00.000Z`);
  if (Number.isNaN(dt.getTime())) return dateKey;
  return dt.toLocaleDateString(locale, { day: '2-digit', month: 'short' });
}

function toDisplayValue(entry, type) {
  if (!entry) return '';
  if (type === 'NUMBER' || type === 'SCALE') return entry.valueNumber ?? '';
  if (type === 'BOOLEAN') {
    if (entry.valueBoolean === null || entry.valueBoolean === undefined) return '';
    return entry.valueBoolean ? 'true' : 'false';
  }
  return entry.valueText ?? '';
}

function parseBoolean(raw) {
  if (raw === '' || raw === null || raw === undefined) return null;
  const value = String(raw).trim().toLowerCase();
  if (['1', 'true', 'sim', 'yes'].includes(value)) return true;
  if (['0', 'false', 'nao', 'no'].includes(value)) return false;
  return null;
}

function buildValuePayload(definition, raw) {
  const payload = { valueNumber: null, valueText: null, valueBoolean: null };

  if (definition.type === 'NUMBER' || definition.type === 'SCALE') {
    if (raw === '' || raw === null || raw === undefined) return payload;
    const parsed = Number(String(raw).replace(',', '.'));
    payload.valueNumber = Number.isNaN(parsed) ? null : parsed;
    return payload;
  }

  if (definition.type === 'BOOLEAN') {
    payload.valueBoolean = parseBoolean(raw);
    return payload;
  }

  if (raw === '' || raw === null || raw === undefined) return payload;
  payload.valueText = String(raw);
  return payload;
}

function splitCellKey(key) {
  const [metricDefinitionId, dateKey] = key.split('|');
  return { metricDefinitionId, dateKey };
}

function mapDefinitionToDraft(definition) {
  return {
    name: definition.name || '',
    type: definition.type || 'NUMBER',
    unit: definition.unit || '',
    targetMin: definition.targetMin ?? '',
    targetMax: definition.targetMax ?? '',
  };
}

function IconButton({ title, onClick, disabled, children, bg = '#FFFFFF', color = '#0F2438', border = '1px solid rgba(115,158,201,0.45)', size = 36 }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: size,
        height: size,
        borderRadius: 11,
        border,
        background: bg,
        color,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        opacity: disabled ? 0.45 : 1,
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

function IconPlus() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function IconSave() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M17 21v-8H7v8" />
      <path d="M7 3v5h8" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
    </svg>
  );
}

function IconUndo() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-15-6l-3 2" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function IconDots() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function ToolbarField({ children, style }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        minHeight: 42,
        padding: '0 12px',
        borderRadius: 12,
        border: '1px solid rgba(115,158,201,0.45)',
        background: '#FFFFFF',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SurfaceButton({ children, onClick, disabled, primary = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        border: primary ? 'none' : '1px solid rgba(115,158,201,0.45)',
        background: primary ? 'linear-gradient(135deg, #2C4F73 0%, #5682B1 100%)' : '#FFFFFF',
        color: primary ? '#FFFFFF' : '#000000',
        borderRadius: 12,
        minHeight: 42,
        padding: '0 14px',
        fontSize: 13,
        fontWeight: 800,
        cursor: 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

function OverlayPanel({ title, subtitle, onClose, children, footer, closeLabel = 'Close' }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 40,
        background: 'rgba(0,0,0,0.38)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(720px, 100%)',
          maxHeight: '85vh',
          overflow: 'auto',
          borderRadius: 24,
          background: 'linear-gradient(180deg, #FFFFFF 0%, #F4F9FF 100%)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.28)',
          border: '1px solid rgba(115,158,201,0.5)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '18px 18px 10px' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#000000' }}>{title}</div>
            {subtitle ? <div style={{ marginTop: 4, fontSize: 12, color: '#5682B1' }}>{subtitle}</div> : null}
          </div>
          <IconButton title={closeLabel} onClick={onClose} bg="#FFFFFF" color="#000000">
            <IconClose />
          </IconButton>
        </div>
        <div style={{ padding: '6px 18px 18px' }}>{children}</div>
        {footer ? <div style={{ padding: '0 18px 18px' }}>{footer}</div> : null}
      </div>
    </div>
  );
}

export default function MetricSheet({ clientId, canManageDefinitions = false }) {
  const { t, i18n } = useTranslation();
  const { confirm, showError } = useAppFeedback();
  const isMobile = useMediaQuery('(max-width: 760px)');
  const locale = { en: 'en-US', pt: 'pt-PT', de: 'de-DE' }[i18n.language] || 'en-US';

  const [loading, setLoading] = useState(true);
  const [savingEntries, setSavingEntries] = useState(false);
  const [savingDefinitionId, setSavingDefinitionId] = useState('');
  const [addingDefinition, setAddingDefinition] = useState(false);
  const [definitions, setDefinitions] = useState([]);
  const [entries, setEntries] = useState([]);
  const [search, setSearch] = useState('');
  const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [extraDates, setExtraDates] = useState([]);
  const [cellDrafts, setCellDrafts] = useState({});
  const [dirtyCells, setDirtyCells] = useState({});
  const [definitionDrafts, setDefinitionDrafts] = useState({});
  const [definitionDirty, setDefinitionDirty] = useState({});
  const [newDefinition, setNewDefinition] = useState({ name: '', type: 'NUMBER', unit: '', targetMin: '', targetMax: '' });
  const [clients, setClients] = useState([]);
  const [presets, setPresets] = useState([]);
  const [copySourceClientId, setCopySourceClientId] = useState('');
  const [presetName, setPresetName] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [copyingDefinitions, setCopyingDefinitions] = useState(false);
  const [savingPreset, setSavingPreset] = useState(false);
  const [applyingPreset, setApplyingPreset] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [activePanel, setActivePanel] = useState('');
  const [mobileMetricId, setMobileMetricId] = useState('');
  const actionMenuRef = useRef(null);

  const load = useCallback(async () => {
    const requests = [
      metricsApi.listDefinitions(clientId),
      metricsApi.listEntries({ clientId }),
    ];

    if (canManageDefinitions) {
      requests.push(clientsApi.list(), metricsApi.listPresets());
    }

    const [defsRes, entriesRes, clientsRes, presetsRes] = await Promise.all(requests);

    const loadedDefinitions = defsRes.data || [];
    setDefinitions(loadedDefinitions);
    setEntries(entriesRes.data || []);

    if (canManageDefinitions) {
      setClients((clientsRes?.data || []).filter((item) => item.id !== clientId));
      setPresets(presetsRes?.data || []);
    }

    const drafts = {};
    loadedDefinitions.forEach((definition) => {
      drafts[definition.id] = mapDefinitionToDraft(definition);
    });
    setDefinitionDrafts(drafts);
    setDefinitionDirty({});
  }, [canManageDefinitions, clientId]);

  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    load()
      .catch((err) => showError(err.response?.data?.error || t('clientDetail.loadError')))
      .finally(() => setLoading(false));
  }, [clientId, load, showError, t]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setShowActionMenu(false);
        setActivePanel('');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!showActionMenu) return undefined;

    const handlePointerDown = (event) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(event.target)) {
        setShowActionMenu(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [showActionMenu]);

  const definitionById = useMemo(
    () => Object.fromEntries(definitions.map((definition) => [definition.id, definition])),
    [definitions],
  );

  const entryMap = useMemo(() => {
    const map = new Map();
    entries.forEach((entry) => {
      const key = `${entry.metricDefinitionId}|${toDateKey(entry.recordedAt)}`;
      if (!map.has(key)) map.set(key, entry);
    });
    return map;
  }, [entries]);

  const dateColumns = useMemo(() => {
    const dates = new Set(extraDates);
    entries.forEach((entry) => {
      const key = toDateKey(entry.recordedAt);
      if (key) dates.add(key);
    });
    if (newDate) dates.add(newDate);

    // Automatically add dates from the last filled day to today, up to 15 additional dates
    const entryDates = entries.map(e => toDateKey(e.recordedAt)).filter(Boolean);
    if (entryDates.length > 0) {
      const maxDate = entryDates.reduce((max, d) => d > max ? d : max);
      const today = new Date().toISOString().slice(0, 10);
      let current = new Date(maxDate);
      current.setDate(current.getDate() + 1);
      let added = 0;
      while (current.toISOString().slice(0, 10) <= today && added < 15) {
        dates.add(current.toISOString().slice(0, 10));
        current.setDate(current.getDate() + 1);
        added++;
      }
    }

    return Array.from(dates)
      .sort((a, b) => new Date(b) - new Date(a))
      .slice(0, MAX_DATE_COLUMNS);
  }, [entries, extraDates, newDate]);

  const filteredDefinitions = useMemo(() => {
    if (!search.trim()) return definitions;
    const query = search.toLowerCase();
    return definitions.filter((definition) =>
      [definition.name, definition.unit, definition.type]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [definitions, search]);

  useEffect(() => {
    if (!filteredDefinitions.length) {
      setMobileMetricId('');
      return;
    }
    if (!mobileMetricId || !filteredDefinitions.some((definition) => definition.id === mobileMetricId)) {
      setMobileMetricId(filteredDefinitions[0].id);
    }
  }, [filteredDefinitions, mobileMetricId]);

  const getCellValue = useCallback((metricDefinitionId, dateKey) => {
    const key = `${metricDefinitionId}|${dateKey}`;
    if (Object.prototype.hasOwnProperty.call(cellDrafts, key)) return cellDrafts[key];
    const definition = definitionById[metricDefinitionId];
    if (!definition) return '';
    return toDisplayValue(entryMap.get(key), definition.type);
  }, [cellDrafts, definitionById, entryMap]);

  const setCellValue = (metricDefinitionId, dateKey, value) => {
    const key = `${metricDefinitionId}|${dateKey}`;
    setCellDrafts((prev) => ({ ...prev, [key]: value }));
    setDirtyCells((prev) => ({ ...prev, [key]: true }));
  };

  const saveCells = async () => {
    const dirtyKeys = Object.keys(dirtyCells);
    if (!dirtyKeys.length) return;

    const operations = dirtyKeys
      .map((key) => {
        const { metricDefinitionId, dateKey } = splitCellKey(key);
        const definition = definitionById[metricDefinitionId];
        if (!definition || !dateKey) return null;

        const entry = entryMap.get(key);
        const raw = Object.prototype.hasOwnProperty.call(cellDrafts, key)
          ? cellDrafts[key]
          : toDisplayValue(entry, definition.type);
        const parsed = buildValuePayload(definition, raw);

        const isEmptyValue = parsed.valueNumber === null && parsed.valueText === null && parsed.valueBoolean === null;
        if (!entry && isEmptyValue) return null;

        return {
          entryId: entry?.id,
          metricDefinitionId,
          recordedAt: `${dateKey}T12:00:00.000Z`,
          valueNumber: parsed.valueNumber,
          valueText: parsed.valueText,
          valueBoolean: parsed.valueBoolean,
        };
      })
      .filter(Boolean);

    if (!operations.length) {
      setCellDrafts({});
      setDirtyCells({});
      return;
    }

    setSavingEntries(true);
    try {
      await metricsApi.bulkUpsertEntries({ clientId, operations });
      await load();
      setCellDrafts({});
      setDirtyCells({});
    } catch (err) {
      showError(err.response?.data?.error || t('clientDetail.checkinError'));
    } finally {
      setSavingEntries(false);
    }
  };

  const discardCellChanges = () => {
    setCellDrafts({});
    setDirtyCells({});
  };

  const updateDefinitionDraft = (id, key, value) => {
    setDefinitionDrafts((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || mapDefinitionToDraft(definitionById[id] || {})),
        [key]: value,
      },
    }));
    setDefinitionDirty((prev) => ({ ...prev, [id]: true }));
  };

  const saveDefinition = async (id) => {
    const draft = definitionDrafts[id];
    if (!draft?.name?.trim()) return;

    setSavingDefinitionId(id);
    try {
      await metricsApi.updateDefinition(id, {
        name: draft.name.trim(),
        type: draft.type,
        unit: draft.unit?.trim() || null,
        targetMin: draft.targetMin !== '' && draft.targetMin !== undefined ? Number(draft.targetMin) : null,
        targetMax: draft.targetMax !== '' && draft.targetMax !== undefined ? Number(draft.targetMax) : null,
      });
      await load();
    } catch (err) {
      showError(err.response?.data?.error || t('clientDetail.metricUpdateError'));
    } finally {
      setSavingDefinitionId('');
    }
  };

  const removeDefinition = async (id) => {
    if (!(await confirm(t('clientDetail.confirmDeleteMetric')))) return;
    try {
      await metricsApi.deleteDefinition(id);
      await load();
    } catch (err) {
      showError(err.response?.data?.error || t('clientDetail.metricDeleteError'));
    }
  };

  const addDefinition = async () => {
    if (!newDefinition.name.trim()) return;
    setAddingDefinition(true);
    try {
      await metricsApi.createDefinition({
        clientId,
        name: newDefinition.name.trim(),
        type: newDefinition.type,
        unit: newDefinition.unit?.trim() || null,
        frequency: 'DAILY',
        targetMin: newDefinition.targetMin !== '' && newDefinition.targetMin !== undefined ? Number(newDefinition.targetMin) : null,
        targetMax: newDefinition.targetMax !== '' && newDefinition.targetMax !== undefined ? Number(newDefinition.targetMax) : null,
      });
      setNewDefinition({ name: '', type: 'NUMBER', unit: '', targetMin: '', targetMax: '' });
      setActivePanel('');
      await load();
    } catch (err) {
      showError(err.response?.data?.error || t('clientDetail.metricCreateError'));
    } finally {
      setAddingDefinition(false);
    }
  };

  const copyFromClient = async () => {
    if (!copySourceClientId) return;

    setCopyingDefinitions(true);
    try {
      await metricsApi.copyDefinitionsFromClient({
        sourceClientId: copySourceClientId,
        targetClientId: clientId,
      });
      setCopySourceClientId('');
      setActivePanel('');
      await load();
    } catch (err) {
      showError(err.response?.data?.error || t('clientDetail.metricUi.errorCopyFromClient'));
    } finally {
      setCopyingDefinitions(false);
    }
  };

  const saveAsPreset = async () => {
    if (!presetName.trim()) return;

    setSavingPreset(true);
    try {
      await metricsApi.createPreset({ clientId, name: presetName.trim() });
      setPresetName('');
      setActivePanel('');
      await load();
    } catch (err) {
      showError(err.response?.data?.error || t('clientDetail.metricUi.errorSavePreset'));
    } finally {
      setSavingPreset(false);
    }
  };

  const applyPreset = async () => {
    if (!selectedPresetId) return;

    setApplyingPreset(true);
    try {
      await metricsApi.applyPreset(selectedPresetId, { clientId });
      setSelectedPresetId('');
      setActivePanel('');
      await load();
    } catch (err) {
      showError(err.response?.data?.error || t('clientDetail.metricUi.errorApplyPreset'));
    } finally {
      setApplyingPreset(false);
    }
  };

  if (loading) {
    return (
      <div style={{ background: SHEET_THEME.panel, borderRadius: 18, padding: '20px 24px', boxShadow: SHEET_THEME.cardShadow, border: `1px solid ${SHEET_THEME.border}` }}>
        <div style={{ color: SHEET_THEME.accent, fontSize: 13 }}>{t('common.loading')}</div>
      </div>
    );
  }

  const dirtyCount = Object.keys(dirtyCells).length;
  const dirtyDefinitionCount = Object.keys(definitionDirty).length;
  const selectedMobileDefinition = filteredDefinitions.find((definition) => definition.id === mobileMetricId) || null;

  return (
    <div style={{ position: 'relative', background: SHEET_THEME.surface, borderRadius: isMobile ? 16 : 22, padding: isMobile ? '14px 12px 16px' : '18px 18px 20px', boxShadow: SHEET_THEME.cardShadow, marginBottom: 16, border: `1px solid ${SHEET_THEME.border}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: isMobile ? 16 : 15, fontWeight: 800, color: SHEET_THEME.text }}>{t('clientDetail.metricsSheetTitle')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            <span style={{ padding: '5px 9px', borderRadius: 999, background: '#FFFFFF', color: SHEET_THEME.primary, fontSize: 11, fontWeight: 700, border: `1px solid ${SHEET_THEME.border}` }}>
              {t('clientDetail.metricUi.metricsCount', { count: definitions.length })}
            </span>
            <span style={{ padding: '5px 9px', borderRadius: 999, background: '#FFFFFF', color: SHEET_THEME.primary, fontSize: 11, fontWeight: 700, border: `1px solid ${SHEET_THEME.border}` }}>
              {t('clientDetail.metricUi.datesCount', { count: dateColumns.length })}
            </span>
            {dirtyCount > 0 ? (
              <span style={{ padding: '5px 9px', borderRadius: 999, background: '#FFFFFF', color: SHEET_THEME.navy, fontSize: 11, fontWeight: 700, border: `1px solid ${SHEET_THEME.borderStrong}` }}>
                {t('clientDetail.metricUi.unsavedCount', { count: dirtyCount })}
              </span>
            ) : null}
          </div>
        </div>

        {canManageDefinitions ? (
          <div ref={actionMenuRef} style={{ position: 'relative' }}>
            <IconButton title={t('clientDetail.metricUi.moreActions')} onClick={() => setShowActionMenu((prev) => !prev)} bg="#FFFFFF" color="#000000">
              <IconDots />
            </IconButton>
            {showActionMenu ? (
              <div style={{ position: 'absolute', right: 0, top: 42, zIndex: 10, width: 264, borderRadius: 14, background: '#FFFFFF', border: '1px solid #739EC9', boxShadow: '0 18px 48px rgba(0,0,0,0.16)', padding: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowActionMenu(false);
                    setActivePanel('create');
                  }}
                  style={{ width: '100%', textAlign: 'left', border: 'none', background: 'transparent', padding: '10px 12px', borderRadius: 10, fontSize: 13, color: '#000000', cursor: 'pointer' }}
                >
                  {t('clientDetail.metricUi.newMetric')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowActionMenu(false);
                    setActivePanel('manage');
                  }}
                  style={{ width: '100%', textAlign: 'left', border: 'none', background: 'transparent', padding: '10px 12px', borderRadius: 10, fontSize: 13, color: '#000000', cursor: 'pointer' }}
                >
                  {t('clientDetail.metricUi.manageMetrics')}{dirtyDefinitionCount > 0 ? ` (${dirtyDefinitionCount})` : ''}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowActionMenu(false);
                    setActivePanel('copy-client');
                  }}
                  style={{ width: '100%', textAlign: 'left', border: 'none', background: 'transparent', padding: '10px 12px', borderRadius: 10, fontSize: 13, color: '#000000', cursor: 'pointer' }}
                >
                  {t('clientDetail.metricUi.copyFromClient')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowActionMenu(false);
                    setActivePanel('save-preset');
                  }}
                  style={{ width: '100%', textAlign: 'left', border: 'none', background: 'transparent', padding: '10px 12px', borderRadius: 10, fontSize: 13, color: '#000000', cursor: 'pointer' }}
                >
                  {t('clientDetail.metricUi.saveAsPreset')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowActionMenu(false);
                    setActivePanel('apply-preset');
                  }}
                  style={{ width: '100%', textAlign: 'left', border: 'none', background: 'transparent', padding: '10px 12px', borderRadius: 10, fontSize: 13, color: '#000000', cursor: 'pointer' }}
                >
                  {t('clientDetail.metricUi.applyCoachPreset')}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 14 }}>
        <ToolbarField>
          <span style={{ color: SHEET_THEME.accent, display: 'inline-flex' }}>
            <IconSearch />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('clientDetail.sheetSearchMetric')}
            style={{ width: '100%', border: 'none', outline: 'none', fontSize: isMobile ? 14 : 13, color: SHEET_THEME.text, background: 'transparent' }}
          />
        </ToolbarField>

        <div style={{ display: 'flex', gap: 8, justifyContent: isMobile ? 'stretch' : 'flex-end', flexWrap: 'wrap' }}>
          <ToolbarField style={{ minWidth: 170, flex: isMobile ? 1 : 'initial' }}>
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              style={{ width: '100%', border: 'none', outline: 'none', fontSize: isMobile ? 14 : 13, color: SHEET_THEME.text, background: 'transparent' }}
            />
          </ToolbarField>
          <IconButton title={t('clientDetail.sheetAddDate')} onClick={() => newDate && setExtraDates((prev) => (prev.includes(newDate) ? prev : [...prev, newDate]))} bg="#FFFFFF">
            <IconPlus />
          </IconButton>
        </div>
      </div>

      {dirtyCount > 0 ? (
        <div style={{ display: 'flex', alignItems: isMobile ? 'stretch' : 'center', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', gap: 12, padding: '12px 14px', marginBottom: 12, borderRadius: 16, background: '#FFFFFF', border: `1px solid ${SHEET_THEME.border}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: SHEET_THEME.primary }}>
            {t('clientDetail.metricUi.pendingChanges', { count: dirtyCount })}
          </div>
          <div style={{ display: 'flex', gap: 8, width: isMobile ? '100%' : 'auto' }}>
            <IconButton title={t('clientDetail.sheetDiscardAll')} onClick={discardCellChanges} bg="#FFFFFF">
              <IconUndo />
            </IconButton>
            <div style={{ flex: isMobile ? 1 : 'initial' }}>
              <SurfaceButton onClick={saveCells} disabled={savingEntries} primary>
              {savingEntries ? t('clientDetail.saving') : t('clientDetail.metricUi.save')}
              </SurfaceButton>
            </div>
          </div>
        </div>
      ) : null}

      {canManageDefinitions && activePanel === 'create' ? (
        <OverlayPanel
          title={t('clientDetail.metricUi.newMetricTitle')}
          subtitle={t('clientDetail.metricUi.newMetricSubtitle')}
          onClose={() => setActivePanel('')}
          closeLabel={t('common.cancel')}
          footer={(
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <SurfaceButton onClick={() => setActivePanel('')}>{t('common.cancel')}</SurfaceButton>
              <SurfaceButton onClick={addDefinition} disabled={addingDefinition || !newDefinition.name.trim()} primary>
                {addingDefinition ? t('clientDetail.metricUi.creating') : t('clientDetail.metricUi.create')}
              </SurfaceButton>
            </div>
          )}
        >
          <div style={{ display: 'grid', gap: 10 }}>
            <input
              value={newDefinition.name}
              onChange={(e) => setNewDefinition((prev) => ({ ...prev, name: e.target.value }))}
              placeholder={t('clientDetail.metricName')}
              style={{ border: '1.5px solid #739EC9', borderRadius: 14, padding: '12px 14px', fontSize: 14, background: '#FFFFFF' }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              <select
                value={newDefinition.type}
                onChange={(e) => setNewDefinition((prev) => ({ ...prev, type: e.target.value }))}
                style={{ border: '1.5px solid #739EC9', borderRadius: 14, padding: '12px 14px', fontSize: 14, background: '#FFFFFF' }}
              >
                <option value="NUMBER">{t('clientDetail.metricUi.typeNumber')}</option>
                <option value="TEXT">{t('clientDetail.metricUi.typeText')}</option>
                <option value="SCALE">{t('clientDetail.metricUi.typeScale')}</option>
                <option value="BOOLEAN">{t('clientDetail.metricUi.typeBoolean')}</option>
                <option value="TIME">{t('clientDetail.metricUi.typeTime')}</option>
              </select>
              <input
                value={newDefinition.unit}
                onChange={(e) => setNewDefinition((prev) => ({ ...prev, unit: e.target.value }))}
                placeholder={t('clientDetail.unit')}
                style={{ border: '1.5px solid #739EC9', borderRadius: 14, padding: '12px 14px', fontSize: 14, background: '#FFFFFF' }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#5682B1', marginBottom: 6 }}>{t('clientDetail.metricUi.targetMinOptional')}</div>
                <input
                  type="number"
                  value={newDefinition.targetMin}
                  onChange={(e) => setNewDefinition((prev) => ({ ...prev, targetMin: e.target.value }))}
                  placeholder={t('clientDetail.metricUi.exampleTargetMin')}
                  style={{ width: '100%', border: '1.5px solid #739EC9', borderRadius: 14, padding: '12px 14px', fontSize: 14, background: '#FFFFFF' }}
                />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#5682B1', marginBottom: 6 }}>{t('clientDetail.metricUi.targetMaxOptional')}</div>
                <input
                  type="number"
                  value={newDefinition.targetMax}
                  onChange={(e) => setNewDefinition((prev) => ({ ...prev, targetMax: e.target.value }))}
                  placeholder={t('clientDetail.metricUi.exampleTargetMax')}
                  style={{ width: '100%', border: '1.5px solid #739EC9', borderRadius: 14, padding: '12px 14px', fontSize: 14, background: '#FFFFFF' }}
                />
              </div>
            </div>
          </div>
        </OverlayPanel>
      ) : null}

      {canManageDefinitions && activePanel === 'manage' ? (
        <OverlayPanel
          title={t('clientDetail.metricUi.manageMetricsTitle')}
          subtitle={t('clientDetail.metricUi.manageMetricsSubtitle')}
          onClose={() => setActivePanel('')}
          closeLabel={t('common.cancel')}
        >
          {definitions.length === 0 ? (
            <div style={{ color: '#739EC9', fontSize: 13, padding: '8px 2px 2px' }}>
              {t('clientDetail.sheetNoDefinitions')}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {definitions.map((definition) => {
                const defDraft = definitionDrafts[definition.id] || mapDefinitionToDraft(definition);
                const isDefDirty = Boolean(definitionDirty[definition.id]);
                const isSavingDefinition = savingDefinitionId === definition.id;

                return (
                  <div key={definition.id} style={{ border: '1px solid #739EC9', borderRadius: 18, padding: 12, background: '#FFFFFF' }}>
                    <div style={{ display: 'grid', gap: 8 }}>
                      <input
                        value={defDraft.name}
                        onChange={(e) => updateDefinitionDraft(definition.id, 'name', e.target.value)}
                        style={{ border: '1.5px solid #739EC9', borderRadius: 12, padding: '10px 12px', fontSize: 13, fontWeight: 700, background: '#FFFFFF' }}
                      />
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                        <select
                          value={defDraft.type}
                          onChange={(e) => updateDefinitionDraft(definition.id, 'type', e.target.value)}
                          style={{ border: '1.5px solid #739EC9', borderRadius: 12, padding: '10px 12px', fontSize: 12, background: '#FFFFFF' }}
                        >
                          <option value="NUMBER">NUMBER</option>
                          <option value="TEXT">TEXT</option>
                          <option value="SCALE">SCALE</option>
                          <option value="BOOLEAN">BOOLEAN</option>
                          <option value="TIME">TIME</option>
                        </select>
                        <input
                          value={defDraft.unit || ''}
                          onChange={(e) => updateDefinitionDraft(definition.id, 'unit', e.target.value)}
                          placeholder={t('clientDetail.unit')}
                          style={{ border: '1.5px solid #739EC9', borderRadius: 12, padding: '10px 12px', fontSize: 12, background: '#FFFFFF' }}
                        />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#739EC9', marginBottom: 4 }}>{t('clientDetail.metricUi.targetMinShort')}</div>
                          <input
                            type="number"
                            value={defDraft.targetMin ?? ''}
                            onChange={(e) => updateDefinitionDraft(definition.id, 'targetMin', e.target.value)}
                            placeholder="—"
                            style={{ width: '100%', border: '1.5px solid #739EC9', borderRadius: 12, padding: '8px 10px', fontSize: 12, background: '#FFFFFF' }}
                          />
                        </div>
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#739EC9', marginBottom: 4 }}>{t('clientDetail.metricUi.targetMaxShort')}</div>
                          <input
                            type="number"
                            value={defDraft.targetMax ?? ''}
                            onChange={(e) => updateDefinitionDraft(definition.id, 'targetMax', e.target.value)}
                            placeholder="—"
                            style={{ width: '100%', border: '1.5px solid #739EC9', borderRadius: 12, padding: '8px 10px', fontSize: 12, background: '#FFFFFF' }}
                          />
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                        <IconButton title={isSavingDefinition ? t('clientDetail.saving') : t('clientDetail.metricSave')} onClick={() => saveDefinition(definition.id)} disabled={!isDefDirty || isSavingDefinition} bg="#5682B1" color="#FFFFFF" border="none">
                          <IconSave />
                        </IconButton>
                        <IconButton title={t('clientDetail.removeMetric')} onClick={() => removeDefinition(definition.id)} bg="#FFFFFF" color="#5682B1" border="none">
                          <IconTrash />
                        </IconButton>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </OverlayPanel>
      ) : null}

      {canManageDefinitions && activePanel === 'copy-client' ? (
        <OverlayPanel
          title={t('clientDetail.metricUi.copyPanelTitle')}
          subtitle={t('clientDetail.metricUi.copyPanelSubtitle')}
          onClose={() => setActivePanel('')}
          closeLabel={t('common.cancel')}
          footer={(
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <SurfaceButton onClick={() => setActivePanel('')}>{t('common.cancel')}</SurfaceButton>
              <SurfaceButton onClick={copyFromClient} disabled={!copySourceClientId || copyingDefinitions} primary>
                {copyingDefinitions ? t('clientDetail.metricUi.copying') : t('clientDetail.metricUi.copyMetrics')}
              </SurfaceButton>
            </div>
          )}
        >
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ fontSize: 12, color: '#5682B1' }}>
              {t('clientDetail.metricUi.copyHint')}
            </div>
            <select
              value={copySourceClientId}
              onChange={(e) => setCopySourceClientId(e.target.value)}
              style={{ border: '1.5px solid #739EC9', borderRadius: 14, padding: '12px 14px', fontSize: 14, background: '#FFFFFF' }}
            >
              <option value="">{t('clientDetail.metricUi.selectClient')}</option>
              {clients.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
            {clients.length === 0 ? <div style={{ color: '#739EC9', fontSize: 12 }}>{t('clientDetail.metricUi.noOtherClients')}</div> : null}
          </div>
        </OverlayPanel>
      ) : null}

      {canManageDefinitions && activePanel === 'save-preset' ? (
        <OverlayPanel
          title={t('clientDetail.metricUi.savePresetTitle')}
          subtitle={t('clientDetail.metricUi.savePresetSubtitle')}
          onClose={() => setActivePanel('')}
          closeLabel={t('common.cancel')}
          footer={(
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <SurfaceButton onClick={() => setActivePanel('')}>{t('common.cancel')}</SurfaceButton>
              <SurfaceButton onClick={saveAsPreset} disabled={!presetName.trim() || !definitions.length || savingPreset} primary>
                {savingPreset ? t('clientDetail.metricUi.savingPreset') : t('clientDetail.metricUi.savePreset')}
              </SurfaceButton>
            </div>
          )}
        >
          <div style={{ display: 'grid', gap: 12 }}>
            <input
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder={t('clientDetail.metricUi.presetNamePlaceholder')}
              style={{ border: '1.5px solid #739EC9', borderRadius: 14, padding: '12px 14px', fontSize: 14, background: '#FFFFFF' }}
            />
            <div style={{ fontSize: 12, color: '#5682B1' }}>
              {t('clientDetail.metricUi.savePresetHint', { count: definitions.length })}
            </div>
          </div>
        </OverlayPanel>
      ) : null}

      {canManageDefinitions && activePanel === 'apply-preset' ? (
        <OverlayPanel
          title={t('clientDetail.metricUi.applyPresetTitle')}
          subtitle={t('clientDetail.metricUi.applyPresetSubtitle')}
          onClose={() => setActivePanel('')}
          closeLabel={t('common.cancel')}
          footer={(
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <SurfaceButton onClick={() => setActivePanel('')}>{t('common.cancel')}</SurfaceButton>
              <SurfaceButton onClick={applyPreset} disabled={!selectedPresetId || applyingPreset} primary>
                {applyingPreset ? t('clientDetail.metricUi.applyingPreset') : t('clientDetail.metricUi.applyPreset')}
              </SurfaceButton>
            </div>
          )}
        >
          <div style={{ display: 'grid', gap: 12 }}>
            <select
              value={selectedPresetId}
              onChange={(e) => setSelectedPresetId(e.target.value)}
              style={{ border: '1.5px solid #739EC9', borderRadius: 14, padding: '12px 14px', fontSize: 14, background: '#FFFFFF' }}
            >
              <option value="">{t('clientDetail.metricUi.selectPreset')}</option>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.name} ({t('clientDetail.metricUi.metricsCount', { count: preset._count?.items || 0 })})</option>
              ))}
            </select>
            {presets.length === 0 ? <div style={{ color: '#739EC9', fontSize: 12 }}>{t('clientDetail.metricUi.noPresets')}</div> : null}
            <div style={{ fontSize: 12, color: '#5682B1' }}>
              {t('clientDetail.metricUi.applyPresetHint')}
            </div>
          </div>
        </OverlayPanel>
      ) : null}

      {filteredDefinitions.length === 0 ? (
        <div style={{ color: SHEET_THEME.accent, fontSize: 13, paddingTop: 8 }}>
          {definitions.length === 0 ? t('clientDetail.sheetNoDefinitions') : t('clientDetail.metricNoMatch')}
        </div>
      ) : isMobile ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ border: `1px solid ${SHEET_THEME.border}`, borderRadius: 14, background: '#FFFFFF', padding: '10px 10px 12px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: SHEET_THEME.primary, textTransform: 'uppercase', marginBottom: 8 }}>
              {t('clientDetail.metricName')}
            </div>
            <select
              value={mobileMetricId}
              onChange={(e) => setMobileMetricId(e.target.value)}
              style={{ border: `1px solid ${SHEET_THEME.borderStrong}`, borderRadius: 12, padding: '11px 12px', fontSize: 14, color: SHEET_THEME.text, background: '#FFFFFF' }}
            >
              {filteredDefinitions.map((definition) => (
                <option key={definition.id} value={definition.id}>
                  {definition.name}{definition.unit ? ` (${definition.unit})` : ''}
                </option>
              ))}
            </select>
            {selectedMobileDefinition ? (
              <div style={{ marginTop: 8, fontSize: 11, color: SHEET_THEME.accent }}>
                {selectedMobileDefinition.targetMin !== null && selectedMobileDefinition.targetMin !== undefined
                  ? `min ${selectedMobileDefinition.targetMin}${selectedMobileDefinition.unit ? ` ${selectedMobileDefinition.unit}` : ''}`
                  : 'min —'}
                {' · '}
                {selectedMobileDefinition.targetMax !== null && selectedMobileDefinition.targetMax !== undefined
                  ? `max ${selectedMobileDefinition.targetMax}${selectedMobileDefinition.unit ? ` ${selectedMobileDefinition.unit}` : ''}`
                  : 'max —'}
              </div>
            ) : null}
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            {dateColumns.map((dateKey) => {
              if (!selectedMobileDefinition) return null;

              const key = `${selectedMobileDefinition.id}|${dateKey}`;
              const value = getCellValue(selectedMobileDefinition.id, dateKey);
              const isDirtyCell = Boolean(dirtyCells[key]);

              return (
                <div key={dateKey} style={{ border: `1px solid ${isDirtyCell ? SHEET_THEME.borderStrong : SHEET_THEME.border}`, background: '#FFFFFF', borderRadius: 14, padding: '10px 10px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: SHEET_THEME.text }}>
                      {toDateLabel(dateKey, locale)}
                    </div>
                    {isDirtyCell ? (
                      <span style={{ fontSize: 10, color: SHEET_THEME.navy, border: `1px solid ${SHEET_THEME.borderStrong}`, borderRadius: 999, padding: '2px 7px', fontWeight: 700 }}>
                        {t('clientDetail.metricUi.save')}
                      </span>
                    ) : null}
                  </div>

                  {selectedMobileDefinition.type === 'BOOLEAN' ? (
                    <select
                      value={value}
                      onChange={(e) => setCellValue(selectedMobileDefinition.id, dateKey, e.target.value)}
                      style={{ width: '100%', border: `1px solid ${SHEET_THEME.borderStrong}`, borderRadius: 12, padding: '12px 12px', fontSize: 14, color: SHEET_THEME.text, background: '#FFFFFF', minHeight: 42 }}
                    >
                      <option value="">-</option>
                      <option value="true">{t('clientDetail.metricUi.booleanYes')}</option>
                      <option value="false">{t('clientDetail.metricUi.booleanNo')}</option>
                    </select>
                  ) : (
                    <input
                      value={value}
                      onChange={(e) => setCellValue(selectedMobileDefinition.id, dateKey, e.target.value)}
                      style={{ width: '100%', border: `1px solid ${SHEET_THEME.borderStrong}`, borderRadius: 12, padding: '12px 12px', fontSize: 14, color: SHEET_THEME.text, background: '#FFFFFF', minHeight: 42 }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div style={{ border: `1px solid ${SHEET_THEME.border}`, borderRadius: 18, overflow: 'auto', maxHeight: 620, background: '#FFFFFF', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 820 }}>
            <thead>
              <tr style={{ background: '#FFFFFF' }}>
                <th style={{ position: 'sticky', top: 0, left: 0, zIndex: 3, textAlign: 'left', padding: '12px 12px', borderBottom: `1px solid ${SHEET_THEME.borderStrong}`, fontSize: 11, color: SHEET_THEME.primary, letterSpacing: '0.04em', background: '#FFFFFF', minWidth: 170 }}>
                  {t('clientDetail.sheetDate')}
                </th>
                {filteredDefinitions.map((definition) => (
                  <th key={definition.id} style={{ position: 'sticky', top: 0, zIndex: 2, textAlign: 'left', padding: '12px 12px', borderBottom: `1px solid ${SHEET_THEME.borderStrong}`, fontSize: 11, color: SHEET_THEME.primary, letterSpacing: '0.04em', whiteSpace: 'nowrap', background: '#FFFFFF', minWidth: 150 }}>
                    <div style={{ fontSize: 12, color: SHEET_THEME.text, fontWeight: 700 }}>{definition.name}</div>
                    <div style={{ fontSize: 10, color: SHEET_THEME.accent, marginTop: 3 }}>{definition.unit || definition.type}</div>
                    {(definition.targetMin !== null && definition.targetMin !== undefined) || (definition.targetMax !== null && definition.targetMax !== undefined) ? (
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 2,
                        marginTop: 5,
                        padding: '2px 7px',
                        borderRadius: 999,
                        background: '#FFFFFF',
                        border: `1px solid ${SHEET_THEME.borderStrong}`,
                        fontSize: 10,
                        fontWeight: 700,
                        color: SHEET_THEME.primary,
                        whiteSpace: 'nowrap',
                      }}>
                        {definition.targetMin !== null && definition.targetMin !== undefined && definition.targetMax !== null && definition.targetMax !== undefined
                          ? `${definition.targetMin}–${definition.targetMax}${definition.unit ? ` ${definition.unit}` : ''}`
                          : definition.targetMin !== null && definition.targetMin !== undefined
                            ? `≥ ${definition.targetMin}${definition.unit ? ` ${definition.unit}` : ''}`
                            : `≤ ${definition.targetMax}${definition.unit ? ` ${definition.unit}` : ''}`
                        }
                      </div>
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dateColumns.map((dateKey) => (
                <tr key={dateKey}>
                  <td style={{ position: 'sticky', left: 0, zIndex: 1, padding: '11px 12px', borderBottom: `1px solid ${SHEET_THEME.borderStrong}`, background: '#FFFFFF', minWidth: 170, fontSize: 13, fontWeight: 700, color: SHEET_THEME.text }}>
                    {toDateLabel(dateKey, locale)}
                  </td>
                  {filteredDefinitions.map((definition) => {
                    const key = `${definition.id}|${dateKey}`;
                    const value = getCellValue(definition.id, dateKey);
                    const isDirtyCell = Boolean(dirtyCells[key]);

                    return (
                      <td key={key} style={{ padding: 6, borderBottom: `1px solid ${SHEET_THEME.borderStrong}`, background: '#FFFFFF' }}>
                        {definition.type === 'BOOLEAN' ? (
                          <select
                            value={value}
                            onChange={(e) => setCellValue(definition.id, dateKey, e.target.value)}
                            style={{ width: '100%', border: `1px solid ${SHEET_THEME.borderStrong}`, borderRadius: 10, padding: '8px 9px', fontSize: 12, color: SHEET_THEME.text, background: '#FFFFFF', minHeight: 38 }}
                          >
                            <option value="">-</option>
                            <option value="true">{t('clientDetail.metricUi.booleanYes')}</option>
                            <option value="false">{t('clientDetail.metricUi.booleanNo')}</option>
                          </select>
                        ) : (
                          <input
                            value={value}
                            onChange={(e) => setCellValue(definition.id, dateKey, e.target.value)}
                            style={{ width: '100%', border: `1px solid ${SHEET_THEME.borderStrong}`, borderRadius: 10, padding: '8px 9px', fontSize: 12, color: SHEET_THEME.text, background: '#FFFFFF', minHeight: 38 }}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

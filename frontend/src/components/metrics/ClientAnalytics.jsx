import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useMediaQuery from '../../hooks/useMediaQuery';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
} from 'recharts';

// ─── Palette for multi-metric charts ────────────────────────
const METRIC_COLORS = [
  '#5682B1', '#739EC9', '#739EC9', '#5682B1', '#739EC9',
  '#739EC9', '#5682B1', '#739EC9', '#739EC9', '#739EC9',
];

const PRESET_INTERVALS = [
  { label: '7d', days: 7 },
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
  { label: '60d', days: 60 },
  { label: '90d', days: 90 },
];

const THEME = {
  navy: '#2C4F73',
  primary: '#5682B1',
  accent: '#739EC9',
  text: '#0F2438',
  muted: '#577899',
  border: 'rgba(115,158,201,0.45)',
  borderStrong: '#739EC9',
  cardShadow: '0 12px 30px rgba(44,79,115,0.12), 0 2px 8px rgba(0,0,0,0.06)',
  softBg: 'linear-gradient(180deg, #FFFFFF 0%, #F4F9FF 100%)',
  sectionBg: 'linear-gradient(145deg, rgba(255,255,255,0.96) 0%, rgba(236,245,252,0.92) 100%)',
};

// ─── Helpers ────────────────────────────────────────────────

function parseDateKey(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function toShortLabel(dateStr, locale) {
  const d = parseDateKey(`${dateStr}T12:00:00.000Z`);
  if (!d) return dateStr;
  return d.toLocaleDateString(locale, { day: '2-digit', month: 'short' });
}

function getDateRange(intervalDays, customFrom, customTo, useCustom) {
  if (useCustom && customFrom && customTo) {
    const from = parseDateKey(customFrom);
    const to = parseDateKey(`${customTo}T23:59:59`);
    if (from && to) return { from, to };
  }
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date();
  from.setDate(from.getDate() - intervalDays + 1);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

function computeStats(entries, defId, from, to, prevFrom) {
  const numeric = entries.filter(
    (e) => e.metricDefinitionId === defId && e.valueNumber !== null && e.valueNumber !== undefined,
  );

  const current = numeric
    .filter((e) => { const d = new Date(e.recordedAt); return d >= from && d <= to; })
    .sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt));

  const previous = numeric
    .filter((e) => { const d = new Date(e.recordedAt); return d >= prevFrom && d < from; })
    .sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt));

  const avg = (arr) => (arr.length ? arr.reduce((s, e) => s + e.valueNumber, 0) / arr.length : null);

  const currentAvg = avg(current);
  const previousAvg = avg(previous);
  const delta = currentAvg !== null && previousAvg !== null ? currentAvg - previousAvg : null;
  const deltaPercent = previousAvg && delta !== null ? (delta / Math.abs(previousAvg)) * 100 : null;

  const lastEntry = current.at(-1) ?? numeric.at(-1) ?? null;
  const firstEntry = current[0] ?? null;

  const min = current.length ? Math.min(...current.map((e) => e.valueNumber)) : null;
  const max = current.length ? Math.max(...current.map((e) => e.valueNumber)) : null;

  const chartData = current.map((e) => ({
    date: new Date(e.recordedAt).toISOString().slice(0, 10),
    value: Math.round(e.valueNumber * 100) / 100,
  }));

  // All-history chart data
  const allChartData = numeric
    .sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt))
    .map((e) => ({
      date: new Date(e.recordedAt).toISOString().slice(0, 10),
      value: Math.round(e.valueNumber * 100) / 100,
    }));

  return { current, previous, currentAvg, previousAvg, delta, deltaPercent, lastEntry, firstEntry, min, max, chartData, allChartData };
}

// ─── Custom Tooltip ─────────────────────────────────────────

function CustomTooltip({ active, payload, label, locale, unit }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#FFFFFF',
      border: '1px solid #739EC9',
      borderRadius: 10,
      padding: '8px 12px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
      fontSize: 12,
    }}>
      <div style={{ color: '#5682B1', marginBottom: 4 }}>{toShortLabel(label, locale)}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color || '#5682B1', fontWeight: 700 }}>
          {p.name || p.dataKey}: {p.value}{unit ? ` ${unit}` : ''}
        </div>
      ))}
    </div>
  );
}

// ─── Stat Card ───────────────────────────────────────────────

function StatCard({ stat, colorIndex, showChart, onToggleChart, locale, t }) {
  const { def, currentAvg, previousAvg, delta, deltaPercent, lastEntry, min, max, current } = stat;
  const color = METRIC_COLORS[colorIndex % METRIC_COLORS.length];

  const hasDelta = delta !== null;
  const deltaUp = delta > 0;
  const deltaDown = delta < 0;
  const isNeutral = delta === 0;

  const formattedAvg = currentAvg !== null ? (Math.round(currentAvg * 100) / 100).toLocaleString(locale) : '—';

  return (
    <div
      style={{
        background: THEME.softBg,
        borderRadius: 18,
        border: showChart ? `2px solid ${color}` : `1px solid ${THEME.border}`,
        padding: '16px 16px',
        cursor: 'pointer',
        transition: 'all .15s',
        boxShadow: showChart ? `0 0 0 3px ${color}22, ${THEME.cardShadow}` : THEME.cardShadow,
      }}
      onClick={onToggleChart}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: THEME.accent, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {def.name}{def.unit ? ` (${def.unit})` : ''}
          </div>

          <div style={{ fontSize: 28, fontWeight: 800, color: THEME.text, lineHeight: 1.1, marginBottom: 6 }}>
            {formattedAvg}
            {def.unit ? <span style={{ fontSize: 13, fontWeight: 500, color: THEME.muted, marginLeft: 4 }}>{def.unit}</span> : null}
          </div>

          {hasDelta ? (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 8px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              background: '#FFFFFF',
              border: `1px solid ${THEME.border}`,
              color: isNeutral ? THEME.primary : deltaUp ? THEME.navy : THEME.primary,
            }}>
              {isNeutral ? '→' : deltaUp ? '↑' : '↓'}
              {' '}
              {delta > 0 ? '+' : ''}
              {(Math.round(delta * 100) / 100).toLocaleString(locale)}
              {def.unit ? ` ${def.unit}` : ''}
              {deltaPercent !== null ? ` (${delta > 0 ? '+' : ''}${Math.round(deltaPercent)}%)` : ''}
            </div>
          ) : previousAvg === null && current.length > 0 ? (
            <div style={{ fontSize: 11, color: THEME.accent, fontStyle: 'italic' }}>
              {t('clientDetail.metricAnalytics.noPreviousPeriod')}
            </div>
          ) : null}
        </div>

        <div style={{ flexShrink: 0, textAlign: 'right' }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: `${color}1A`,
            border: `1px solid ${color}3A`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16,
          }}>
            📈
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
        {lastEntry && (
          <div style={{ fontSize: 11, color: THEME.primary }}>
            <span style={{ color: THEME.accent }}>{t('clientDetail.metricAnalytics.last')}: </span>
            <span style={{ fontWeight: 700, color: THEME.text }}>{lastEntry.valueNumber}{def.unit ? ` ${def.unit}` : ''}</span>
            <span style={{ color: THEME.accent }}> · {toShortLabel(new Date(lastEntry.recordedAt).toISOString().slice(0, 10), locale)}</span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
        {min !== null && (
          <div style={{ fontSize: 11 }}>
            <span style={{ color: THEME.accent }}>{t('clientDetail.metricAnalytics.min')}: </span>
            <span style={{ color: THEME.text, fontWeight: 600 }}>{min}{def.unit ? ` ${def.unit}` : ''}</span>
          </div>
        )}
        {max !== null && (
          <div style={{ fontSize: 11 }}>
            <span style={{ color: THEME.accent }}>{t('clientDetail.metricAnalytics.max')}: </span>
            <span style={{ color: THEME.text, fontWeight: 600 }}>{max}{def.unit ? ` ${def.unit}` : ''}</span>
          </div>
        )}
        <div style={{ fontSize: 11, marginLeft: 'auto' }}>
          <span style={{ color: THEME.accent }}>{t('clientDetail.metricAnalytics.records')}: </span>
          <span style={{ color: THEME.text, fontWeight: 600 }}>{current.length}</span>
        </div>
      </div>

      <div style={{ marginTop: 10, fontSize: 11, color: color, fontWeight: 600 }}>
        {showChart ? `▲ ${t('clientDetail.metricAnalytics.hideChart')}` : `▼ ${t('clientDetail.metricAnalytics.showChart')}`}
      </div>
    </div>
  );
}

// ─── Metric Chart ────────────────────────────────────────────

function MetricChart({ stat, colorIndex, locale, showAllHistory, t }) {
  const { def, currentAvg, chartData, allChartData } = stat;
  const hasTargetMin = def.targetMin !== null && def.targetMin !== undefined;
  const hasTargetMax = def.targetMax !== null && def.targetMax !== undefined;
  const color = METRIC_COLORS[colorIndex % METRIC_COLORS.length];
  const data = showAllHistory ? allChartData : chartData;

  if (!data.length) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0', color: '#739EC9', fontSize: 13 }}>
        {t('clientDetail.metricAnalytics.noDataInRange')}
      </div>
    );
  }

  // Add short date labels for display
  const chartDataWithLabel = data.map((d) => ({ ...d, label: toShortLabel(d.date, locale) }));

  return (
    <div style={{
      background: THEME.softBg,
      borderRadius: 18,
      border: `1px solid ${THEME.border}`,
      padding: '18px 16px 12px',
      marginTop: 8,
      boxShadow: THEME.cardShadow,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: THEME.text }}>
          {def.name}{def.unit ? ` (${def.unit})` : ''} — {t('clientDetail.metricAnalytics.progress')}
        </div>
        {currentAvg !== null && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <div style={{ fontSize: 11, color: THEME.primary, background: '#FFFFFF', border: `1px solid ${THEME.border}`, borderRadius: 999, padding: '3px 8px' }}>
              {t('clientDetail.metricAnalytics.average')}: <strong style={{ color: THEME.text }}>{Math.round(currentAvg * 100) / 100}{def.unit ? ` ${def.unit}` : ''}</strong>
            </div>
            {(hasTargetMin || hasTargetMax) && (
              <div style={{ fontSize: 11, color: THEME.primary, background: '#FFFFFF', border: `1px solid ${THEME.border}`, borderRadius: 999, padding: '3px 8px', fontWeight: 700 }}>
                {hasTargetMin && hasTargetMax
                  ? `${t('clientDetail.metricAnalytics.target')}: ${def.targetMin}–${def.targetMax}${def.unit ? ` ${def.unit}` : ''}`
                  : hasTargetMin
                    ? `${t('clientDetail.metricAnalytics.target')}: ≥ ${def.targetMin}${def.unit ? ` ${def.unit}` : ''}`
                    : `${t('clientDetail.metricAnalytics.target')}: ≤ ${def.targetMax}${def.unit ? ` ${def.unit}` : ''}`
                }
              </div>
            )}
          </div>
        )}
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartDataWithLabel} margin={{ top: 5, right: 8, bottom: 0, left: -10 }}>
          <defs>
            <linearGradient id={`g-${def.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.2} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#D6E5F4" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: THEME.accent }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 10, fill: THEME.accent }}
            tickLine={false}
            axisLine={false}
            domain={['auto', 'auto']}
          />
          <Tooltip content={<CustomTooltip locale={locale} unit={def.unit} />} />
          {currentAvg !== null && (
            <ReferenceLine
              y={Math.round(currentAvg * 100) / 100}
              stroke={color}
              strokeDasharray="5 3"
              strokeOpacity={0.5}
            />
          )}
          {hasTargetMin && (
            <ReferenceLine
              y={def.targetMin}
              stroke="#5682B1"
              strokeDasharray="4 3"
              strokeOpacity={0.7}
              label={{ value: `min ${def.targetMin}`, position: 'insideBottomLeft', fontSize: 9, fill: '#5682B1' }}
            />
          )}
          {hasTargetMax && (
            <ReferenceLine
              y={def.targetMax}
              stroke="#5682B1"
              strokeDasharray="4 3"
              strokeOpacity={0.7}
              label={{ value: `max ${def.targetMax}`, position: 'insideTopLeft', fontSize: 9, fill: '#5682B1' }}
            />
          )}
          <Area
            type="monotone"
            dataKey="value"
            name={def.name}
            stroke={color}
            strokeWidth={2.5}
            fill={`url(#g-${def.id})`}
            dot={{ fill: color, r: 3, strokeWidth: 0 }}
            activeDot={{ r: 5, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Multi-Metric Overlay Chart ──────────────────────────────

function MultiMetricChart({ stats, colorIndices, locale, t }) {
  // Normalize all metrics to [0, 100] scale for overlay
  const [normalized, setNormalized] = useState(false);

  const allDates = useMemo(() => {
    const dateSet = new Set();
    for (const s of stats) {
      for (const d of s.chartData) dateSet.add(d.date);
    }
    return Array.from(dateSet).sort();
  }, [stats]);

  const chartData = useMemo(() => {
    return allDates.map((date) => {
      const point = { date, label: toShortLabel(date, locale) };
      for (const s of stats) {
        const entry = s.chartData.find((d) => d.date === date);
        if (normalized) {
          const min = s.min ?? 0;
          const max = s.max ?? 1;
          const range = max - min || 1;
          point[s.def.id] = entry ? Math.round(((entry.value - min) / range) * 100) : null;
        } else {
          point[s.def.id] = entry ? entry.value : null;
        }
      }
      return point;
    });
  }, [allDates, stats, normalized, locale]);

  if (!allDates.length) return null;

  return (
    <div style={{
      background: THEME.softBg,
      borderRadius: 18,
      border: `1px solid ${THEME.border}`,
      padding: '18px 16px 12px',
      marginTop: 16,
      boxShadow: THEME.cardShadow,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: THEME.text }}>{t('clientDetail.metricAnalytics.comparison')}</div>
        <button
          type="button"
          onClick={() => setNormalized((p) => !p)}
          style={{
            padding: '4px 10px',
            border: `1px solid ${normalized ? THEME.navy : THEME.borderStrong}`,
            borderRadius: 8,
            background: '#FFFFFF',
            color: normalized ? THEME.navy : THEME.primary,
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {normalized ? t('clientDetail.metricAnalytics.realValues') : t('clientDetail.metricAnalytics.normalize')}
        </button>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={chartData} margin={{ top: 5, right: 8, bottom: 0, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#D6E5F4" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: THEME.accent }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 10, fill: THEME.accent }}
            tickLine={false}
            axisLine={false}
            unit={normalized ? '%' : ''}
          />
          <Tooltip
            contentStyle={{
              background: '#FFFFFF',
              border: `1px solid ${THEME.borderStrong}`,
              borderRadius: 10,
              fontSize: 12,
              boxShadow: THEME.cardShadow,
            }}
            formatter={(value, name) => {
              const def = stats.find((s) => s.def.id === name)?.def;
              if (value === null || value === undefined) return ['—', def?.name || name];
              return [`${value}${normalized ? '%' : (def?.unit ? ` ${def.unit}` : '')}`, def?.name || name];
            }}
            labelStyle={{ color: THEME.primary, marginBottom: 4 }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            formatter={(value) => {
              const def = stats.find((s) => s.def.id === value)?.def;
              return def?.name || value;
            }}
          />
          {stats.map((s, i) => (
            <Line
              key={s.def.id}
              type="monotone"
              dataKey={s.def.id}
              name={s.def.id}
              stroke={METRIC_COLORS[colorIndices[i] % METRIC_COLORS.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────

export default function ClientAnalytics({ definitions, allEntries, locale }) {
  const { t } = useTranslation();
  const isMobile = useMediaQuery('(max-width: 760px)');
  const [intervalDays, setIntervalDays] = useState(30);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [activeChartIds, setActiveChartIds] = useState(new Set());
  const [showAllHistory, setShowAllHistory] = useState(false);

  const numericDefs = useMemo(
    () => definitions.filter((d) => d.type === 'NUMBER' || d.type === 'SCALE'),
    [definitions],
  );

  const { from, to } = useMemo(
    () => getDateRange(intervalDays, customFrom, customTo, useCustom),
    [intervalDays, customFrom, customTo, useCustom],
  );

  const prevFrom = useMemo(() => {
    if (useCustom && customFrom && customTo) {
      const span = to.getTime() - from.getTime();
      return new Date(from.getTime() - span);
    }
    const d = new Date(from);
    d.setDate(d.getDate() - intervalDays);
    return d;
  }, [from, to, intervalDays, useCustom, customFrom, customTo]);

  const stats = useMemo(
    () => numericDefs.map((def) => ({ def, ...computeStats(allEntries, def.id, from, to, prevFrom) })),
    [numericDefs, allEntries, from, to, prevFrom],
  );

  const toggleChart = (id) => {
    setActiveChartIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const activeStats = stats.filter((s) => activeChartIds.has(s.def.id));

  const fieldStyle = {
    border: `1px solid ${THEME.borderStrong}`,
    borderRadius: 10,
    padding: isMobile ? '10px 11px' : '8px 10px',
    fontSize: isMobile ? 13 : 12,
    color: THEME.text,
    background: '#FFFFFF',
  };

  if (numericDefs.length === 0) {
    return (
      <div style={{
        padding: '28px 20px',
        textAlign: 'center',
        background: THEME.softBg,
        borderRadius: 18,
        border: `1.5px dashed ${THEME.borderStrong}`,
      }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>📊</div>
        <div style={{ fontSize: 13, color: THEME.primary, fontWeight: 500 }}>
          {t('clientDetail.metricAnalytics.noNumericMetrics')}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div style={{ fontSize: isMobile ? 15 : 14, fontWeight: 800, color: THEME.text }}>{t('clientDetail.metricAnalytics.title')}</div>
        {activeChartIds.size > 0 && (
          <button
            type="button"
            onClick={() => setActiveChartIds(new Set())}
            style={{ background: 'none', border: 'none', color: THEME.primary, fontSize: 12, cursor: 'pointer', fontWeight: 700 }}
          >
            {t('clientDetail.metricAnalytics.closeCharts')}
          </button>
        )}
      </div>

      {/* Period Selector */}
      <div style={{
        background: THEME.sectionBg,
        borderRadius: 18,
        border: `1px solid ${THEME.border}`,
        padding: isMobile ? '14px 12px' : '14px 16px',
        marginBottom: 16,
        boxShadow: THEME.cardShadow,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: THEME.primary, marginBottom: 10, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
          {t('clientDetail.metricAnalytics.analysisRange')}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {PRESET_INTERVALS.map(({ label, days }) => (
            <button
              key={days}
              type="button"
              onClick={() => { setIntervalDays(days); setUseCustom(false); }}
              style={{
                padding: isMobile ? '8px 14px' : '6px 14px',
                borderRadius: 999,
                border: `1px solid ${!useCustom && intervalDays === days ? THEME.navy : THEME.borderStrong}`,
                background: !useCustom && intervalDays === days ? 'linear-gradient(135deg, #FFFFFF 0%, #EAF3FC 100%)' : '#FFFFFF',
                color: !useCustom && intervalDays === days ? THEME.navy : THEME.primary,
                fontSize: isMobile ? 13 : 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setUseCustom((p) => !p)}
            style={{
              padding: isMobile ? '8px 14px' : '6px 14px',
              borderRadius: 999,
              border: `1px solid ${useCustom ? THEME.navy : THEME.borderStrong}`,
              background: useCustom ? 'linear-gradient(135deg, #FFFFFF 0%, #EAF3FC 100%)' : '#FFFFFF',
              color: useCustom ? THEME.navy : THEME.primary,
              fontSize: isMobile ? 13 : 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {t('clientDetail.metricAnalytics.custom')}
          </button>

          <div style={{ marginLeft: isMobile ? 0 : 'auto', display: 'flex', alignItems: 'center', gap: 6, width: isMobile ? '100%' : 'auto' }}>
            <button
              type="button"
              onClick={() => setShowAllHistory((p) => !p)}
              style={{
                padding: isMobile ? '9px 10px' : '5px 10px',
                borderRadius: 8,
                border: `1px solid ${THEME.borderStrong}`,
                background: '#FFFFFF',
                color: showAllHistory ? THEME.navy : THEME.primary,
                fontSize: isMobile ? 12 : 11,
                fontWeight: 600,
                cursor: 'pointer',
                width: isMobile ? '100%' : 'auto',
              }}
            >
              {showAllHistory ? t('clientDetail.metricAnalytics.chartAllHistory') : t('clientDetail.metricAnalytics.chartPeriod')}
            </button>
          </div>
        </div>

        {useCustom && (
          <div style={{ display: 'grid', gap: 10, marginTop: 12, gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(220px, max-content))' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: THEME.primary }}>{t('clientDetail.metricAnalytics.from')}</label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                style={fieldStyle}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: THEME.primary }}>{t('clientDetail.metricAnalytics.to')}</label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                style={fieldStyle}
              />
            </div>
          </div>
        )}

        {/* Current period label */}
        <div style={{ marginTop: 10, fontSize: 11, color: THEME.accent, display: 'grid', gap: 6 }}>
          <div>
            {t('clientDetail.metricAnalytics.currentPeriod')}: 
            <strong style={{ color: THEME.primary }}>
            {from.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })}
            {' → '}
            {to.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })}
            </strong>
          </div>
          <div>
            {t('clientDetail.metricAnalytics.previousPeriod')}: 
            <strong style={{ color: THEME.primary }}>
            {prevFrom.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })}
            {' → '}
            {from.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })}
            </strong>
          </div>
        </div>
      </div>

      {/* Stats Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: isMobile ? 10 : 12,
        marginBottom: 16,
      }}>
        {stats.map((stat, i) => (
          <StatCard
            key={stat.def.id}
            stat={stat}
            colorIndex={i}
            showChart={activeChartIds.has(stat.def.id)}
            onToggleChart={() => toggleChart(stat.def.id)}
            locale={locale}
            t={t}
          />
        ))}
      </div>

      {/* Individual Charts */}
      {activeStats.map((stat, i) => (
        <MetricChart
          key={stat.def.id}
          stat={stat}
          colorIndex={stats.findIndex((s) => s.def.id === stat.def.id)}
          locale={locale}
          showAllHistory={showAllHistory}
          t={t}
        />
      ))}

      {/* Multi-metric overlay chart */}
      {activeStats.length >= 2 && (
        <MultiMetricChart
          stats={activeStats}
          colorIndices={activeStats.map((s) => stats.findIndex((st) => st.def.id === s.def.id))}
          locale={locale}
          t={t}
        />
      )}

      {/* Hint when no chart is open */}
      {activeStats.length === 0 && stats.some((s) => s.current.length > 0) && (
        <div style={{
          textAlign: 'center',
          padding: '16px',
          color: '#739EC9',
          fontSize: 12,
          background: '#FFFFFF',
          borderRadius: 12,
          border: '1.5px dashed #739EC9',
        }}>
          {t('clientDetail.metricAnalytics.hintOpenChart')}
          {' '}
          {t('clientDetail.metricAnalytics.hintCompare')}
        </div>
      )}
    </div>
  );
}

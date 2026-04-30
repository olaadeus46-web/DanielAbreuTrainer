import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { clientsApi, metricsApi, workoutsApi, photosApi, packagesApi } from '../services/api';
import { useTranslation } from 'react-i18next';
import useMediaQuery from '../hooks/useMediaQuery';
import BrandLoadingScreen from '../components/ui/BrandLoadingScreen';
import MetricSheet from '../components/metrics/MetricSheet';
import ClientAnalytics from '../components/metrics/ClientAnalytics';
import { useAppFeedback } from '../components/ui/FeedbackProvider';

const card = {
  background: '#FFFFFF',
  borderRadius: 20,
  padding: '20px 24px',
  boxShadow: '0 18px 40px rgba(16,37,60,0.08)',
  border: '1px solid rgba(159,189,217,0.24)',
  marginBottom: 16,
};

const EXERCISE_LIBRARY = [
  'Agachamento', 'Supino', 'Remada Curvada', 'Levantamento Terra',
  'Leg Press', 'Extensora', 'Flexora', 'Desenvolvimento Ombros',
  'Elevação Lateral', 'Puxada Alta', 'Bíceps Curl', 'Tríceps Polia',
  'Prancha', 'Abdominal', 'Passadeira', 'Bicicleta',
];

const WORKOUT_DOCUMENT_PREFIX = '__FITCOACH_WORKOUT_V2__';

function emptyWorkoutDraft(dayLabels) {
  return {
    name: 'Trainingsplan',
    notes: '',
    days: dayLabels.map((label, dayOfWeek) => ({
      dayOfWeek,
      label: '',
      exercises: [],
    })),
    document: null,
  };
}

function formatWorkoutHeight(value) {
  if (value === null || value === undefined || value === '') return '';
  const numeric = Number(value);
  if (!Number.isNaN(numeric)) {
    const normalized = numeric > 3 ? numeric / 100 : numeric;
    return `${normalized.toFixed(2).replace('.', ',')}m`;
  }
  return String(value).trim();
}

function formatWorkoutMeasure(value, suffix) {
  if (value === null || value === undefined || value === '') return '';
  return `${String(value).trim().replace('.', ',')}${suffix}`;
}

function normalizeWorkoutRow(row = {}) {
  return {
    block: String(row.block || ''),
    exercise: String(row.exercise || row.name || ''),
    sets: row.sets !== undefined && row.sets !== null ? String(row.sets) : '',
    reps: row.reps !== undefined && row.reps !== null ? String(row.reps) : '',
    load: row.load !== undefined && row.load !== null ? String(row.load) : '',
  };
}

function buildDefaultWorkoutDocument(client) {
  return {
    planCode: '',
    planDate: new Date().toISOString().slice(0, 10),
    goalUntilNextAppointment: client?.goal || '',
    priorities: client?.trainingPlanNotes || '',
    warmup: '5-10 min - Herzfrequenz langsam steigern und den Körper mobil vorbereiten.',
    trainingTitle: 'Ganzkörper Training 2-3x pro Woche',
    workoutRows: [],
    executionNotes: [
      'Alle Übungen bis zur mittleren Ausbelastung durchführen.',
      'Alle Ausführungen ohne Schwung und kontrolliert ausführen.',
      'Pause zwischen Sätzen: 30 Sekunden.',
    ].join('\n'),
    nutritionNotes: client?.nutritionHabits || [
      '3-4 Mahlzeiten pro Tag mit Fokus auf Protein.',
      'Priorität bei jeder Mahlzeit: Protein -> Gemüse/Salat -> Kohlenhydrate.',
      '2-2,5L Wasser pro Tag und möglichst natürliche Lebensmittel bevorzugen.',
      '30g Whey Protein nach dem Training oder zwischen Mahlzeiten.',
    ].join('\n'),
    closingMessage: 'Ich freue mich auf deine Ergebnisse!',
    personalData: {
      name: client?.name || '',
      birthDate: client?.birthDate ? toInputDate(client.birthDate) : '',
      height: formatWorkoutHeight(client?.heightCm),
      weight: formatWorkoutMeasure(client?.initialWeight, 'kg'),
      waist: formatWorkoutMeasure(client?.waistCircumferenceCm, 'cm'),
    },
  };
}

function parseStructuredWorkoutDocument(notes) {
  if (typeof notes !== 'string' || !notes.startsWith(WORKOUT_DOCUMENT_PREFIX)) return null;

  try {
    const parsed = JSON.parse(notes.slice(WORKOUT_DOCUMENT_PREFIX.length).trim());
    return parsed?.document && typeof parsed.document === 'object' ? parsed.document : parsed;
  } catch {
    return null;
  }
}

function buildWorkoutDocumentFromPlan({ client, plan, dayLabels }) {
  const base = buildDefaultWorkoutDocument(client);
  const structured = parseStructuredWorkoutDocument(plan?.notes);

  if (structured) {
    return {
      ...base,
      ...structured,
      personalData: {
        ...base.personalData,
        ...(structured.personalData || {}),
      },
      workoutRows: Array.isArray(structured.workoutRows)
        ? structured.workoutRows.map((row) => normalizeWorkoutRow(row))
        : [],
    };
  }

  const rows = [];
  for (const day of plan?.days || []) {
    if (!Array.isArray(day?.exercises) || day.exercises.length === 0) continue;

    const blockLabel = day.label || dayLabels?.[day.dayOfWeek] || `Block ${rows.length + 1}`;
    day.exercises.forEach((exercise, index) => {
      rows.push({
        block: index === 0 ? blockLabel : '',
        exercise: exercise?.name || '',
        sets: exercise?.sets ?? '',
        reps: exercise?.reps || '',
        load: exercise?.load || '',
      });
    });
  }

  return {
    ...base,
    planDate: plan?.updatedAt ? toInputDate(plan.updatedAt) : base.planDate,
    trainingTitle: plan?.name || base.trainingTitle,
    executionNotes: plan?.notes || base.executionNotes,
    workoutRows: rows,
  };
}

function serializeStructuredWorkoutDocument(document) {
  return `${WORKOUT_DOCUMENT_PREFIX}\n${JSON.stringify({ version: 2, document })}`;
}

function buildWorkoutDaysFromDocument(dayLabels, document) {
  const rows = Array.isArray(document?.workoutRows)
    ? document.workoutRows
      .map((row) => normalizeWorkoutRow(row))
      .filter((row) => row.exercise.trim())
    : [];

  return dayLabels.map((label, dayOfWeek) => ({
    dayOfWeek,
    label: dayOfWeek === 0 ? (document?.trainingTitle || 'Trainingsplan') : '',
    exercises: dayOfWeek === 0
      ? rows.map((row) => ({
        name: row.exercise,
        sets: row.sets,
        reps: row.reps,
        load: row.load,
        restSeconds: '',
        notes: row.block,
        videoUrl: '',
      }))
      : [],
  }));
}

function formatWorkoutHeaderDate(value, locale) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' });
}

function toInputDate(value) {
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toISOString().slice(0, 10);
}

function paymentBadge(status, t) {
  const map = {
    PAID: ['#FFFFFF', '#5682B1', t('common.payment.paid')],
    OVERDUE: ['#FFFFFF', '#5682B1', t('common.payment.overdue')],
    PENDING: ['#FFFFFF', '#5682B1', t('common.payment.pending')],
  };
  return map[status] || map.PENDING;
}

function formatCurrency(value) {
  return `CHF ${Number(value || 0).toFixed(0)}`;
}

function formatDisplayDate(value, locale) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatMetricValue(entry) {
  if (entry.valueNumber !== null && entry.valueNumber !== undefined) return entry.valueNumber;
  if (entry.valueBoolean !== null && entry.valueBoolean !== undefined) return entry.valueBoolean ? 'Sim' : 'Não';
  return entry.valueText || '—';
}

const STRUCTURED_CHECKIN_TEMPLATE = 'progress-review-v1';

const STRUCTURED_CHECKIN_SECTIONS = [
  {
    titleKey: 'trainingRoutineTitle',
    questions: [
      { key: 'trainingFrequency', labelKey: 'trainingFrequencyQuestion', rows: 2 },
      { key: 'whatWorkedWell', labelKey: 'whatWorkedWellQuestion', rows: 3 },
      { key: 'whatWasDifficult', labelKey: 'whatWasDifficultQuestion', rows: 3 },
    ],
  },
  {
    titleKey: 'wellbeingTitle',
    questions: [
      { key: 'wellbeingComparison', labelKey: 'wellbeingComparisonQuestion', rows: 3 },
      { key: 'wellbeingScore', labelKey: 'wellbeingScoreQuestion', type: 'scale' },
    ],
  },
  {
    titleKey: 'goalsTitle',
    questions: [
      { key: 'nextGoalsPlanAdjustments', labelKey: 'nextGoalsPlanAdjustmentsQuestion', rows: 3 },
    ],
  },
];

function emptyCheckInForm() {
  return {
    frequency: 'DAILY',
    periodLabel: '',
    clientComment: '',
    trainingFrequency: '',
    whatWorkedWell: '',
    whatWasDifficult: '',
    wellbeingComparison: '',
    wellbeingScore: '',
    nextGoalsPlanAdjustments: '',
  };
}

function extractLegacyCheckInText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && typeof value.text === 'string') return value.text;
  return '';
}

function extractStructuredCheckInAnswers(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.template !== STRUCTURED_CHECKIN_TEMPLATE) return null;
  if (!value.answers || typeof value.answers !== 'object' || Array.isArray(value.answers)) return null;
  return value.answers;
}

function buildStructuredCheckInPayload(form) {
  const answers = {
    trainingFrequency: form.trainingFrequency.trim(),
    whatWorkedWell: form.whatWorkedWell.trim(),
    whatWasDifficult: form.whatWasDifficult.trim(),
    wellbeingComparison: form.wellbeingComparison.trim(),
    wellbeingScore: form.wellbeingScore ? String(form.wellbeingScore) : '',
    nextGoalsPlanAdjustments: form.nextGoalsPlanAdjustments.trim(),
  };

  const hasAnswers = Object.values(answers).some((value) => value !== '');
  if (!hasAnswers) {
    return { coachQuestions: null, clientResponses: null };
  }

  return {
    coachQuestions: {
      template: STRUCTURED_CHECKIN_TEMPLATE,
      version: 1,
      sections: STRUCTURED_CHECKIN_SECTIONS.map((section) => ({
        titleKey: section.titleKey,
        questions: section.questions.map((question) => question.key),
      })),
    },
    clientResponses: {
      template: STRUCTURED_CHECKIN_TEMPLATE,
      version: 1,
      answers,
    },
  };
}

function QuickIconButton({ title, onClick, children, disabled, bg = '#FFFFFF', color = '#000000', border = '1px solid #739EC9' }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 36,
        height: 36,
        borderRadius: 11,
        border,
        background: bg,
        color,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        opacity: disabled ? 0.5 : 1,
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

function QuickActionButton({ children, onClick, disabled, primary = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        minHeight: 40,
        padding: '0 14px',
        borderRadius: 12,
        border: primary ? 'none' : '1px solid #739EC9',
        background: primary ? '#5682B1' : '#FFFFFF',
        color: primary ? '#FFFFFF' : '#000000',
        fontSize: 12,
        fontWeight: 800,
        cursor: 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

function SlidePanel({ title, subtitle, onClose, children, footer }) {
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
          width: 'min(760px, 100%)',
          maxHeight: '86vh',
          overflow: 'auto',
          borderRadius: 24,
          background: 'linear-gradient(180deg, #FFFFFF 0%, #FFFFFF 100%)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.28)',
          border: '1px solid rgba(115,158,201,0.9)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '18px 18px 10px' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#000000' }}>{title}</div>
            {subtitle ? <div style={{ marginTop: 4, fontSize: 12, color: '#5682B1' }}>{subtitle}</div> : null}
          </div>
          <QuickIconButton title="Fechar" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </QuickIconButton>
        </div>
        <div style={{ padding: '6px 18px 18px' }}>{children}</div>
        {footer ? <div style={{ padding: '0 18px 18px' }}>{footer}</div> : null}
      </div>
    </div>
  );
}

export default function ClientDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { confirm, showError, showSuccess, showToast, showWarning } = useAppFeedback();
  const isMobile = useMediaQuery('(max-width: 760px)');
  const isTablet = useMediaQuery('(max-width: 1100px)');

  const [activeTab, setActiveTab] = useState('dashboard');
  const [client, setClient] = useState(null);
  const [dashboardEntries, setDashboardEntries] = useState([]);
  const [checkIns, setCheckIns] = useState([]);
  const [definitions, setDefinitions] = useState([]);
  const [allEntries, setAllEntries] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [plan, setPlan] = useState(null);
  const [allClients, setAllClients] = useState([]);
  const [packages, setPackages] = useState([]);

  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingOnlineStatus, setSavingOnlineStatus] = useState(false);
  const [savingCheckIn, setSavingCheckIn] = useState(false);
  const [creatingCheckInLink, setCreatingCheckInLink] = useState(false);
  const [savingWorkout, setSavingWorkout] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showCheckInPanel, setShowCheckInPanel] = useState(false);
  const [activeCheckInLinks, setActiveCheckInLinks] = useState([]);
  const [copiedCheckInLinkId, setCopiedCheckInLinkId] = useState('');
  const [feedbackEntries, setFeedbackEntries] = useState([]);
  const [creatingFeedbackLink, setCreatingFeedbackLink] = useState(false);
  const [activeFeedbackLinks, setActiveFeedbackLinks] = useState([]);
  const [copiedFeedbackLinkId, setCopiedFeedbackLinkId] = useState('');

  const [editingProfile, setEditingProfile] = useState(false);
  const [originalProfileForm, setOriginalProfileForm] = useState({});

  const [profileForm, setProfileForm] = useState({
    name: '',
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

  const [checkInForm, setCheckInForm] = useState(emptyCheckInForm);
  const [workoutDraft, setWorkoutDraft] = useState(null);
  const [originalWorkoutDraft, setOriginalWorkoutDraft] = useState(null);
  const [editingWorkout, setEditingWorkout] = useState(false);
  const [duplicateFromClientId, setDuplicateFromClientId] = useState('');
  const [showWorkoutMenu, setShowWorkoutMenu] = useState(false);
  const [activeWorkoutPanel, setActiveWorkoutPanel] = useState('');
  const [activeWorkoutDayIndex, setActiveWorkoutDayIndex] = useState(null);
  const [expandedExerciseIndex, setExpandedExerciseIndex] = useState(null);
  const [extractingWorkoutAi, setExtractingWorkoutAi] = useState(false);
  const [workoutImportFile, setWorkoutImportFile] = useState(null);
  const workoutMenuRef = useRef(null);

  const [galleryForm, setGalleryForm] = useState({ takenAt: '', notes: '', tags: '' });
  const [galleryPhotoFile, setGalleryPhotoFile] = useState(null);
  const [compareIds, setCompareIds] = useState({ before: '', after: '' });

  const locale = { en: 'en-US', pt: 'pt-PT', de: 'de-DE' }[i18n.language] || 'en-US';
  const dayLabels = t('clientDetail.days', { returnObjects: true });

  const loadAll = async () => {
    const [
      clientRes,
      dashboardRes,
      workoutRes,
      defsRes,
      photosRes,
      entriesRes,
      checkInsRes,
      checkInLinksRes,
      feedbackRes,
      feedbackLinksRes,
      clientsRes,
      packagesRes,
    ] = await Promise.all([
      clientsApi.get(id),
      clientsApi.dashboard(id),
      workoutsApi.get(id),
      metricsApi.listDefinitions(id),
      photosApi.list(id),
      metricsApi.listEntries({ clientId: id }),
      metricsApi.listCheckIns(id),
      metricsApi.listCheckInLinks(id),
      clientsApi.listFeedback(id),
      clientsApi.listFeedbackLinks(id),
      clientsApi.list(),
      packagesApi.list().catch(() => ({ data: [] })),
    ]);

    setClient(clientRes.data);
    setDashboardEntries(dashboardRes.data.entries || []);
    setPlan(workoutRes.data);
    setDefinitions(defsRes.data || []);
    setPhotos(photosRes.data || []);
    setAllEntries(entriesRes.data || []);
    setCheckIns(checkInsRes.data || []);
    setActiveCheckInLinks(checkInLinksRes.data || []);
    setFeedbackEntries(feedbackRes.data || []);
    setActiveFeedbackLinks(feedbackLinksRes.data || []);
    setAllClients((clientsRes.data || []).filter((c) => c.id !== id));
    setPackages(packagesRes.data || []);
  };

  useEffect(() => {
    setLoading(true);
    loadAll().catch((err) => {
      showError(err.response?.data?.error || t('clientDetail.loadError'));
    }).finally(() => setLoading(false));
  }, [id, showError, t]);

  useEffect(() => {
    if (!client) return;
    setProfileForm({
      name: client.name || '',
      phone: client.phone || '',
      heightCm: client.heightCm ?? '',
      age: client.age ?? '',
      initialWeight: client.initialWeight ?? '',
      waistCircumferenceCm: client.waistCircumferenceCm ?? '',
      birthDate: toInputDate(client.birthDate),
      address: client.address || '',
      startDate: toInputDate(client.startDate),
      goal: client.goal || '',
      gymExperience: client.gymExperience || '',
      motivation: client.motivation || '',
      activityAndWork: client.activityAndWork || '',
      trainingAvailability: client.trainingAvailability || '',
      nutritionHabits: client.nutritionHabits || '',
      healthIssues: client.healthIssues || '',
      trainingPlanNotes: client.trainingPlanNotes || '',
      trainingFrequency: client.trainingFrequency ?? '',
      pricingMode: client.packageId ? 'PACKAGE' : 'FIXED',
      packageId: client.packageId || '',
      monthlyPrice: client.monthlyPrice ?? '',
      notes: client.notes || '',
    });
    setOriginalProfileForm({
      name: client.name || '',
      phone: client.phone || '',
      heightCm: client.heightCm ?? '',
      age: client.age ?? '',
      initialWeight: client.initialWeight ?? '',
      waistCircumferenceCm: client.waistCircumferenceCm ?? '',
      birthDate: toInputDate(client.birthDate),
      address: client.address || '',
      startDate: toInputDate(client.startDate),
      goal: client.goal || '',
      gymExperience: client.gymExperience || '',
      motivation: client.motivation || '',
      activityAndWork: client.activityAndWork || '',
      trainingAvailability: client.trainingAvailability || '',
      nutritionHabits: client.nutritionHabits || '',
      healthIssues: client.healthIssues || '',
      trainingPlanNotes: client.trainingPlanNotes || '',
      trainingFrequency: client.trainingFrequency ?? '',
      pricingMode: client.packageId ? 'PACKAGE' : 'FIXED',
      packageId: client.packageId || '',
      monthlyPrice: client.monthlyPrice ?? '',
      notes: client.notes || '',
    });
  }, [client]);

  useEffect(() => {
    if (activeTab !== 'checkins') return undefined;

    const refreshCheckInData = async () => {
      const [checkInsRes, linksRes] = await Promise.all([
        metricsApi.listCheckIns(id),
        metricsApi.listCheckInLinks(id),
      ]);

      setCheckIns(checkInsRes.data || []);
      setActiveCheckInLinks(linksRes.data || []);
    };

    refreshCheckInData().catch(() => {});
    const intervalId = window.setInterval(() => {
      refreshCheckInData().catch(() => {});
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [activeTab, id]);

  useEffect(() => {
    const base = emptyWorkoutDraft(dayLabels);
    const document = buildWorkoutDocumentFromPlan({ client, plan, dayLabels });

    base.name = plan?.name || document.trainingTitle || 'Trainingsplan';
    base.notes = serializeStructuredWorkoutDocument(document);
    base.days = buildWorkoutDaysFromDocument(dayLabels, document);
    base.document = document;

    setWorkoutDraft(base);
    setOriginalWorkoutDraft(JSON.parse(JSON.stringify(base)));
    setEditingWorkout(false);
  }, [client, plan, i18n.language]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setShowWorkoutMenu(false);
        setActiveWorkoutPanel('');
        setActiveWorkoutDayIndex(null);
        setExpandedExerciseIndex(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!showWorkoutMenu) return undefined;

    const handlePointerDown = (event) => {
      if (workoutMenuRef.current && !workoutMenuRef.current.contains(event.target)) {
        setShowWorkoutMenu(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [showWorkoutMenu]);

  const payment = client?.payments?.[0];
  const initials = client?.name?.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

  const weightDef = definitions.find((d) => d.name === 'Peso');
  const weightData = useMemo(() => {
    if (!weightDef) return [];
    return dashboardEntries
      .filter((e) => e.metricDefinitionId === weightDef.id && e.valueNumber !== null)
      .map((e) => ({
        date: new Date(e.recordedAt).toLocaleDateString(locale, { day: '2-digit', month: 'short' }),
        value: e.valueNumber,
      }));
  }, [dashboardEntries, weightDef, locale]);

  const workoutExerciseCount = useMemo(
    () => (workoutDraft?.days || []).reduce((total, day) => total + day.exercises.length, 0),
    [workoutDraft],
  );

  const workoutDaysUsed = useMemo(
    () => (workoutDraft?.days || []).filter((day) => day.exercises.length > 0).length,
    [workoutDraft],
  );

  const tabs = [
    ['dashboard', t('clientDetail.tabs.dashboard')],
    ['profile', t('clientDetail.tabs.profile')],
    ['metrics', t('clientDetail.tabs.metrics')],
    ['checkins', t('clientDetail.tabs.checkins')],
    ['feedback', t('clientDetail.tabs.feedback')],
    ['workout', t('clientDetail.tabs.workout')],
  ];

  const fieldStyle = {
    width: '100%',
    border: '1px solid rgba(159,189,217,0.36)',
    borderRadius: 14,
    padding: '11px 12px',
    fontSize: 13,
    color: '#10253C',
    background: '#FFFFFF',
  };

  const labelStyle = {
    display: 'block',
    fontSize: 11,
    fontWeight: 700,
    color: '#6B86A3',
    marginBottom: 6,
    letterSpacing: '0.06em',
  };

  const renderStructuredCheckInAnswers = (item) => {
    const answers = extractStructuredCheckInAnswers(item.clientResponses);
    if (!answers) return null;

    return (
      <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
        {STRUCTURED_CHECKIN_SECTIONS.map((section) => (
          <div key={section.titleKey}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#000000', marginBottom: 6 }}>
              {t(`clientDetail.structuredCheckin.${section.titleKey}`)}
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {section.questions.map((question) => {
                const value = answers[question.key];
                if (!value) return null;

                return (
                  <div key={question.key}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#5682B1', marginBottom: 2 }}>
                      {t(`clientDetail.structuredCheckin.${question.labelKey}`)}
                    </div>
                    <div style={{ fontSize: 12, color: '#000000', whiteSpace: 'pre-wrap' }}>{value}</div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const countStructuredCheckInAnswers = (item) => {
    const answers = extractStructuredCheckInAnswers(item.clientResponses);
    if (!answers) return 0;
    return Object.values(answers).filter((value) => String(value || '').trim() !== '').length;
  };

  const formatCheckInDate = (value) => new Date(value).toLocaleString(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const activeCheckInLink = activeCheckInLinks[0] || null;
  const activeFeedbackLink = activeFeedbackLinks[0] || null;

  const copyCheckInLink = async (link) => {
    if (!link?.publicUrl) return;

    try {
      await navigator.clipboard.writeText(link.publicUrl);
      setCopiedCheckInLinkId(link.id);
      window.setTimeout(() => {
        setCopiedCheckInLinkId((current) => (current === link.id ? '' : current));
      }, 2200);
    } catch {
      showToast(link.publicUrl, { title: 'Link' });
    }
  };

  const generateCheckInLink = async () => {
    setCreatingCheckInLink(true);
    try {
      const response = await metricsApi.createCheckInLink({ clientId: id });
      setActiveCheckInLinks(response.data ? [response.data] : []);
      await copyCheckInLink(response.data);
    } catch (err) {
      showError(err.response?.data?.error || t('clientDetail.structuredCheckin.linkCreateError'));
    } finally {
      setCreatingCheckInLink(false);
    }
  };

  const copyFeedbackLink = async (link) => {
    if (!link?.publicUrl) return;

    try {
      await navigator.clipboard.writeText(link.publicUrl);
      setCopiedFeedbackLinkId(link.id);
      window.setTimeout(() => {
        setCopiedFeedbackLinkId((current) => (current === link.id ? '' : current));
      }, 2200);
    } catch {
      showToast(link.publicUrl, { title: 'Link' });
    }
  };

  const generateFeedbackLink = async () => {
    setCreatingFeedbackLink(true);
    try {
      const response = await clientsApi.createFeedbackLink(id, {});
      setActiveFeedbackLinks(response.data ? [response.data] : []);
      await copyFeedbackLink(response.data);
    } catch (err) {
      showError(err.response?.data?.error || t('clientDetail.structuredFeedback.linkCreateError'));
    } finally {
      setCreatingFeedbackLink(false);
    }
  };

  const updateProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const payload = {
        ...profileForm,
        packageId: profileForm.pricingMode === 'PACKAGE' ? profileForm.packageId : null,
        monthlyPrice: profileForm.pricingMode === 'PACKAGE' ? undefined : profileForm.monthlyPrice,
      };

      if (payload.packageId === '') payload.packageId = null;
      if (profileForm.pricingMode === 'PACKAGE' && !payload.packageId) {
        throw new Error(t('clients.modal.packageRequired'));
      }

      await clientsApi.update(id, payload);
      await loadAll();
      setOriginalProfileForm({ ...profileForm });
      setEditingProfile(false);
    } catch (err) {
      showError(err.response?.data?.error || t('clientDetail.saveError'));
    } finally {
      setSavingProfile(false);
    }
  };

  const removeClient = async () => {
    if (!(await confirm(t('clientDetail.confirmDelete')))) return;
    try {
      await clientsApi.delete(id);
      navigate('/clients');
    } catch (err) {
      showError(err.response?.data?.error || t('clientDetail.deleteError'));
    }
  };

  const toggleOnlineStatus = async () => {
    if (!client) return;

    setSavingOnlineStatus(true);
    try {
      const nextOnlineStatus = !client.isOnline;
      await clientsApi.update(id, { isOnline: nextOnlineStatus });

      setClient((prev) => (prev ? { ...prev, isOnline: nextOnlineStatus } : prev));
      setProfileForm((prev) => ({ ...prev }));
      setOriginalProfileForm((prev) => ({ ...prev }));
    } catch (err) {
      showError(err.response?.data?.error || 'Não foi possível atualizar o estado online deste cliente.');
    } finally {
      setSavingOnlineStatus(false);
    }
  };

  const saveCheckIn = async (e) => {
    e.preventDefault();

    const questionnairePayload = buildStructuredCheckInPayload(checkInForm);

    setSavingCheckIn(true);
    try {
      const checkInRes = await metricsApi.createCheckIn({
        clientId: id,
        frequency: checkInForm.frequency,
        periodLabel: checkInForm.periodLabel || null,
        clientComment: checkInForm.clientComment || null,
        coachQuestions: questionnairePayload.coachQuestions,
        clientResponses: questionnairePayload.clientResponses,
        entries: [],
      });

      setCheckInForm(emptyCheckInForm());
      setShowCheckInPanel(false);
      await loadAll();
    } catch (err) {
      showError(err.response?.data?.error || t('clientDetail.checkinError'));
    } finally {
      setSavingCheckIn(false);
    }
  };

  const updateWorkoutDay = (dayIndex, update) => {
    setWorkoutDraft((prev) => {
      const next = { ...prev, days: [...prev.days] };
      next.days[dayIndex] = update(next.days[dayIndex]);
      return next;
    });
  };

  const updateWorkoutExercise = (dayIndex, exerciseIndex, patch) => {
    updateWorkoutDay(dayIndex, (day) => {
      const exercises = [...day.exercises];
      exercises[exerciseIndex] = { ...exercises[exerciseIndex], ...patch };
      return { ...day, exercises };
    });
  };

  const addExercise = (dayIndex, presetName = '') => {
    updateWorkoutDay(dayIndex, (day) => ({
      ...day,
      exercises: [...day.exercises, { name: presetName, sets: '', reps: '', load: '', restSeconds: '', notes: '', videoUrl: '' }],
    }));
    setActiveWorkoutDayIndex(dayIndex);
    setActiveWorkoutPanel('day');
    setExpandedExerciseIndex(workoutDraft?.days?.[dayIndex]?.exercises?.length ?? 0);
  };

  const removeExercise = (dayIndex, exerciseIndex) => {
    updateWorkoutDay(dayIndex, (day) => ({
      ...day,
      exercises: day.exercises.filter((_, idx) => idx !== exerciseIndex),
    }));
    setExpandedExerciseIndex((prev) => {
      if (prev === null) return prev;
      if (prev === exerciseIndex) return null;
      return prev > exerciseIndex ? prev - 1 : prev;
    });
  };

  const updateWorkoutDocument = (updater) => {
    setWorkoutDraft((prev) => {
      if (!prev) return prev;
      const nextDocument = typeof updater === 'function' ? updater(prev.document || buildDefaultWorkoutDocument(client)) : updater;
      return { ...prev, document: nextDocument };
    });
  };

  const updateWorkoutDocumentField = (field, value) => {
    updateWorkoutDocument((current) => ({ ...current, [field]: value }));
  };

  const updateWorkoutPersonalField = (field, value) => {
    updateWorkoutDocument((current) => ({
      ...current,
      personalData: {
        ...(current.personalData || {}),
        [field]: value,
      },
    }));
  };

  const updateWorkoutRow = (rowIndex, patch) => {
    updateWorkoutDocument((current) => {
      const nextRows = [...(current.workoutRows || [])];
      nextRows[rowIndex] = { ...nextRows[rowIndex], ...patch };
      return { ...current, workoutRows: nextRows };
    });
  };

  const addWorkoutRow = (presetName = '') => {
    updateWorkoutDocument((current) => ({
      ...current,
      workoutRows: [...(current.workoutRows || []), { block: '', exercise: presetName, sets: '', reps: '', load: '' }],
    }));
  };

  const removeWorkoutRow = (rowIndex) => {
    updateWorkoutDocument((current) => ({
      ...current,
      workoutRows: (current.workoutRows || []).filter((_, index) => index !== rowIndex),
    }));
  };

  const saveWorkout = async () => {
    if (!workoutDraft) return;
    const document = {
      ...buildDefaultWorkoutDocument(client),
      ...(workoutDraft.document || {}),
      personalData: {
        ...buildDefaultWorkoutDocument(client).personalData,
        ...(workoutDraft.document?.personalData || {}),
      },
      workoutRows: (workoutDraft.document?.workoutRows || [])
        .map((row) => normalizeWorkoutRow(row))
        .filter((row) => row.exercise.trim()),
    };

    setSavingWorkout(true);
    try {
      await workoutsApi.save({
        clientId: id,
        name: workoutDraft.name?.trim() || document.trainingTitle || 'Trainingsplan',
        notes: serializeStructuredWorkoutDocument(document),
        days: buildWorkoutDaysFromDocument(dayLabels, document),
      });
      setOriginalWorkoutDraft(JSON.parse(JSON.stringify({
        ...workoutDraft,
        name: workoutDraft.name?.trim() || document.trainingTitle || 'Trainingsplan',
        notes: serializeStructuredWorkoutDocument(document),
        days: buildWorkoutDaysFromDocument(dayLabels, document),
        document,
      })));
      setEditingWorkout(false);
      setActiveWorkoutPanel('');
      setActiveWorkoutDayIndex(null);
      setExpandedExerciseIndex(null);
      await loadAll();
      showSuccess(t('clientDetail.workoutSaved'));
    } catch (err) {
      showError(err.response?.data?.error || t('clientDetail.workoutError'));
    } finally {
      setSavingWorkout(false);
    }
  };

  const duplicateWorkout = async () => {
    if (!duplicateFromClientId) return;
    setSavingWorkout(true);
    try {
      await workoutsApi.duplicate({ sourceClientId: duplicateFromClientId, targetClientId: id });
      setActiveWorkoutPanel('');
      await loadAll();
      showSuccess(t('clientDetail.workoutDuplicated'));
    } catch (err) {
      showError(err.response?.data?.error || t('clientDetail.workoutError'));
    } finally {
      setSavingWorkout(false);
    }
  };

  const extractWorkoutFromFileWithAi = async () => {
    if (!workoutImportFile) {
      showWarning('Seleciona um PDF ou imagem para preencher o plano.');
      return;
    }

    setExtractingWorkoutAi(true);
    try {
      const formData = new FormData();
      formData.append('clientId', id);
      formData.append('workoutFile', workoutImportFile);

      const response = await workoutsApi.extractAi(formData);
      const extractedFields = response.data?.fields || {};

      setWorkoutDraft((prev) => {
        if (!prev) return prev;

        const nextDocument = { ...(prev.document || buildDefaultWorkoutDocument(client)) };

        for (const [key, value] of Object.entries(extractedFields)) {
          if (key === 'personalData' || key === 'workoutRows') continue;
          if (value === null || value === undefined || value === '') continue;
          nextDocument[key] = String(value);
        }

        if (extractedFields.personalData && typeof extractedFields.personalData === 'object') {
          nextDocument.personalData = { ...(nextDocument.personalData || {}) };
          for (const [key, value] of Object.entries(extractedFields.personalData)) {
            if (value === null || value === undefined || value === '') continue;
            nextDocument.personalData[key] = String(value);
          }
        }

        if (Array.isArray(extractedFields.workoutRows) && extractedFields.workoutRows.length > 0) {
          nextDocument.workoutRows = extractedFields.workoutRows.map((row) => ({
            block: row?.block || '',
            exercise: row?.exercise || '',
            sets: row?.sets || '',
            reps: row?.reps || '',
            load: row?.load || '',
          }));
        }

        return {
          ...prev,
          name: extractedFields.name || prev.name,
          document: nextDocument,
        };
      });

      setWorkoutImportFile(null);
      setActiveWorkoutPanel('');
      showSuccess(`Plano preenchido com AI. ${response.data?.recognizedCount || 0} campo(s) reconhecido(s).`);
    } catch (err) {
      showError(err.response?.data?.error || 'Erro ao analisar o PDF/imagem do plano.');
    } finally {
      setExtractingWorkoutAi(false);
    }
  };

  const uploadGalleryPhoto = async (e) => {
    e.preventDefault();
    if (!galleryPhotoFile) {
      showWarning(t('clientDetail.photoRequired'));
      return;
    }

    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append('photo', galleryPhotoFile);
      formData.append('clientId', id);
      if (galleryForm.notes) formData.append('notes', galleryForm.notes);
      if (galleryForm.takenAt) formData.append('takenAt', galleryForm.takenAt);
      if (galleryForm.tags) {
        galleryForm.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean)
          .forEach((tag) => formData.append('tags', tag));
      }

      await photosApi.upload(formData);
      setGalleryForm({ takenAt: '', notes: '', tags: '' });
      setGalleryPhotoFile(null);
      await loadAll();
    } catch (err) {
      showError(err.response?.data?.error || t('clientDetail.photoUploadError'));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const deletePhoto = async (photoId) => {
    if (!(await confirm(t('clientDetail.confirmDeletePhoto')))) return;
    try {
      await photosApi.delete(photoId);
      await loadAll();
    } catch (err) {
      showError(err.response?.data?.error || t('clientDetail.photoDeleteError'));
    }
  };

  const exportComparison = () => {
    const before = photos.find((p) => p.id === compareIds.before);
    const after = photos.find((p) => p.id === compareIds.after);
    if (!before || !after) return;

    const popup = window.open('', '_blank');
    if (!popup) return;

    popup.document.write(`
      <html>
        <head>
          <title>Before / After</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; }
            h1 { margin-bottom: 20px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
            img { width: 100%; height: auto; border-radius: 8px; }
          </style>
        </head>
        <body>
          <h1>Comparação Antes / Depois</h1>
          <div class="grid">
            <div>
              <h3>Antes (${new Date(before.takenAt).toLocaleDateString(locale)})</h3>
              <img src="${before.url}" alt="Antes" />
            </div>
            <div>
              <h3>Depois (${new Date(after.takenAt).toLocaleDateString(locale)})</h3>
              <img src="${after.url}" alt="Depois" />
            </div>
          </div>
        </body>
      </html>
    `);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  if (loading) return <BrandLoadingScreen />;

  if (!client) return <div style={{ padding: 40, color: '#739EC9' }}>{t('clientDetail.notFound')}</div>;

  const [payBg, payColor, payLabel] = paymentBadge(payment?.status || 'PENDING', t);
  const latestWeight = weightData.length > 0 ? `${weightData[weightData.length - 1].value} kg` : '—';
  const profileSummary = t('clientDetail.profileSummary', {
    start: formatDisplayDate(client.startDate, locale),
    amount: formatCurrency(client.monthlyPrice),
  });

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
        <button onClick={() => navigate('/clients')} style={{
          background: 'none', border: 'none', color: '#C8DBED', fontSize: 12, cursor: 'pointer',
          padding: 0, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700,
        }}>
          {t('clientDetail.backToClients')}
        </button>

        <div style={{ display: 'flex', alignItems: isMobile ? 'stretch' : 'flex-start', justifyContent: 'space-between', gap: 18, flexDirection: isMobile ? 'column' : 'row' }}>
          <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', gap: 16, flexDirection: isMobile ? 'column' : 'row', maxWidth: 760 }}>
            <div style={{
              width: isMobile ? 68 : 58,
              height: isMobile ? 68 : 58,
              borderRadius: '50%',
              background: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              fontWeight: 800,
              color: '#10253C',
              flexShrink: 0,
            }}>
              {initials}
            </div>
            <div style={{ textAlign: isMobile ? 'left' : 'left' }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#C8DBED', marginBottom: 12 }}>
                {t('clientDetail.clientOverview')}
              </div>
              <h1 style={{ fontSize: isMobile ? 24 : 34, lineHeight: 1.05, fontWeight: 800, margin: 0 }}>{client.name}</h1>
              <p style={{ fontSize: isMobile ? 14 : 16, lineHeight: 1.6, color: '#E4EFF9', margin: '12px 0 0', maxWidth: 620 }}>
                {client.goal || profileSummary}
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.14)', color: '#FFFFFF', borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 700 }}>
                  {t('clientDetail.paymentStatus')}: {payLabel}
                </span>
                {client.isOnline ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#EAF8EF', color: '#2D7A47', borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 800 }}>
                    {t('clientDetail.onlineLabel')}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(2, minmax(160px, 1fr))', gap: 10, minWidth: isMobile ? 'auto' : 360 }}>
            {[
              { label: t('clientDetail.monthlyFee'), value: formatCurrency(client.monthlyPrice) },
              { label: t('clientDetail.frequency'), value: `${client.trainingFrequency || 0}${t('clientDetail.perWeek')}` },
              { label: t('clientDetail.programStart'), value: formatDisplayDate(client.startDate, locale) },
              { label: t('clientDetail.latestWeight'), value: latestWeight },
            ].map((item) => (
              <div key={item.label} style={{ padding: '14px 16px', borderRadius: 18, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#C8DBED' }}>{item.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#FFFFFF', marginTop: 8 }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div style={{ display: 'flex', gap: 6, marginBottom: 20, background: '#FFFFFF', padding: 6, borderRadius: 16, width: isMobile ? '100%' : 'fit-content', maxWidth: '100%', boxShadow: '0 18px 40px rgba(16,37,60,0.08)', border: '1px solid rgba(159,189,217,0.24)', overflowX: 'auto' }}>
        {tabs.map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)} style={{
            padding: '10px 18px', border: 'none', borderRadius: 12, fontSize: 13, cursor: 'pointer',
            background: activeTab === key ? '#10253C' : 'transparent',
            color: activeTab === key ? '#FFFFFF' : '#6B86A3',
            fontWeight: activeTab === key ? 700 : 600,
            transition: 'all .15s',
            whiteSpace: 'nowrap',
          }}>{label}</button>
        ))}
      </div>

      {activeTab === 'dashboard' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            {[
              { label: t('clientDetail.initialWeight'), val: client.initialWeight ? `${client.initialWeight} kg` : '—', accent: '#10253C' },
              { label: t('clientDetail.programStart'), val: formatDisplayDate(client.startDate, locale), accent: '#5682B1' },
              { label: t('clientDetail.entries30d'), val: dashboardEntries.length, accent: '#B66A17' },
              { label: t('clientDetail.checkinsCount'), val: checkIns.length, accent: '#2D7A47' },
            ].map(({ label, val, accent }) => (
              <div key={label} style={{ ...card, marginBottom: 0, padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: '0 auto auto 0', width: 6, height: '100%', background: accent }} />
                <div style={{ marginLeft: 8 }}>
                  <div style={{ fontSize: 11, color: '#6B86A3', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
                  <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 800, color: '#10253C' }}>{val}</div>
                  <div style={{ fontSize: 12, color: '#6B86A3', marginTop: 4 }}>{t('clientDetail.dashboardSummary')}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : '0.9fr 1.1fr', gap: 16 }}>
          {weightData.length > 0 ? (
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#000000', marginBottom: 12 }}>{t('clientDetail.weightEvolution')}</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {weightData.map((p) => (
                  <div key={`${p.date}-${p.value}`} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 60px', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 11, color: '#739EC9' }}>{p.date}</span>
                    <div style={{ height: 8, borderRadius: 99, background: '#FFFFFF', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.max(8, (p.value / 120) * 100)}%`, background: 'linear-gradient(90deg, #5682B1, #739EC9)' }} />
                    </div>
                    <span style={{ fontSize: 12, color: '#000000', fontWeight: 700 }}>{p.value} kg</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {client.notes ? (
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#000000', marginBottom: 10 }}>{t('clientDetail.notes')}</div>
              <p style={{ fontSize: 13, color: '#5682B1', lineHeight: 1.7 }}>{client.notes}</p>
            </div>
          ) : null}

          {!weightData.length && !client.notes ? (
            <div style={{ ...card, fontSize: 13, color: '#6B86A3' }}>{profileSummary}</div>
          ) : null}
          </div>

          <div style={card}>
            <ClientAnalytics
              definitions={definitions}
              allEntries={allEntries}
              locale={locale}
            />
          </div>
        </>
      )}

      {activeTab === 'profile' && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: 12, marginBottom: 18 }}>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: '#10253C', margin: 0 }}>{t('clientDetail.tabs.profile')}</h3>
              <p style={{ fontSize: 13, color: '#6B86A3', margin: '4px 0 0' }}>{profileSummary}</p>
            </div>
            {!editingProfile ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={toggleOnlineStatus}
                  disabled={savingOnlineStatus}
                  style={{
                    minHeight: 36,
                    borderRadius: 10,
                    border: client.isOnline ? '1px solid #6AA981' : '1px solid #2D7A47',
                    background: client.isOnline ? '#FFFFFF' : '#2D7A47',
                    color: client.isOnline ? '#2D7A47' : '#FFFFFF',
                    fontSize: 12,
                    fontWeight: 800,
                    padding: '0 12px',
                    cursor: savingOnlineStatus ? 'not-allowed' : 'pointer',
                    opacity: savingOnlineStatus ? 0.7 : 1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {savingOnlineStatus
                    ? t('clientDetail.onlineSaving')
                    : (client.isOnline ? t('clientDetail.onlineRemove') : t('clientDetail.onlineMark'))}
                </button>

                <QuickIconButton title={t('common.edit')} onClick={() => setEditingProfile(true)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </QuickIconButton>
              </div>
            ) : null}
          </div>

          <form onSubmit={updateProfile}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: 12 }}>
              {[
                [t('clientDetail.profileForm.fullName'), 'name', 'text'],
                [t('clientDetail.profileForm.phone'), 'phone', 'text'],
                [t('clientDetail.profileForm.heightCm'), 'heightCm', 'number'],
                [t('clientDetail.profileForm.weightKg'), 'initialWeight', 'number'],
                [t('clientDetail.profileForm.waistCm'), 'waistCircumferenceCm', 'number'],
                [t('clientDetail.profileForm.birthDate'), 'birthDate', 'date'],
                [t('clientDetail.profileForm.address'), 'address', 'text'],
                [t('clientDetail.age'), 'age', 'number'],
                [t('clientDetail.programStart'), 'startDate', 'date'],
                [t('clientDetail.profileForm.trainingFrequency'), 'trainingFrequency', 'number'],
              ].map(([label, key, type]) => (
                <div key={key}>
                  <label style={labelStyle}>{label}</label>
                  <input
                    type={type}
                    value={profileForm[key]}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, [key]: e.target.value }))}
                    style={fieldStyle}
                    disabled={!editingProfile}
                  />
                </div>
              ))}
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={labelStyle}>{t('clients.modal.pricingType')}</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setProfileForm((prev) => ({ ...prev, pricingMode: 'FIXED', packageId: '' }))}
                  disabled={!editingProfile}
                  style={{
                    border: profileForm.pricingMode === 'FIXED' ? '1px solid #5682B1' : '1px solid #9FBDD9',
                    background: profileForm.pricingMode === 'FIXED' ? '#EDF5FC' : '#FFFFFF',
                    color: '#2C4F73',
                    borderRadius: 8,
                    fontSize: 12,
                    padding: '8px 12px',
                    cursor: editingProfile ? 'pointer' : 'not-allowed',
                    opacity: editingProfile ? 1 : 0.6,
                  }}
                >
                  {t('clients.modal.fixedPrice')}
                </button>
                <button
                  type="button"
                  onClick={() => setProfileForm((prev) => ({ ...prev, pricingMode: 'PACKAGE' }))}
                  disabled={!editingProfile}
                  style={{
                    border: profileForm.pricingMode === 'PACKAGE' ? '1px solid #5682B1' : '1px solid #9FBDD9',
                    background: profileForm.pricingMode === 'PACKAGE' ? '#EDF5FC' : '#FFFFFF',
                    color: '#2C4F73',
                    borderRadius: 8,
                    fontSize: 12,
                    padding: '8px 12px',
                    cursor: editingProfile ? 'pointer' : 'not-allowed',
                    opacity: editingProfile ? 1 : 0.6,
                  }}
                >
                  {t('clients.modal.packagePrice')}
                </button>
              </div>
            </div>

            {profileForm.pricingMode === 'FIXED' ? (
              <div style={{ marginTop: 12 }}>
                <label style={labelStyle}>{t('clientDetail.monthlyFee')}</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={profileForm.monthlyPrice}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, monthlyPrice: e.target.value }))}
                  style={fieldStyle}
                  disabled={!editingProfile}
                />
              </div>
            ) : (
              <div style={{ marginTop: 12 }}>
                <label style={labelStyle}>{t('clients.modal.package')}</label>
                <select
                  value={profileForm.packageId}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, packageId: e.target.value }))}
                  disabled={!editingProfile}
                  style={fieldStyle}
                >
                  <option value="">{t('clients.modal.selectPackage')}</option>
                  {packages.map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>{pkg.name} - CHF {Number(pkg.monthlyPrice || 0).toFixed(2)}</option>
                  ))}
                </select>
                {packages.length === 0 ? (
                  <p style={{ marginTop: 8, fontSize: 12, color: '#9F4A4A' }}>{t('clients.modal.noPackagesHint')}</p>
                ) : null}
              </div>
            )}

            <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
              {[
                [t('clientDetail.profileForm.gymExperience'), 'gymExperience'],
                [t('clientDetail.profileForm.goalQuestion'), 'goal'],
                [t('clientDetail.profileForm.motivation'), 'motivation'],
                [t('clientDetail.profileForm.activityWork'), 'activityAndWork'],
                [t('clientDetail.profileForm.trainingAvailability'), 'trainingAvailability'],
                [t('clientDetail.profileForm.nutritionHabits'), 'nutritionHabits'],
                [t('clientDetail.profileForm.healthIssues'), 'healthIssues'],
                [t('clientDetail.profileForm.trainingPlanNotes'), 'trainingPlanNotes'],
              ].map(([label, key]) => (
                <div key={key}>
                  <label style={labelStyle}>{label}</label>
                  <textarea
                    rows={3}
                    value={profileForm[key]}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, [key]: e.target.value }))}
                    style={{ ...fieldStyle, resize: 'vertical' }}
                    disabled={!editingProfile}
                  />
                </div>
              ))}
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={labelStyle}>{t('clientDetail.notes')}</label>
              <textarea
                rows={4}
                value={profileForm.notes}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, notes: e.target.value }))}
                style={{ ...fieldStyle, resize: 'vertical' }}
                disabled={!editingProfile}
              />
            </div>

            {editingProfile && (
              <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button type="submit" disabled={savingProfile} style={{ padding: '10px 18px', border: 'none', borderRadius: 10, background: '#5682B1', color: '#FFFFFF', fontWeight: 600, cursor: 'pointer' }}>
                  {savingProfile ? t('clientDetail.saving') : t('clientDetail.saveProfile')}
                </button>
                <button type="button" onClick={() => { setEditingProfile(false); setProfileForm(originalProfileForm); }} style={{ padding: '10px 18px', border: '1px solid #739EC9', borderRadius: 10, background: '#FFFFFF', color: '#000000', fontWeight: 600, cursor: 'pointer' }}>
                  {t('common.cancel')}
                </button>
              </div>
            )}

            {!editingProfile && (
              <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" onClick={removeClient} style={{ padding: '10px 18px', border: '1px solid #739EC9', borderRadius: 10, background: '#FFFFFF', color: '#5682B1', fontWeight: 600, cursor: 'pointer' }}>
                  {t('clientDetail.removeClient')}
                </button>
              </div>
            )}
          </form>
        </div>
      )}

      {activeTab === 'metrics' && (
        <>
          <MetricSheet clientId={id} canManageDefinitions />
        </>
      )}

      {activeTab === 'checkins' && (
        <>
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#000000' }}>{t('clientDetail.structuredCheckin.historyTitle')}</div>
                <div style={{ marginTop: 6, fontSize: 12, color: '#5682B1', maxWidth: 560 }}>
                  {t('clientDetail.structuredCheckin.historySubtitle')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <QuickActionButton onClick={generateCheckInLink} disabled={creatingCheckInLink}>
                  {creatingCheckInLink ? t('clientDetail.structuredCheckin.generatingLink') : t('clientDetail.structuredCheckin.generateLink')}
                </QuickActionButton>
                <QuickActionButton onClick={() => setShowCheckInPanel(true)} primary>
                  {t('clientDetail.structuredCheckin.addAction')}
                </QuickActionButton>
              </div>
            </div>

            <div style={{ marginTop: 16, padding: '14px 16px', borderRadius: 18, background: '#F8FBFF', border: '1px solid #D7E3F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#000000' }}>{t('clientDetail.structuredCheckin.linkTitle')}</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: '#5682B1', maxWidth: 520 }}>
                    {t('clientDetail.structuredCheckin.linkSubtitle')}
                  </div>
                </div>
                {activeCheckInLink?.expiresAt ? (
                  <div style={{ fontSize: 11, color: '#5682B1', fontWeight: 700 }}>
                    {t('clientDetail.structuredCheckin.linkExpiresAt')}: {formatCheckInDate(activeCheckInLink.expiresAt)}
                  </div>
                ) : null}
              </div>

              {activeCheckInLink ? (
                <>
                  <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 12, background: '#FFFFFF', border: '1px solid #D7E3F0', fontSize: 12, color: '#000000', wordBreak: 'break-all' }}>
                    {activeCheckInLink.publicUrl}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
                    <QuickActionButton onClick={() => copyCheckInLink(activeCheckInLink)}>
                      {copiedCheckInLinkId === activeCheckInLink.id
                        ? t('clientDetail.structuredCheckin.linkCopied')
                        : t('clientDetail.structuredCheckin.copyLink')}
                    </QuickActionButton>
                    <QuickActionButton onClick={() => window.open(activeCheckInLink.publicUrl, '_blank', 'noopener,noreferrer')}>
                      {t('clientDetail.structuredCheckin.openLink')}
                    </QuickActionButton>
                  </div>
                </>
              ) : (
                <div style={{ marginTop: 12, fontSize: 12, color: '#739EC9' }}>{t('clientDetail.structuredCheckin.noActiveLink')}</div>
              )}
            </div>

            {checkIns.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
                <span style={{ padding: '6px 10px', borderRadius: 999, background: '#FFFFFF', border: '1px solid #739EC9', fontSize: 11, fontWeight: 800, color: '#000000' }}>
                  {checkIns.length} check-in{checkIns.length === 1 ? '' : 's'}
                </span>
                <span style={{ padding: '6px 10px', borderRadius: 999, background: '#FFFFFF', border: '1px solid #739EC9', fontSize: 11, fontWeight: 800, color: '#5682B1' }}>
                  {t('clientDetail.structuredCheckin.latestAt')}: {formatCheckInDate(checkIns[0].submittedAt)}
                </span>
              </div>
            ) : null}
          </div>

          <div style={{ display: 'grid', gap: 14 }}>
            {checkIns.length === 0 ? (
              <div style={{ ...card, fontSize: 13, color: '#739EC9' }}>{t('clientDetail.noCheckins')}</div>
            ) : (
              <div style={{ display: 'grid', gap: 14 }}>
                {checkIns.map((item) => (
                  <div key={item.id} style={{ ...card, marginBottom: 0, padding: isMobile ? '16px 16px 14px' : '18px 20px 16px' }}>
                    {(() => {
                      const legacyQuestions = extractLegacyCheckInText(item.coachQuestions);
                      const legacyResponses = extractLegacyCheckInText(item.clientResponses);
                      const structuredAnswers = extractStructuredCheckInAnswers(item.clientResponses);
                      const answeredCount = countStructuredCheckInAnswers(item);

                      return (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                            <div>
                              <div style={{ fontSize: 16, fontWeight: 800, color: '#000000' }}>{formatCheckInDate(item.submittedAt)}</div>
                              <div style={{ marginTop: 5, fontSize: 12, color: '#5682B1' }}>
                                {answeredCount > 0
                                  ? t('clientDetail.structuredCheckin.answersCount', { count: answeredCount })
                                  : t('clientDetail.structuredCheckin.answersPending')}
                              </div>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
                              {item.periodLabel ? (
                                <span style={{ padding: '6px 10px', borderRadius: 999, background: '#F8FBFF', border: '1px solid #D7E3F0', fontSize: 11, fontWeight: 700, color: '#5682B1' }}>
                                  {item.periodLabel}
                                </span>
                              ) : null}
                              {item.values.length > 0 ? (
                                <span style={{ padding: '6px 10px', borderRadius: 999, background: '#F8FBFF', border: '1px solid #D7E3F0', fontSize: 11, fontWeight: 700, color: '#5682B1' }}>
                                  {item.values.length} valor{item.values.length === 1 ? '' : 'es'}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          {structuredAnswers ? renderStructuredCheckInAnswers(item) : null}
                          {!structuredAnswers && legacyQuestions ? (
                            <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 14, background: '#F8FBFF', border: '1px solid #D7E3F0' }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#5682B1', marginBottom: 4 }}>{t('clientDetail.coachQuestions')}</div>
                              <div style={{ fontSize: 12, color: '#000000', whiteSpace: 'pre-wrap' }}>{legacyQuestions}</div>
                            </div>
                          ) : null}
                          {!structuredAnswers && legacyResponses ? (
                            <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 14, background: '#F8FBFF', border: '1px solid #D7E3F0' }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#5682B1', marginBottom: 4 }}>{t('clientDetail.clientResponses')}</div>
                              <div style={{ fontSize: 12, color: '#000000', whiteSpace: 'pre-wrap' }}>{legacyResponses}</div>
                            </div>
                          ) : null}
                          {item.clientComment ? (
                            <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 14, background: '#FFFFFF', border: '1px dashed #739EC9' }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#5682B1', marginBottom: 4 }}>{t('clientDetail.structuredCheckin.additionalNotes')}</div>
                              <div style={{ fontSize: 12, color: '#000000', whiteSpace: 'pre-wrap' }}>{item.clientComment}</div>
                            </div>
                          ) : null}
                          {item.values.length > 0 ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                              {item.values.map((entry) => (
                                <span key={entry.id} style={{ background: '#FFFFFF', border: '1px solid #739EC9', borderRadius: 999, fontSize: 11, color: '#000000', padding: '4px 8px' }}>
                                  {entry.metricDefinition?.name}: {formatMetricValue(entry)}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </>
                      );
                    })()}
                  </div>
                ))}
              </div>
            )}
          </div>

          {showCheckInPanel ? (
            <SlidePanel
              title={t('clientDetail.structuredCheckin.modalTitle')}
              subtitle={t('clientDetail.structuredCheckin.modalSubtitle')}
              onClose={() => setShowCheckInPanel(false)}
              footer={(
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                  <QuickActionButton onClick={() => setShowCheckInPanel(false)}>
                    {t('common.cancel')}
                  </QuickActionButton>
                  <button type="submit" form="checkin-popup-form" disabled={savingCheckIn} style={{ minHeight: 40, padding: '0 16px', border: 'none', borderRadius: 12, background: '#5682B1', color: '#FFFFFF', fontSize: 12, fontWeight: 800, cursor: 'pointer', opacity: savingCheckIn ? 0.6 : 1 }}>
                    {savingCheckIn ? t('clientDetail.saving') : t('clientDetail.submitCheckin')}
                  </button>
                </div>
              )}
            >
              <form id="checkin-popup-form" onSubmit={saveCheckIn}>
                <div style={{ display: 'grid', gap: 14 }}>
                  {STRUCTURED_CHECKIN_SECTIONS.slice(0, 2).map((section) => (
                    <div key={section.titleKey} style={{ border: '1px solid #D7E3F0', borderRadius: 12, padding: 14, background: '#F8FBFF' }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#000000', marginBottom: 12 }}>
                        {t(`clientDetail.structuredCheckin.${section.titleKey}`)}
                      </div>
                      <div style={{ display: 'grid', gap: 12 }}>
                        {section.questions.map((question) => (
                          <div key={question.key}>
                            <label style={labelStyle}>{t(`clientDetail.structuredCheckin.${question.labelKey}`)}</label>
                            {question.type === 'scale' ? (
                              <select
                                value={checkInForm[question.key]}
                                onChange={(e) => setCheckInForm((prev) => ({ ...prev, [question.key]: e.target.value }))}
                                style={fieldStyle}
                              >
                                <option value="">—</option>
                                {Array.from({ length: 10 }, (_, index) => {
                                  const value = String(index + 1);
                                  return <option key={value} value={value}>{value}</option>;
                                })}
                              </select>
                            ) : (
                              <textarea
                                rows={question.rows || 3}
                                value={checkInForm[question.key]}
                                onChange={(e) => setCheckInForm((prev) => ({ ...prev, [question.key]: e.target.value }))}
                                style={{ ...fieldStyle, resize: 'vertical' }}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gap: 14, marginTop: 16 }}>
                  {STRUCTURED_CHECKIN_SECTIONS.slice(2).map((section) => (
                    <div key={section.titleKey} style={{ border: '1px solid #D7E3F0', borderRadius: 12, padding: 14, background: '#F8FBFF' }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#000000', marginBottom: 12 }}>
                        {t(`clientDetail.structuredCheckin.${section.titleKey}`)}
                      </div>
                      <div style={{ display: 'grid', gap: 12 }}>
                        {section.questions.map((question) => (
                          <div key={question.key}>
                            <label style={labelStyle}>{t(`clientDetail.structuredCheckin.${question.labelKey}`)}</label>
                            <textarea
                              rows={question.rows || 3}
                              value={checkInForm[question.key]}
                              onChange={(e) => setCheckInForm((prev) => ({ ...prev, [question.key]: e.target.value }))}
                              style={{ ...fieldStyle, resize: 'vertical' }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 12 }}>
                  <label style={labelStyle}>{t('clientDetail.structuredCheckin.additionalNotes')}</label>
                  <textarea rows={3} value={checkInForm.clientComment} onChange={(e) => setCheckInForm((prev) => ({ ...prev, clientComment: e.target.value }))} style={{ ...fieldStyle, resize: 'vertical' }} />
                </div>
              </form>
            </SlidePanel>
          ) : null}
        </>
      )}

      {activeTab === 'feedback' && (
        <>
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#000000' }}>{t('clientDetail.structuredFeedback.historyTitle')}</div>
                <div style={{ marginTop: 6, fontSize: 12, color: '#5682B1', maxWidth: 560 }}>
                  {t('clientDetail.structuredFeedback.historySubtitle')}
                </div>
              </div>
              <QuickActionButton onClick={generateFeedbackLink} disabled={creatingFeedbackLink}>
                {creatingFeedbackLink ? t('clientDetail.structuredFeedback.generatingLink') : t('clientDetail.structuredFeedback.generateLink')}
              </QuickActionButton>
            </div>

            <div style={{ marginTop: 16, padding: '14px 16px', borderRadius: 18, background: '#F8FBFF', border: '1px solid #D7E3F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#000000' }}>{t('clientDetail.structuredFeedback.linkTitle')}</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: '#5682B1', maxWidth: 520 }}>
                    {t('clientDetail.structuredFeedback.linkSubtitle')}
                  </div>
                </div>
                {activeFeedbackLink?.expiresAt ? (
                  <div style={{ fontSize: 11, color: '#5682B1', fontWeight: 700 }}>
                    {t('clientDetail.structuredFeedback.linkExpiresAt')}: {formatCheckInDate(activeFeedbackLink.expiresAt)}
                  </div>
                ) : null}
              </div>

              {activeFeedbackLink ? (
                <>
                  <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 12, background: '#FFFFFF', border: '1px solid #D7E3F0', fontSize: 12, color: '#000000', wordBreak: 'break-all' }}>
                    {activeFeedbackLink.publicUrl}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
                    <QuickActionButton onClick={() => copyFeedbackLink(activeFeedbackLink)}>
                      {copiedFeedbackLinkId === activeFeedbackLink.id
                        ? t('clientDetail.structuredFeedback.linkCopied')
                        : t('clientDetail.structuredFeedback.copyLink')}
                    </QuickActionButton>
                    <QuickActionButton onClick={() => window.open(activeFeedbackLink.publicUrl, '_blank', 'noopener,noreferrer')}>
                      {t('clientDetail.structuredFeedback.openLink')}
                    </QuickActionButton>
                  </div>
                </>
              ) : (
                <div style={{ marginTop: 12, fontSize: 12, color: '#739EC9' }}>{t('clientDetail.structuredFeedback.noActiveLink')}</div>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 14 }}>
            {feedbackEntries.length === 0 ? (
              <div style={{ ...card, fontSize: 13, color: '#739EC9' }}>{t('clientDetail.structuredFeedback.noFeedback')}</div>
            ) : (
              <div style={{ display: 'grid', gap: 14 }}>
                {feedbackEntries.map((item) => (
                  <div key={item.id} style={{ ...card, marginBottom: 0, padding: isMobile ? '16px 16px 14px' : '18px 20px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: '#000000' }}>{formatCheckInDate(item.submittedAt || item.createdAt)}</div>
                        <div style={{ marginTop: 5, fontSize: 12, color: '#5682B1' }}>
                          {t('clientDetail.structuredFeedback.language')}: {String(item.language || 'de').toUpperCase()}
                        </div>
                      </div>

                    </div>

                    <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#5682B1', marginBottom: 2 }}>{t('clientDetail.structuredFeedback.fields.trainingDuration')}</div>
                        <div style={{ fontSize: 12, color: '#000000' }}>{item.trainingDuration || '-'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#5682B1', marginBottom: 2 }}>{t('clientDetail.structuredFeedback.fields.progressSinceStart')}</div>
                        <div style={{ fontSize: 12, color: '#000000' }}>{item.progressSinceStart || '-'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#5682B1', marginBottom: 2 }}>{t('clientDetail.structuredFeedback.fields.specificImprovements')}</div>
                        <div style={{ fontSize: 12, color: '#000000', whiteSpace: 'pre-wrap' }}>{item.specificImprovements || '-'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#5682B1', marginBottom: 2 }}>{t('clientDetail.structuredFeedback.fields.biggestChange')}</div>
                        <div style={{ fontSize: 12, color: '#000000', whiteSpace: 'pre-wrap' }}>{item.biggestChange || '-'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#5682B1', marginBottom: 2 }}>{t('clientDetail.structuredFeedback.fields.supportFeeling')}</div>
                        <div style={{ fontSize: 12, color: '#000000' }}>{item.supportFeeling || '-'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#5682B1', marginBottom: 2 }}>{t('clientDetail.structuredFeedback.fields.coachCanImprove')}</div>
                        <div style={{ fontSize: 12, color: '#000000', whiteSpace: 'pre-wrap' }}>{item.coachCanImprove || '-'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#5682B1', marginBottom: 2 }}>{t('clientDetail.structuredFeedback.fields.wouldRecommend')}</div>
                        <div style={{ fontSize: 12, color: '#000000' }}>{item.wouldRecommend || '-'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#5682B1', marginBottom: 2 }}>{t('clientDetail.structuredFeedback.fields.mainDecisionReason')}</div>
                        <div style={{ fontSize: 12, color: '#000000', whiteSpace: 'pre-wrap' }}>{item.mainDecisionReason || '-'}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'workout' && workoutDraft && (
        <>
          <div style={{ ...card, padding: isMobile ? '18px 16px' : '22px 24px', background: 'linear-gradient(135deg, #FFFFFF 0%, #F4F8FC 100%)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#5682B1' }}>
                  Trainingsdokument
                </div>
                <div style={{ marginTop: 6, fontSize: 22, fontWeight: 800, color: '#000000' }}>
                  {workoutDraft.name || 'Trainingsplan'}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                  <span style={{ padding: '6px 10px', borderRadius: 999, background: '#FFFFFF', color: '#5682B1', fontSize: 11, fontWeight: 700 }}>
                    {workoutDraft.document?.planCode?.trim() || 'Ohne Referenz'}
                  </span>
                  <span style={{ padding: '6px 10px', borderRadius: 999, background: '#FFFFFF', color: '#5682B1', fontSize: 11, fontWeight: 700 }}>
                    {`${(workoutDraft.document?.workoutRows || []).filter((row) => row.exercise?.trim()).length} Übungen`}
                  </span>
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: '#739EC9' }}>
                  {plan?.updatedAt ? `${t('clientDetail.lastUpdated')}: ${new Date(plan.updatedAt).toLocaleString(locale)}` : 'Noch kein Trainingsplan gespeichert.'}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {!editingWorkout ? (
                  <QuickIconButton title={t('common.edit')} onClick={() => setEditingWorkout(true)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </QuickIconButton>
                ) : null}
                <div ref={workoutMenuRef} style={{ position: 'relative' }}>
                  <QuickIconButton title="Mais acoes" onClick={() => setShowWorkoutMenu((prev) => !prev)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="5" r="2" />
                      <circle cx="12" cy="12" r="2" />
                      <circle cx="12" cy="19" r="2" />
                    </svg>
                  </QuickIconButton>
                  {showWorkoutMenu ? (
                    <div style={{ position: 'absolute', right: 0, top: 42, zIndex: 10, width: 220, borderRadius: 14, background: '#FFFFFF', border: '1px solid #739EC9', boxShadow: '0 18px 48px rgba(0,0,0,0.16)', padding: 8 }}>
                      <button
                        type="button"
                        onClick={() => {
                          setShowWorkoutMenu(false);
                          setActiveWorkoutPanel('duplicate');
                        }}
                        style={{ width: '100%', textAlign: 'left', border: 'none', background: 'transparent', padding: '10px 12px', borderRadius: 10, fontSize: 13, color: '#000000', cursor: 'pointer' }}
                      >
                        {t('clientDetail.duplicate')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowWorkoutMenu(false);
                          setActiveWorkoutPanel('import-ai');
                        }}
                        style={{ width: '100%', textAlign: 'left', border: 'none', background: 'transparent', padding: '10px 12px', borderRadius: 10, fontSize: 13, color: '#000000', cursor: 'pointer' }}
                      >
                        Preencher por PDF / imagem com AI
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <fieldset disabled={!editingWorkout} style={{ display: 'grid', gap: 12, border: 'none', padding: 0, margin: 0, minWidth: 0 }}>
            <div style={{ ...card, marginBottom: 0, padding: isMobile ? '18px 16px' : '20px 22px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 0.9fr 0.9fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Titel des Plans</label>
                  <input value={workoutDraft.name} onChange={(e) => setWorkoutDraft((prev) => ({ ...prev, name: e.target.value }))} style={fieldStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Referenz</label>
                  <input value={workoutDraft.document?.planCode || ''} onChange={(e) => updateWorkoutDocumentField('planCode', e.target.value)} style={fieldStyle} placeholder="z.B. 545" />
                </div>
                <div>
                  <label style={labelStyle}>Datum</label>
                  <input type="date" value={workoutDraft.document?.planDate || ''} onChange={(e) => updateWorkoutDocumentField('planDate', e.target.value)} style={fieldStyle} />
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
              <div style={{ ...card, marginBottom: 0, padding: isMobile ? '18px 16px' : '20px 22px' }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#000000', marginBottom: 14 }}>Persönliche Daten</div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Name</label>
                    <input value={workoutDraft.document?.personalData?.name || ''} onChange={(e) => updateWorkoutPersonalField('name', e.target.value)} style={fieldStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Geburtsdatum</label>
                    <input type="date" value={workoutDraft.document?.personalData?.birthDate || ''} onChange={(e) => updateWorkoutPersonalField('birthDate', e.target.value)} style={fieldStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Grösse</label>
                    <input value={workoutDraft.document?.personalData?.height || ''} onChange={(e) => updateWorkoutPersonalField('height', e.target.value)} style={fieldStyle} placeholder="1,65m" />
                  </div>
                  <div>
                    <label style={labelStyle}>Gewicht</label>
                    <input value={workoutDraft.document?.personalData?.weight || ''} onChange={(e) => updateWorkoutPersonalField('weight', e.target.value)} style={fieldStyle} placeholder="95kg" />
                  </div>
                  <div style={{ gridColumn: isMobile ? 'auto' : '1 / -1' }}>
                    <label style={labelStyle}>Bauchumfang</label>
                    <input value={workoutDraft.document?.personalData?.waist || ''} onChange={(e) => updateWorkoutPersonalField('waist', e.target.value)} style={fieldStyle} placeholder="105cm" />
                  </div>
                </div>
              </div>

              <div style={{ ...card, marginBottom: 0, padding: isMobile ? '18px 16px' : '20px 22px' }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#000000', marginBottom: 14 }}>Trainingsziel bis zum nächsten Termin</div>
                <textarea
                  rows={4}
                  value={workoutDraft.document?.goalUntilNextAppointment || ''}
                  onChange={(e) => updateWorkoutDocumentField('goalUntilNextAppointment', e.target.value)}
                  style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }}
                  placeholder="Gewicht Reduktion, Trainingsroutine aufbauen, Schmerzen lindern"
                />
                <div style={{ fontSize: 15, fontWeight: 800, color: '#000000', margin: '18px 0 14px' }}>Weitere Prioritäten / Hinweise</div>
                <textarea
                  rows={5}
                  value={workoutDraft.document?.priorities || ''}
                  onChange={(e) => updateWorkoutDocumentField('priorities', e.target.value)}
                  style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }}
                  placeholder="Zusätzliche medizinische oder organisatorische Hinweise"
                />
              </div>
            </div>

            <div style={{ ...card, marginBottom: 0, padding: isMobile ? '18px 16px' : '20px 22px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '0.9fr 1.1fr', gap: 12, alignItems: 'end' }}>
                <div>
                  <label style={labelStyle}>Warmup</label>
                  <textarea rows={3} value={workoutDraft.document?.warmup || ''} onChange={(e) => updateWorkoutDocumentField('warmup', e.target.value)} style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }} />
                </div>
                <div>
                  <label style={labelStyle}>Überschrift Trainingsblock</label>
                  <input value={workoutDraft.document?.trainingTitle || ''} onChange={(e) => updateWorkoutDocumentField('trainingTitle', e.target.value)} style={fieldStyle} />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 18, marginBottom: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#000000' }}>Ganzkörper Training</div>
                  <div style={{ fontSize: 12, color: '#739EC9', marginTop: 3 }}>Übung, Sätze, Wiederholungen und Gewicht wie im neuen Planformat.</div>
                </div>
                <QuickActionButton onClick={() => addWorkoutRow()}>Zeile hinzufügen</QuickActionButton>
              </div>

              <div style={{ border: '1px solid #D6E2EF', borderRadius: 16, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.1fr 2fr 0.8fr 1fr 0.9fr 44px', gap: 0, background: '#EEF4FA', color: '#5682B1', fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>
                  <div style={{ padding: '12px 10px' }}>Block</div>
                  <div style={{ padding: '12px 10px' }}>Übung</div>
                  <div style={{ padding: '12px 10px' }}>Sätze</div>
                  <div style={{ padding: '12px 10px' }}>Wiederholungen</div>
                  <div style={{ padding: '12px 10px' }}>Gewicht</div>
                  <div style={{ padding: '12px 10px' }} />
                </div>

                {(workoutDraft.document?.workoutRows || []).length === 0 ? (
                  <div style={{ padding: '18px 16px', background: '#FFFFFF', fontSize: 12, color: '#739EC9' }}>
                    Noch keine Übungen hinzugefügt.
                  </div>
                ) : (workoutDraft.document?.workoutRows || []).map((row, rowIndex) => (
                  <div key={`workout-row-${rowIndex}`} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.1fr 2fr 0.8fr 1fr 0.9fr 44px', gap: 8, padding: '10px', background: '#FFFFFF', borderTop: rowIndex === 0 ? 'none' : '1px solid #EEF4FA' }}>
                    <input value={row.block || ''} onChange={(e) => updateWorkoutRow(rowIndex, { block: e.target.value })} style={fieldStyle} placeholder="z.B. 15 min Cardio" />
                    <input value={row.exercise || ''} onChange={(e) => updateWorkoutRow(rowIndex, { exercise: e.target.value })} style={fieldStyle} placeholder="Beinpresse 45 Grad" />
                    <input value={row.sets || ''} onChange={(e) => updateWorkoutRow(rowIndex, { sets: e.target.value })} style={fieldStyle} placeholder="3x" />
                    <input value={row.reps || ''} onChange={(e) => updateWorkoutRow(rowIndex, { reps: e.target.value })} style={fieldStyle} placeholder="15-20" />
                    <input value={row.load || ''} onChange={(e) => updateWorkoutRow(rowIndex, { load: e.target.value })} style={fieldStyle} placeholder="20kg" />
                    <button type="button" onClick={() => removeWorkoutRow(rowIndex)} style={{ border: 'none', background: '#F4F8FC', color: '#5682B1', borderRadius: 12, cursor: 'pointer', fontSize: 16, fontWeight: 700 }}>
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                {EXERCISE_LIBRARY.map((exerciseName) => (
                  <button
                    key={exerciseName}
                    type="button"
                    onClick={() => addWorkoutRow(exerciseName)}
                    style={{ border: '1px solid #739EC9', background: '#FFFFFF', borderRadius: 999, padding: '6px 10px', fontSize: 11, color: '#000000', cursor: 'pointer' }}
                  >
                    + {exerciseName}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
              <div style={{ ...card, marginBottom: 0, padding: isMobile ? '18px 16px' : '20px 22px' }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#000000', marginBottom: 14 }}>Plan Durchführung</div>
                <textarea
                  rows={10}
                  value={workoutDraft.document?.executionNotes || ''}
                  onChange={(e) => updateWorkoutDocumentField('executionNotes', e.target.value)}
                  style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.6 }}
                />
              </div>

              <div style={{ ...card, marginBottom: 0, padding: isMobile ? '18px 16px' : '20px 22px' }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#000000', marginBottom: 14 }}>Ernährung / Supplementation</div>
                <textarea
                  rows={10}
                  value={workoutDraft.document?.nutritionNotes || ''}
                  onChange={(e) => updateWorkoutDocumentField('nutritionNotes', e.target.value)}
                  style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.6 }}
                />
              </div>
            </div>

            <div style={{ ...card, marginBottom: 0, padding: isMobile ? '18px 16px' : '20px 22px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr auto', gap: 12, alignItems: 'end' }}>
                <div>
                  <label style={labelStyle}>Abschlussnachricht</label>
                  <textarea rows={3} value={workoutDraft.document?.closingMessage || ''} onChange={(e) => updateWorkoutDocumentField('closingMessage', e.target.value)} style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }} />
                </div>
                <div style={{ padding: '14px 16px', borderRadius: 16, background: '#F4F8FC', border: '1px solid #D6E2EF', minWidth: isMobile ? 'auto' : 220 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#5682B1', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Vorschau</div>
                  <div style={{ marginTop: 8, fontSize: 16, fontWeight: 800, color: '#000000' }}>{workoutDraft.document?.planCode || 'Plan'}</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: '#739EC9' }}>{formatWorkoutHeaderDate(workoutDraft.document?.planDate, locale)}</div>
                </div>
              </div>
            </div>
          </fieldset>

          {editingWorkout ? (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
              <button type="button" onClick={saveWorkout} disabled={savingWorkout} style={{ padding: '10px 18px', border: 'none', borderRadius: 10, background: '#5682B1', color: '#FFFFFF', fontWeight: 600, cursor: 'pointer' }}>
                {savingWorkout ? t('clientDetail.saving') : t('clientDetail.saveWorkout')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingWorkout(false);
                  if (originalWorkoutDraft) setWorkoutDraft(JSON.parse(JSON.stringify(originalWorkoutDraft)));
                }}
                style={{ padding: '10px 18px', border: '1px solid #739EC9', borderRadius: 10, background: '#FFFFFF', color: '#000000', fontWeight: 600, cursor: 'pointer' }}
              >
                {t('common.cancel')}
              </button>
            </div>
          ) : null}

          {activeWorkoutPanel === 'duplicate' ? (
            <SlidePanel
              title={t('clientDetail.duplicate')}
              subtitle="Copiar plano de outro cliente"
              onClose={() => setActiveWorkoutPanel('')}
              footer={(
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <QuickActionButton onClick={() => setActiveWorkoutPanel('')}>Fechar</QuickActionButton>
                  <QuickActionButton onClick={duplicateWorkout} disabled={!duplicateFromClientId || savingWorkout} primary>
                    {savingWorkout ? t('clientDetail.saving') : t('clientDetail.duplicate')}
                  </QuickActionButton>
                </div>
              )}
            >
              <div>
                <label style={labelStyle}>{t('clientDetail.duplicateFrom')}</label>
                <select value={duplicateFromClientId} onChange={(e) => setDuplicateFromClientId(e.target.value)} style={fieldStyle}>
                  <option value="">{t('clientDetail.selectClient')}</option>
                  {allClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </SlidePanel>
          ) : null}

          {activeWorkoutPanel === 'import-ai' ? (
            <SlidePanel
              title="Preencher plano com AI"
              subtitle="Faz upload de um PDF ou imagem e a AI tenta preencher o documento do plano"
              onClose={() => {
                setActiveWorkoutPanel('');
                setWorkoutImportFile(null);
              }}
              footer={(
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                  <QuickActionButton onClick={() => {
                    setActiveWorkoutPanel('');
                    setWorkoutImportFile(null);
                  }}>
                    Fechar
                  </QuickActionButton>
                  <QuickActionButton onClick={extractWorkoutFromFileWithAi} disabled={extractingWorkoutAi} primary>
                    {extractingWorkoutAi ? 'A analisar...' : 'Analisar e preencher'}
                  </QuickActionButton>
                </div>
              )}
            >
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ fontSize: 12, color: '#5682B1', lineHeight: 1.55 }}>
                  Usa o mesmo princípio do intake do cliente: a AI só preenche o que conseguir reconhecer no documento.
                </div>
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={(e) => setWorkoutImportFile(e.target.files?.[0] || null)}
                  style={fieldStyle}
                />
                <div style={{ padding: '12px 14px', borderRadius: 14, background: '#F4F8FC', border: '1px solid #D6E2EF', fontSize: 12, color: '#5682B1', lineHeight: 1.6 }}>
                  Campos suportados: referência, data, dados pessoais, objetivo, warmup, título do treino, linhas da tabela, notas de execução, nutrição e mensagem final.
                </div>
              </div>
            </SlidePanel>
          ) : null}
        </>
      )}


    </div>
  );
}


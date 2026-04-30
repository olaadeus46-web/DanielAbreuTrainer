import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import BrandLoadingScreen from '../components/ui/BrandLoadingScreen';
import LanguageSwitcher from '../components/ui/LanguageSwitcher';
import { useAppFeedback } from '../components/ui/FeedbackProvider';
import { publicCheckInApi } from '../services/api';

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
    clientComment: '',
    trainingFrequency: '',
    whatWorkedWell: '',
    whatWasDifficult: '',
    wellbeingComparison: '',
    wellbeingScore: '',
    nextGoalsPlanAdjustments: '',
  };
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

export default function PublicCheckInPage() {
  const { token } = useParams();
  const { t, i18n } = useTranslation();
  const { showWarning } = useAppFeedback();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [linkData, setLinkData] = useState(null);
  const [errorState, setErrorState] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState(emptyCheckInForm);

  const locale = useMemo(() => ({ en: 'en-US', pt: 'pt-PT', de: 'de-DE' }[i18n.language] || 'en-US'), [i18n.language]);

  useEffect(() => {
    i18n.changeLanguage('de');
    localStorage.setItem('fc_lang', 'de');
    document.documentElement.lang = 'de';
  }, []);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      try {
        const response = await publicCheckInApi.getLink(token);
        if (!active) return;
        setLinkData(response.data);
        setErrorState('');
      } catch (err) {
        if (!active) return;
        const status = err.response?.status;
        setErrorState(status === 404 || status === 410 ? 'expired' : 'error');
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [token]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const payload = buildStructuredCheckInPayload(form);
    const hasComment = form.clientComment.trim() !== '';

    if (!payload.clientResponses && !hasComment) {
      showWarning(t('clientDetail.structuredCheckin.publicValidation'));
      return;
    }

    setSubmitting(true);
    try {
      await publicCheckInApi.submit(token, {
        coachQuestions: payload.coachQuestions,
        clientResponses: payload.clientResponses,
        clientComment: form.clientComment.trim() || null,
        entries: [],
      });
      setSubmitted(true);
      setErrorState('');
    } catch (err) {
      const status = err.response?.status;
      setErrorState(status === 404 || status === 410 ? 'expired' : 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <BrandLoadingScreen />;

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(circle at top, #E8F3FF 0%, #F7FBFF 48%, #FFFFFF 100%)', padding: '24px 16px 40px' }}>
      <div style={{ width: 'min(760px, 100%)', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#5682B1' }}>
              Daniel Abreu Trainer
            </div>
            <div style={{ marginTop: 6, fontSize: 28, fontWeight: 900, color: '#000000' }}>
              {t('clientDetail.structuredCheckin.publicPageTitle')}
            </div>
          </div>
          <div style={{ minWidth: 124 }}>
            <LanguageSwitcher />
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #D7E3F0', borderRadius: 24, boxShadow: '0 24px 60px rgba(86,130,177,0.14)', padding: '24px 22px' }}>
          {submitted ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#000000' }}>{t('clientDetail.structuredCheckin.publicSuccessTitle')}</div>
              <div style={{ fontSize: 14, color: '#5682B1', lineHeight: 1.6 }}>{t('clientDetail.structuredCheckin.publicSuccessBody')}</div>
            </div>
          ) : errorState ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#000000' }}>
                {errorState === 'expired'
                  ? t('clientDetail.structuredCheckin.publicExpiredTitle')
                  : t('clientDetail.structuredCheckin.publicErrorTitle')}
              </div>
              <div style={{ fontSize: 14, color: '#5682B1', lineHeight: 1.6 }}>
                {errorState === 'expired'
                  ? t('clientDetail.structuredCheckin.publicExpiredBody')
                  : t('clientDetail.structuredCheckin.publicErrorBody')}
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 18 }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#000000' }}>{linkData?.client?.name || 'Cliente'}</div>
                  <div style={{ marginTop: 6, fontSize: 14, color: '#5682B1', lineHeight: 1.6 }}>
                    {t('clientDetail.structuredCheckin.publicIntro')}
                  </div>
                </div>
                <div style={{ padding: '10px 12px', borderRadius: 16, background: '#F8FBFF', border: '1px solid #D7E3F0', fontSize: 12, color: '#5682B1', fontWeight: 700 }}>
                  {t('clientDetail.structuredCheckin.publicExpiresAt')}: {new Date(linkData?.link?.expiresAt).toLocaleString(locale)}
                </div>
              </div>

              <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
                {STRUCTURED_CHECKIN_SECTIONS.map((section) => (
                  <div key={section.titleKey} style={{ border: '1px solid #D7E3F0', borderRadius: 18, padding: 16, background: '#F8FBFF' }}>
                    <div style={{ fontSize: 14, fontWeight: 900, color: '#000000', marginBottom: 12 }}>
                      {t(`clientDetail.structuredCheckin.${section.titleKey}`)}
                    </div>
                    <div style={{ display: 'grid', gap: 12 }}>
                      {section.questions.map((question) => (
                        <div key={question.key}>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#000000', marginBottom: 6 }}>
                            {t(`clientDetail.structuredCheckin.${question.labelKey}`)}
                          </label>
                          {question.type === 'scale' ? (
                            <select
                              value={form[question.key]}
                              onChange={(event) => setForm((prev) => ({ ...prev, [question.key]: event.target.value }))}
                              style={{ width: '100%', minHeight: 44, borderRadius: 12, border: '1.5px solid #739EC9', padding: '0 12px', fontSize: 14, background: '#FFFFFF' }}
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
                              value={form[question.key]}
                              onChange={(event) => setForm((prev) => ({ ...prev, [question.key]: event.target.value }))}
                              style={{ width: '100%', borderRadius: 12, border: '1.5px solid #739EC9', padding: '10px 12px', fontSize: 14, background: '#FFFFFF', resize: 'vertical' }}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#000000', marginBottom: 6 }}>
                    {t('clientDetail.structuredCheckin.additionalNotes')}
                  </label>
                  <textarea
                    rows={4}
                    value={form.clientComment}
                    onChange={(event) => setForm((prev) => ({ ...prev, clientComment: event.target.value }))}
                    style={{ width: '100%', borderRadius: 12, border: '1.5px solid #739EC9', padding: '10px 12px', fontSize: 14, background: '#FFFFFF', resize: 'vertical' }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  style={{ minHeight: 48, border: 'none', borderRadius: 14, background: '#5682B1', color: '#FFFFFF', fontSize: 14, fontWeight: 900, cursor: 'pointer', opacity: submitting ? 0.7 : 1 }}
                >
                  {submitting ? t('clientDetail.structuredCheckin.publicSubmitting') : t('clientDetail.structuredCheckin.publicSubmit')}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


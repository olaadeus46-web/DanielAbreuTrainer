import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import BrandLoadingScreen from '../components/ui/BrandLoadingScreen';
import LanguageSwitcher from '../components/ui/LanguageSwitcher';
import { useAppFeedback } from '../components/ui/FeedbackProvider';
import { publicFeedbackApi } from '../services/api';

const FEEDBACK_FORM_COPY = {
  de: {
    pageTitle: 'Feedback Formular - Betreuung',
    subtitle: 'Betreuung - Feedback Formular',
    submitSuccessTitle: 'Vielen Dank.',
    submitSuccessBody: 'Dein Feedback wurde erfolgreich gesendet.',
    unavailableTitle: 'Dieser Link ist nicht mehr verfügbar.',
    fatalErrorTitle: 'Beim Senden ist ein Fehler aufgetreten.',
    unavailableBody: 'Bitte fordere einen neuen Link bei deinem Trainer an.',
    fatalErrorBody: 'Bitte versuche es in einigen Minuten erneut.',
    expiresLabel: 'Link gültig bis',
    requiredAlert: 'Bitte beantworte alle Pflichtfragen.',
    genericSubmitError: 'Beim Senden ist ein Fehler aufgetreten. Bitte versuche es erneut.',
    submitSending: 'Wird gesendet...',
    submitAction: 'Absenden',
    questions: {
      trainingDuration: {
        label: 'Seit wann trainierst du mit mir?',
        options: ['1-2 Monate', '3-4 Monate', '5+ Monate', 'Option 4'],
      },
      progressSinceStart: {
        label: 'Hast du seit Start Fortschritte bemerkt?',
        options: ['Sehr grosse', 'Deutliche', 'Kleine', 'noch nicht wirklich'],
      },
      specificImprovements: {
        label: 'Was hat sich konkret verbessert? z.B. Kraft, Technik, Körpergefühl, Motivation, Umfänge, Selbstbewusstsein etc.',
      },
      biggestChange: {
        label: 'Was war deine grösste Veränderung bisher?',
      },
      supportFeeling: {
        label: 'Fühlst du dich gut begleitet und verstanden?',
        options: ['Ja, absolut', 'Meistens', 'Teilweise', 'Eher nicht'],
      },
      coachCanImprove: {
        label: 'Gibt es etwas, das ich verbessern könnte?',
      },
      wouldRecommend: {
        label: 'Würdest du mich weiterempfehlen?',
        options: ['Ja, definitiv', 'Wahrscheinlich', 'Eher nicht'],
      },
      allowInstagramUse: {
        label: 'Darf ich dein Feedback anonym für meine Instagram verwenden?',
        options: ['Ja', 'Nein'],
      },
      mainDecisionReason: {
        label: 'Was war der Hauptgrund, warum du dich für meine Betreuung entschieden hast?',
      },
    },
  },
  en: {
    pageTitle: 'Feedback Form - Coaching',
    subtitle: 'Coaching Feedback Form',
    submitSuccessTitle: 'Thank you.',
    submitSuccessBody: 'Your feedback was submitted successfully.',
    unavailableTitle: 'This link is no longer available.',
    fatalErrorTitle: 'An error occurred while submitting.',
    unavailableBody: 'Please request a new link from your coach.',
    fatalErrorBody: 'Please try again in a few minutes.',
    expiresLabel: 'Link valid until',
    requiredAlert: 'Please answer all required questions.',
    genericSubmitError: 'An error occurred while submitting. Please try again.',
    submitSending: 'Submitting...',
    submitAction: 'Submit',
    questions: {
      trainingDuration: {
        label: 'How long have you been training with me?',
        options: ['1-2 months', '3-4 months', '5+ months', 'Option 4'],
      },
      progressSinceStart: {
        label: 'Have you noticed progress since you started?',
        options: ['Very big', 'Clear', 'Small', 'Not really yet'],
      },
      specificImprovements: {
        label: 'What specifically improved? e.g. strength, technique, body awareness, motivation, measurements, confidence, etc.',
      },
      biggestChange: {
        label: 'What has been your biggest change so far?',
      },
      supportFeeling: {
        label: 'Do you feel well guided and understood?',
        options: ['Yes, absolutely', 'Mostly', 'Partly', 'Not really'],
      },
      coachCanImprove: {
        label: 'Is there anything I could improve?',
      },
      wouldRecommend: {
        label: 'Would you recommend me?',
        options: ['Yes, definitely', 'Probably', 'Probably not'],
      },
      allowInstagramUse: {
        label: 'May I use your feedback anonymously on my Instagram?',
        options: ['Yes', 'No'],
      },
      mainDecisionReason: {
        label: 'What was the main reason you chose my coaching?',
      },
    },
  },
  pt: {
    pageTitle: 'Formulario de Feedback - Acompanhamento',
    subtitle: 'Formulario de Feedback do Acompanhamento',
    submitSuccessTitle: 'Obrigado.',
    submitSuccessBody: 'O teu feedback foi enviado com sucesso.',
    unavailableTitle: 'Este link ja nao esta disponivel.',
    fatalErrorTitle: 'Ocorreu um erro ao enviar.',
    unavailableBody: 'Pede um novo link ao teu treinador.',
    fatalErrorBody: 'Tenta novamente dentro de alguns minutos.',
    expiresLabel: 'Link valido ate',
    requiredAlert: 'Responde a todas as perguntas obrigatorias.',
    genericSubmitError: 'Ocorreu um erro ao enviar. Tenta novamente.',
    submitSending: 'A enviar...',
    submitAction: 'Enviar',
    questions: {
      trainingDuration: {
        label: 'Ha quanto tempo treinas comigo?',
        options: ['1-2 meses', '3-4 meses', '5+ meses', 'Opcao 4'],
      },
      progressSinceStart: {
        label: 'Notaste progressos desde o inicio?',
        options: ['Muito grandes', 'Claros', 'Pequenos', 'Ainda nao realmente'],
      },
      specificImprovements: {
        label: 'O que melhorou concretamente? ex: forca, tecnica, consciencia corporal, motivacao, medidas, autoconfianca, etc.',
      },
      biggestChange: {
        label: 'Qual foi a tua maior mudanca ate agora?',
      },
      supportFeeling: {
        label: 'Sentes-te bem acompanhado e compreendido?',
        options: ['Sim, absolutamente', 'Na maioria das vezes', 'Parcialmente', 'Nao muito'],
      },
      coachCanImprove: {
        label: 'Ha algo que eu possa melhorar?',
      },
      wouldRecommend: {
        label: 'Recomendarias o meu acompanhamento?',
        options: ['Sim, definitivamente', 'Provavelmente', 'Provavelmente nao'],
      },
      allowInstagramUse: {
        label: 'Posso usar o teu feedback de forma anonima no meu Instagram?',
        options: ['Sim', 'Nao'],
      },
      mainDecisionReason: {
        label: 'Qual foi o principal motivo para escolheres o meu acompanhamento?',
      },
    },
  },
};

function emptyForm() {
  return {
    trainingDuration: '',
    progressSinceStart: '',
    specificImprovements: '',
    biggestChange: '',
    supportFeeling: '',
    coachCanImprove: '',
    wouldRecommend: '',
    allowInstagramUse: '',
    mainDecisionReason: '',
  };
}

export default function PublicFeedbackPage() {
  const { token } = useParams();
  const { i18n } = useTranslation();
  const { showWarning } = useAppFeedback();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [linkData, setLinkData] = useState(null);
  const [fatalErrorState, setFatalErrorState] = useState('');
  const [submitErrorMessage, setSubmitErrorMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const resolvedLanguageCode = String(i18n.resolvedLanguage || i18n.language || 'de')
    .toLowerCase()
    .split('-')[0]
    .split('_')[0];
  const language = ['de', 'en', 'pt'].includes(resolvedLanguageCode) ? resolvedLanguageCode : 'de';
  const copy = FEEDBACK_FORM_COPY[language];
  const locale = useMemo(() => ({ en: 'en-US', pt: 'pt-PT', de: 'de-DE' }[language] || 'de-DE'), [language]);

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
        const response = await publicFeedbackApi.getLink(token);
        if (!active) return;
        setLinkData(response.data);
        setFatalErrorState('');
      } catch (err) {
        if (!active) return;
        const status = err.response?.status;
        setFatalErrorState(status === 404 || status === 410 ? 'expired' : 'error');
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

    if (!form.trainingDuration || !form.progressSinceStart || !form.supportFeeling || !form.wouldRecommend || !form.allowInstagramUse) {
      showWarning(copy.requiredAlert);
      return;
    }

    setSubmitting(true);
    setSubmitErrorMessage('');
    try {
      await publicFeedbackApi.submit(token, {
        language,
        trainingDuration: form.trainingDuration,
        progressSinceStart: form.progressSinceStart,
        specificImprovements: form.specificImprovements.trim(),
        biggestChange: form.biggestChange.trim(),
        supportFeeling: form.supportFeeling,
        coachCanImprove: form.coachCanImprove.trim(),
        wouldRecommend: form.wouldRecommend,
        allowInstagramUse: form.allowInstagramUse === 'yes',
        mainDecisionReason: form.mainDecisionReason.trim(),
      });
      setSubmitted(true);
      setFatalErrorState('');
      setSubmitErrorMessage('');
    } catch (err) {
      const status = err.response?.status;
      if (status === 404 || status === 410) {
        setFatalErrorState('expired');
      } else {
        setSubmitErrorMessage(err.response?.data?.error || copy.genericSubmitError);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const renderRadioQuestion = (key, question) => {
    const required = ['trainingDuration', 'progressSinceStart', 'supportFeeling', 'wouldRecommend', 'allowInstagramUse'].includes(key);
    return (
      <div key={key} style={{ border: '1px solid #D7E3F0', borderRadius: 14, padding: 12, background: '#F8FBFF' }}>
        <div style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#000000', marginBottom: 10 }}>{question.label}</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {(question.options || []).map((option, index) => {
            const isInstagram = key === 'allowInstagramUse';
            const optionValue = isInstagram
              ? (index === 0 ? 'yes' : 'no')
              : option;

            return (
              <label
                key={`${key}-${option}`}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  fontSize: 13,
                  color: '#000000',
                  border: '1px solid #D7E3F0',
                  borderRadius: 10,
                  padding: '10px 12px',
                  background: '#FFFFFF',
                }}
              >
                <input
                  type="radio"
                  name={key}
                  value={optionValue}
                  checked={form[key] === optionValue}
                  onChange={(event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))}
                  required={required}
                  style={{
                    width: 16,
                    minWidth: 16,
                    height: 16,
                    padding: 0,
                    margin: '2px 0 0',
                    border: 'none',
                    borderRadius: '50%',
                    background: 'transparent',
                    boxShadow: 'none',
                    outline: 'none',
                    accentColor: '#5682B1',
                    flexShrink: 0,
                  }}
                />
                <span style={{ lineHeight: 1.35 }}>{option}</span>
              </label>
            );
          })}
        </div>
      </div>
    );
  };

  const renderTextQuestion = (key, label) => (
    <div key={key}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#000000', marginBottom: 6 }}>{label}</label>
      <textarea
        rows={3}
        value={form[key]}
        onChange={(event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))}
        style={{ width: '100%', borderRadius: 12, border: '1.5px solid #739EC9', padding: '10px 12px', fontSize: 14, background: '#FFFFFF', resize: 'vertical' }}
      />
    </div>
  );

  if (loading) return <BrandLoadingScreen />;

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(circle at top, #E8F3FF 0%, #F7FBFF 48%, #FFFFFF 100%)', padding: '24px 16px 40px' }}>
      <div style={{ width: 'min(860px, 100%)', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#5682B1' }}>
              Daniel Abreu Trainer
            </div>
            <div style={{ marginTop: 6, fontSize: 28, fontWeight: 900, color: '#000000' }}>
              {copy.pageTitle}
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: '#5682B1' }}>{copy.subtitle}</div>
          </div>
          <div style={{ minWidth: 124 }}>
            <LanguageSwitcher />
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #D7E3F0', borderRadius: 24, boxShadow: '0 24px 60px rgba(86,130,177,0.14)', padding: '24px 22px' }}>
          {submitted ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#000000' }}>{copy.submitSuccessTitle}</div>
              <div style={{ fontSize: 14, color: '#5682B1', lineHeight: 1.6 }}>
                {copy.submitSuccessBody}
              </div>
            </div>
          ) : fatalErrorState ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#000000' }}>
                {fatalErrorState === 'expired' ? copy.unavailableTitle : copy.fatalErrorTitle}
              </div>
              <div style={{ fontSize: 14, color: '#5682B1', lineHeight: 1.6 }}>
                {fatalErrorState === 'expired'
                  ? copy.unavailableBody
                  : copy.fatalErrorBody}
              </div>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 18, padding: '10px 12px', borderRadius: 16, background: '#F8FBFF', border: '1px solid #D7E3F0', fontSize: 12, color: '#5682B1', fontWeight: 700 }}>
                {copy.expiresLabel}: {new Date(linkData?.link?.expiresAt).toLocaleString(locale)}
              </div>

              <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 16 }}>
                {submitErrorMessage ? (
                  <div style={{ padding: '10px 12px', borderRadius: 12, background: '#FFF4F4', border: '1px solid #F3C5C5', color: '#9F2D2D', fontSize: 13, fontWeight: 700 }}>
                    {submitErrorMessage}
                  </div>
                ) : null}

                {renderRadioQuestion('trainingDuration', copy.questions.trainingDuration)}
                {renderRadioQuestion('progressSinceStart', copy.questions.progressSinceStart)}
                {renderTextQuestion('specificImprovements', copy.questions.specificImprovements.label)}
                {renderTextQuestion('biggestChange', copy.questions.biggestChange.label)}
                {renderRadioQuestion('supportFeeling', copy.questions.supportFeeling)}
                {renderTextQuestion('coachCanImprove', copy.questions.coachCanImprove.label)}
                {renderRadioQuestion('wouldRecommend', copy.questions.wouldRecommend)}
                {renderRadioQuestion('allowInstagramUse', copy.questions.allowInstagramUse)}
                {renderTextQuestion('mainDecisionReason', copy.questions.mainDecisionReason.label)}

                <button
                  type="submit"
                  disabled={submitting}
                  style={{ minHeight: 48, border: 'none', borderRadius: 14, background: '#5682B1', color: '#FFFFFF', fontSize: 14, fontWeight: 900, cursor: 'pointer', opacity: submitting ? 0.7 : 1 }}
                >
                  {submitting ? copy.submitSending : copy.submitAction}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

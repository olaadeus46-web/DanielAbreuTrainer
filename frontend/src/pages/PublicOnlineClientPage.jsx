import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import BrandLoadingScreen from '../components/ui/BrandLoadingScreen';
import LanguageSwitcher from '../components/ui/LanguageSwitcher';
import { useAppFeedback } from '../components/ui/FeedbackProvider';
import { publicOnlineClientApi } from '../services/api';

const ONLINE_FORM_COPY = {
  de: {
    pageTitle: 'Fragebogen TP',
    submitSuccessTitle: 'Vielen Dank.',
    submitSuccessBody: 'Dein Fragebogen wurde erfolgreich gesendet.',
    unavailableTitle: 'Dieser Link ist nicht mehr verfügbar.',
    fatalErrorTitle: 'Beim Senden ist ein Fehler aufgetreten.',
    unavailableBody: 'Bitte fordere einen neuen Link bei deinem Trainer an.',
    fatalErrorBody: 'Bitte versuche es in einigen Minuten erneut.',
    expiresLabel: 'Link gültig bis',
    requiredAlert: 'Bitte fülle Vor- und Nachname, Geburtsdatum, Grösse/Gewicht und E-Mail aus.',
    duplicatedEmailError: 'Diese E-Mail-Adresse ist bereits registriert. Bitte nutze eine andere E-Mail.',
    genericSubmitError: 'Beim Senden ist ein Fehler aufgetreten. Bitte versuche es erneut.',
    submitSending: 'Wird gesendet...',
    submitAction: 'Absenden',
    labels: {
      fullName: 'Vor- und Nachname',
      birthDate: 'Geburtsdatum',
      questionnaireDate: 'Date',
      sizeAndWeight: 'Grösse und aktuelles Gewicht',
      heightCm: 'Grösse (cm)',
      weightKg: 'Gewicht (kg)',
      email: 'E-Mail Adresse',
    },
    questions: [
      ['Trainingserfahrung - seit wann gehst du regelmässig ins Fitnessstudio?', 'gymExperience'],
      ['Was hast du bisher trainiert? zb: Functional Training, Krafttraining (Geräte), Körpergewicht, gemischt Geräte / Bodyweight...', 'previousTraining'],
      ['Wie hast du trainiert? zb: Zahl and Sätzen pro Übungen, Wiederholungen, Pause zwischen Sätzen, wie oft...', 'trainingMethod'],
      ['Was ist dein Hauptziel?', 'mainGoal'],
      ['Was motiviert dich, dieses Ziel zu erreichen? (Welcher Grund?)', 'motivationReason'],
      ['Wie oft hast du realistisch vor, trainieren zu kommen?', 'realisticFrequency'],
      ['Wie lange hast du für eine Trainingseinheit?', 'sessionLength'],
      ['Möchtest du mehr Geräte, Körpergewicht-Übungen, Functional...', 'preferredStyle'],
      ['Schaust du schon auf die Ernährung? wenn ja, was schaust du genau täglich drauf?', 'nutritionHabits'],
      ['Hast du Gesundheitliche Probleme? oder irgendwelche Einschränkungen?', 'healthProblems'],
      ['Hast du in den letzten 3 Jahren Operationen gehabt? wenn ja, welche?', 'recentSurgeries'],
    ],
  },
  en: {
    pageTitle: 'TP Questionnaire',
    submitSuccessTitle: 'Thank you.',
    submitSuccessBody: 'Your questionnaire was submitted successfully.',
    unavailableTitle: 'This link is no longer available.',
    fatalErrorTitle: 'An error occurred while submitting.',
    unavailableBody: 'Please request a new link from your trainer.',
    fatalErrorBody: 'Please try again in a few minutes.',
    expiresLabel: 'Link valid until',
    requiredAlert: 'Please fill in full name, birth date, height/weight, and e-mail.',
    duplicatedEmailError: 'This e-mail is already registered. Please use another e-mail.',
    genericSubmitError: 'An error occurred while submitting. Please try again.',
    submitSending: 'Submitting...',
    submitAction: 'Submit',
    labels: {
      fullName: 'First and last name',
      birthDate: 'Birth date',
      questionnaireDate: 'Date',
      sizeAndWeight: 'Height and current weight',
      heightCm: 'Height (cm)',
      weightKg: 'Weight (kg)',
      email: 'E-mail address',
    },
    questions: [
      ['Training experience - since when have you been regularly going to the gym?', 'gymExperience'],
      ['What have you trained so far? e.g. functional training, strength training (machines), bodyweight, mixed machines/bodyweight...', 'previousTraining'],
      ['How did you train? e.g. sets per exercise, repetitions, rest between sets, how often...', 'trainingMethod'],
      ['What is your main goal?', 'mainGoal'],
      ['What motivates you to achieve this goal? (Main reason?)', 'motivationReason'],
      ['How often do you realistically plan to train?', 'realisticFrequency'],
      ['How much time do you have for a training session?', 'sessionLength'],
      ['Would you prefer more machines, bodyweight exercises, functional...', 'preferredStyle'],
      ['Do you already track your nutrition? If yes, what do you track daily?', 'nutritionHabits'],
      ['Do you have health issues or any limitations?', 'healthProblems'],
      ['Have you had surgeries in the last 3 years? If yes, which ones?', 'recentSurgeries'],
    ],
  },
  pt: {
    pageTitle: 'Questionario TP',
    submitSuccessTitle: 'Obrigado.',
    submitSuccessBody: 'O teu questionario foi enviado com sucesso.',
    unavailableTitle: 'Este link ja nao esta disponivel.',
    fatalErrorTitle: 'Ocorreu um erro ao enviar.',
    unavailableBody: 'Pede um novo link ao teu treinador.',
    fatalErrorBody: 'Tenta novamente dentro de alguns minutos.',
    expiresLabel: 'Link valido ate',
    requiredAlert: 'Preenche nome completo, data de nascimento, altura/peso e e-mail.',
    duplicatedEmailError: 'Este e-mail ja esta registado. Usa outro e-mail.',
    genericSubmitError: 'Ocorreu um erro ao enviar. Tenta novamente.',
    submitSending: 'A enviar...',
    submitAction: 'Enviar',
    labels: {
      fullName: 'Nome e apelido',
      birthDate: 'Data de nascimento',
      questionnaireDate: 'Data',
      sizeAndWeight: 'Altura e peso atual',
      heightCm: 'Altura (cm)',
      weightKg: 'Peso (kg)',
      email: 'Endereco de e-mail',
    },
    questions: [
      ['Experiencia de treino - desde quando vais regularmente ao ginasio?', 'gymExperience'],
      ['O que treinaste ate agora? ex: treino funcional, musculacao (maquinas), peso corporal, misto maquinas/bodyweight...', 'previousTraining'],
      ['Como treinavas? ex: numero de series por exercicio, repeticoes, pausa entre series, frequencia...', 'trainingMethod'],
      ['Qual e o teu objetivo principal?', 'mainGoal'],
      ['O que te motiva a atingir este objetivo? (Qual o principal motivo?)', 'motivationReason'],
      ['Com que frequencia pensas realisticamente em treinar?', 'realisticFrequency'],
      ['Quanto tempo tens para cada treino?', 'sessionLength'],
      ['Preferes mais maquinas, exercicios de peso corporal, funcional...', 'preferredStyle'],
      ['Ja controlas a alimentacao? Se sim, o que controlas diariamente?', 'nutritionHabits'],
      ['Tens problemas de saude ou alguma limitacao?', 'healthProblems'],
      ['Tiveste cirurgias nos ultimos 3 anos? Se sim, quais?', 'recentSurgeries'],
    ],
  },
};

function emptyForm() {
  return {
    fullName: '',
    birthDate: '',
    questionnaireDate: '',
    heightCm: '',
    weightKg: '',
    email: '',
    gymExperience: '',
    previousTraining: '',
    trainingMethod: '',
    mainGoal: '',
    motivationReason: '',
    realisticFrequency: '',
    sessionLength: '',
    preferredStyle: '',
    nutritionHabits: '',
    healthProblems: '',
    recentSurgeries: '',
  };
}

export default function PublicOnlineClientPage() {
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
  const copy = ONLINE_FORM_COPY[language];
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
        const response = await publicOnlineClientApi.getLink(token);
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

    if (!form.fullName.trim() || !form.email.trim() || !form.birthDate || !form.heightCm || !form.weightKg) {
      showWarning(copy.requiredAlert);
      return;
    }

    setSubmitting(true);
    setSubmitErrorMessage('');
    try {
      await publicOnlineClientApi.submit(token, {
        ...form,
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        gymExperience: form.gymExperience.trim(),
        previousTraining: form.previousTraining.trim(),
        trainingMethod: form.trainingMethod.trim(),
        mainGoal: form.mainGoal.trim(),
        motivationReason: form.motivationReason.trim(),
        realisticFrequency: form.realisticFrequency.trim(),
        sessionLength: form.sessionLength.trim(),
        preferredStyle: form.preferredStyle.trim(),
        nutritionHabits: form.nutritionHabits.trim(),
        healthProblems: form.healthProblems.trim(),
        recentSurgeries: form.recentSurgeries.trim(),
      });
      setSubmitted(true);
      setFatalErrorState('');
      setSubmitErrorMessage('');
    } catch (err) {
      const status = err.response?.status;
      if (status === 404 || status === 410) {
        setFatalErrorState('expired');
      } else if (status === 409) {
        setSubmitErrorMessage(copy.duplicatedEmailError);
      } else {
        setSubmitErrorMessage(err.response?.data?.error || copy.genericSubmitError);
      }
    } finally {
      setSubmitting(false);
    }
  };

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

              <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
                {submitErrorMessage ? (
                  <div style={{ padding: '10px 12px', borderRadius: 12, background: '#FFF4F4', border: '1px solid #F3C5C5', color: '#9F2D2D', fontSize: 13, fontWeight: 700 }}>
                    {submitErrorMessage}
                  </div>
                ) : null}

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#000000', marginBottom: 6 }}>{copy.labels.fullName}</label>
                  <input type="text" required value={form.fullName} onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))} />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#000000', marginBottom: 6 }}>{copy.labels.birthDate}</label>
                  <input type="date" required value={form.birthDate} onChange={(event) => setForm((prev) => ({ ...prev, birthDate: event.target.value }))} />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#000000', marginBottom: 6 }}>{copy.labels.questionnaireDate}</label>
                  <input type="date" value={form.questionnaireDate} onChange={(event) => setForm((prev) => ({ ...prev, questionnaireDate: event.target.value }))} />
                </div>

                <div style={{ border: '1px solid #D7E3F0', borderRadius: 14, padding: 12, background: '#F8FBFF' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#000000', marginBottom: 10 }}>{copy.labels.sizeAndWeight}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, color: '#5682B1', marginBottom: 4 }}>{copy.labels.heightCm}</label>
                      <input type="number" step="0.1" required value={form.heightCm} onChange={(event) => setForm((prev) => ({ ...prev, heightCm: event.target.value }))} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, color: '#5682B1', marginBottom: 4 }}>{copy.labels.weightKg}</label>
                      <input type="number" step="0.1" required value={form.weightKg} onChange={(event) => setForm((prev) => ({ ...prev, weightKg: event.target.value }))} />
                    </div>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#000000', marginBottom: 6 }}>{copy.labels.email}</label>
                  <input type="email" required value={form.email} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} />
                </div>

                {copy.questions.map(([label, key]) => (
                  <div key={key}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#000000', marginBottom: 6 }}>{label}</label>
                    <textarea
                      rows={3}
                      value={form[key]}
                      onChange={(event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))}
                      style={{ width: '100%', borderRadius: 12, border: '1.5px solid #739EC9', padding: '10px 12px', fontSize: 14, background: '#FFFFFF', resize: 'vertical' }}
                    />
                  </div>
                ))}

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

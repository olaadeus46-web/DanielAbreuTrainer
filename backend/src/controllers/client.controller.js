import bcrypt from 'bcryptjs';
import * as pdfParseModule from 'pdf-parse';
import JSON5 from 'json5';
import { randomBytes } from 'node:crypto';
import fs from 'fs';
import path from 'path';
import { prisma } from '../config/database.js';
import { AppError } from '../utils/AppError.js';

const pdfParse = pdfParseModule.default ?? pdfParseModule;

const SUPPORTED_LANGUAGES = new Set(['en', 'pt', 'de']);
const DEFAULT_ONLINE_CLIENT_LINK_TTL_HOURS = 72;
const DEFAULT_FEEDBACK_LINK_TTL_HOURS = 72;

const DEFAULT_CLIENT_METRICS_BY_LANGUAGE = {
  de: [
    { name: 'Gewicht', unit: 'kg' },
    { name: 'Bauch', unit: 'cm' },
    { name: 'Hüft', unit: 'cm' },
    { name: 'Rechtes Bein', unit: 'cm' },
    { name: 'Linkes Bein', unit: 'cm' },
    { name: 'Brust', unit: 'cm' },
    { name: 'Rechter Arm', unit: 'cm' },
    { name: 'Linker Arm', unit: 'cm' },
    { name: 'Rechte Waden', unit: 'cm' },
    { name: 'Linke Waden', unit: 'cm' },
  ],
  en: [
    { name: 'Weight', unit: 'kg' },
    { name: 'Waist', unit: 'cm' },
    { name: 'Hips', unit: 'cm' },
    { name: 'Right Leg', unit: 'cm' },
    { name: 'Left Leg', unit: 'cm' },
    { name: 'Chest', unit: 'cm' },
    { name: 'Right Arm', unit: 'cm' },
    { name: 'Left Arm', unit: 'cm' },
    { name: 'Right Calf', unit: 'cm' },
    { name: 'Left Calf', unit: 'cm' },
  ],
  pt: [
    { name: 'Peso', unit: 'kg' },
    { name: 'Barriga', unit: 'cm' },
    { name: 'Anca', unit: 'cm' },
    { name: 'Perna Direita', unit: 'cm' },
    { name: 'Perna Esquerda', unit: 'cm' },
    { name: 'Peito', unit: 'cm' },
    { name: 'Braço Direito', unit: 'cm' },
    { name: 'Braço Esquerdo', unit: 'cm' },
    { name: 'Gémeo Direito', unit: 'cm' },
    { name: 'Gémeo Esquerdo', unit: 'cm' },
  ],
};

function detectLanguage(req, explicitLanguage) {
  const fromBody = String(explicitLanguage || '').toLowerCase().trim();
  const fromHeader = String(req.headers['accept-language'] || '').toLowerCase().trim();

  const bodyCode = fromBody.split(/[-_]/)[0];
  if (SUPPORTED_LANGUAGES.has(bodyCode)) return bodyCode;

  const headerCode = fromHeader.split(',')[0]?.split(';')[0]?.split(/[-_]/)[0];
  if (SUPPORTED_LANGUAGES.has(headerCode)) return headerCode;

  return 'en';
}

function buildDefaultMetricDefinitions(languageCode) {
  const source = DEFAULT_CLIENT_METRICS_BY_LANGUAGE[languageCode] || DEFAULT_CLIENT_METRICS_BY_LANGUAGE.en;
  return source.map((metric, index) => ({
    name: metric.name,
    type: 'NUMBER',
    frequency: 'DAILY',
    unit: metric.unit,
    order: index,
    isRequired: false,
  }));
}

function isMissing(value) {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

function parseNumberField(value, fieldName, { required = false } = {}) {
  if (!required && (value === undefined || value === null || value === '')) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new AppError(`Campo inválido: ${fieldName}.`, 400);
  return parsed;
}

function parseIntegerField(value, fieldName, { required = false } = {}) {
  if (!required && (value === undefined || value === null || value === '')) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) throw new AppError(`Campo inválido: ${fieldName}.`, 400);
  return parsed;
}

function parseDateField(value, fieldName, { required = false } = {}) {
  if (!required && (value === undefined || value === null || value === '')) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new AppError(`Data inválida: ${fieldName}.`, 400);
  return parsed;
}

function parseBooleanField(value) {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
  }
  throw new AppError('Campo inválido: isOnline.', 400);
}

function createOnlineClientLinkToken() {
  return randomBytes(24).toString('hex');
}

function createFeedbackLinkToken() {
  return randomBytes(24).toString('hex');
}

function resolveOnlineClientLinkExpiry(hoursInput) {
  const parsed = Number.parseInt(hoursInput ?? `${DEFAULT_ONLINE_CLIENT_LINK_TTL_HOURS}`, 10);
  const safeHours = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ONLINE_CLIENT_LINK_TTL_HOURS;
  return new Date(Date.now() + (safeHours * 60 * 60 * 1000));
}

function resolveFeedbackLinkExpiry(hoursInput) {
  const parsed = Number.parseInt(hoursInput ?? `${DEFAULT_FEEDBACK_LINK_TTL_HOURS}`, 10);
  const safeHours = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_FEEDBACK_LINK_TTL_HOURS;
  return new Date(Date.now() + (safeHours * 60 * 60 * 1000));
}

function buildPublicOnlineClientUrl(token) {
  const origin = String(process.env.PUBLIC_APP_URL || process.env.CORS_ORIGIN || 'https://danieltrainer.com').replace(/\/$/, '');
  return `${origin}/online-client/${token}`;
}

function buildPublicFeedbackUrl(token) {
  const origin = String(process.env.PUBLIC_APP_URL || process.env.CORS_ORIGIN || 'https://danieltrainer.com').replace(/\/$/, '');
  return `${origin}/feedback/${token}`;
}

function isOnlineClientLinkUnavailable(link) {
  if (!link) return true;
  if (link.usedAt) return true;
  return new Date(link.expiresAt).getTime() <= Date.now();
}

function isFeedbackLinkUnavailable(link) {
  if (!link) return true;
  if (link.usedAt) return true;
  return new Date(link.expiresAt).getTime() <= Date.now();
}

function serializeOnlineClientLink(link, token = null) {
  const resolvedToken = token || link.token || null;
  return {
    id: link.id,
    trainerId: link.trainerId,
    expiresAt: link.expiresAt,
    usedAt: link.usedAt,
    createdAt: link.createdAt,
    submittedClientId: link.submittedClientId || null,
    publicUrl: resolvedToken ? buildPublicOnlineClientUrl(resolvedToken) : null,
  };
}

function serializeFeedbackLink(link, token = null) {
  const resolvedToken = token || link.token || null;
  return {
    id: link.id,
    clientId: link.clientId,
    expiresAt: link.expiresAt,
    usedAt: link.usedAt,
    createdAt: link.createdAt,
    submittedFeedbackId: link.submittedFeedbackId || null,
    publicUrl: resolvedToken ? buildPublicFeedbackUrl(resolvedToken) : null,
  };
}

function parseTrainingFrequencyFromText(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const match = raw.match(/\d+/);
  if (!match) return null;
  const parsed = Number.parseInt(match[0], 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function buildOnlineClientHealthIssues(healthProblems, surgeries) {
  const parts = [];
  const normalizedHealthProblems = String(healthProblems || '').trim();
  const normalizedSurgeries = String(surgeries || '').trim();
  if (normalizedHealthProblems) parts.push(normalizedHealthProblems);
  if (normalizedSurgeries) parts.push(`Operationen (letzte 3 Jahre): ${normalizedSurgeries}`);
  return parts.length ? parts.join('\n\n') : null;
}

function buildOnlineClientTrainingNotes(previousTraining, trainingMethod, preferredStyle) {
  const lines = [];
  const normalizedPreviousTraining = String(previousTraining || '').trim();
  const normalizedTrainingMethod = String(trainingMethod || '').trim();
  const normalizedPreferredStyle = String(preferredStyle || '').trim();

  if (normalizedPreviousTraining) lines.push(`Bisher trainiert: ${normalizedPreviousTraining}`);
  if (normalizedTrainingMethod) lines.push(`Trainingsmethode: ${normalizedTrainingMethod}`);
  if (normalizedPreferredStyle) lines.push(`Präferenz (Geräte/Körpergewicht/Functional): ${normalizedPreferredStyle}`);

  return lines.length ? lines.join('\n') : null;
}

function sanitizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function calculateAgeFromBirthDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const birthdayThisYear = new Date(now.getFullYear(), date.getMonth(), date.getDate());
  if (now < birthdayThisYear) age -= 1;
  return age > 0 ? age : null;
}

function buildOnlineClientSnapshotNotes(payload) {
  const rows = [
    ['Fragebogen TP', ''],
    ['Vor- und Nachname', payload.fullName],
    ['Geburtsdatum', payload.birthDate],
    ['Date', payload.questionnaireDate],
    ['Grösse und aktuelles Gewicht', `${payload.heightCm} cm / ${payload.weightKg} kg`],
    ['E-Mail Adresse', payload.email],
    ['Trainingserfahrung', payload.gymExperience],
    ['Was hast du bisher trainiert?', payload.previousTraining],
    ['Wie hast du trainiert?', payload.trainingMethod],
    ['Was ist dein Hauptziel?', payload.mainGoal],
    ['Was motiviert dich?', payload.motivationReason],
    ['Wie oft realistisch trainieren?', payload.realisticFrequency],
    ['Wie lange pro Einheit?', payload.sessionLength],
    ['Mehr Geräte/Körpergewicht/Functional?', payload.preferredStyle],
    ['Achte auf Ernährung?', payload.nutritionHabits],
    ['Gesundheitliche Probleme/Einschränkungen?', payload.healthProblems],
    ['Operationen letzte 3 Jahre?', payload.recentSurgeries],
  ];

  return rows
    .filter(([, value]) => String(value || '').trim() !== '')
    .map(([label, value]) => (value ? `${label}: ${value}` : label))
    .join('\n');
}

function getClaudeTextFromResponse(data) {
  return (data?.content || [])
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim();
}

function normalizeJsonCandidate(raw) {
  return String(raw || '')
    .replace(/^[\uFEFF\u200B\u200C\u200D]+/, '')
    .replace(/^json\s*/i, '')
    .replace(/^[a-z]+\r?\n(?=\s*[\[{])/i, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, '$1')
    .trim();
}

function collectBalancedJsonObjectSlices(text) {
  const raw = String(text || '');
  const slices = [];

  let start = -1;
  let depth = 0;
  let inString = false;
  let stringQuote = '';
  let escaping = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];

    if (escaping) {
      escaping = false;
      continue;
    }

    if (inString) {
      if (char === '\\') {
        escaping = true;
      } else if (char === stringQuote) {
        inString = false;
        stringQuote = '';
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      stringQuote = char;
      continue;
    }

    if (char === '{') {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }

    if (char === '}') {
      if (depth === 0) continue;
      depth -= 1;
      if (depth === 0 && start !== -1) {
        slices.push(raw.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return slices;
}

function extractJsonObject(text) {
  const rawText = String(text || '').trim();
  if (!rawText) throw new AppError('Claude não retornou conteúdo.', 502);

  const candidates = [];
  const fencedJsonBlocks = [...rawText.matchAll(/```json\s*([\s\S]*?)```/gi)].map((m) => m[1]?.trim()).filter(Boolean);
  const fencedAnyBlocks = [...rawText.matchAll(/```\s*([\s\S]*?)```/g)].map((m) => m[1]?.trim()).filter(Boolean);

  candidates.push(...fencedJsonBlocks);
  candidates.push(...fencedAnyBlocks);
  candidates.push(rawText);

  const expanded = [];
  for (const candidate of candidates) {
    expanded.push(candidate);
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) expanded.push(candidate.slice(start, end + 1));
    expanded.push(...collectBalancedJsonObjectSlices(candidate));
  }

  for (const candidate of expanded) {
    const cleaned = normalizeJsonCandidate(candidate);
    if (!cleaned) continue;

    try {
      const parsed = JSON.parse(cleaned);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      try {
        const parsed = JSON5.parse(cleaned);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      } catch {
        // Try next candidate.
      }
    }
  }

  throw new AppError('Não foi possível interpretar o JSON da Claude.', 502);
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function callClaudeWithFallback({ apiKey, preferredModel, content }) {
  const fallbackModels = [
    preferredModel,
    'claude-3-7-sonnet-latest',
    'claude-3-5-sonnet-latest',
    'claude-3-haiku-20240307',
  ].filter(Boolean).filter((model, index, all) => all.indexOf(model) === index);

  const transientStatuses = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);
  let lastErrorMessage = '';

  for (const model of fallbackModels) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 2000,
          temperature: 0,
          messages: [{ role: 'user', content }],
        }),
      });

      if (response.ok) return response.json();

      const rawErrorText = await response.text();
      let parsedError = null;
      try {
        parsedError = JSON.parse(rawErrorText);
      } catch {
        parsedError = null;
      }

      const errorType = String(parsedError?.error?.type || '').toLowerCase();
      const errorMessage = String(parsedError?.error?.message || rawErrorText || '').trim();
      lastErrorMessage = errorMessage;
      const lowerMessage = errorMessage.toLowerCase();

      const isAuthError = response.status === 401 || response.status === 403 || errorType.includes('authentication');
      if (isAuthError) throw new AppError('Falha de autenticação com Claude API. Verifique a ANTHROPIC_API_KEY.', 502);

      const isTransient = transientStatuses.has(response.status)
        || lowerMessage.includes('overloaded')
        || errorType.includes('overloaded')
        || lowerMessage.includes('temporarily unavailable');

      if (isTransient && attempt < 2) {
        const backoffMs = 700 * (2 ** attempt) + Math.floor(Math.random() * 300);
        await delay(backoffMs);
        continue;
      }

      const looksLikeModelIssue =
        response.status === 404
        || lowerMessage.includes('model')
        || lowerMessage.includes('unsupported')
        || lowerMessage.includes('unavailable')
        || lowerMessage.includes('does not exist');

      if (looksLikeModelIssue) break;

      throw new AppError(`Erro da Claude API (${response.status}). ${errorMessage.slice(0, 220)}`, 502);
    }
  }

  throw new AppError(`Nenhum modelo Claude disponível para a chave configurada. Detalhe: ${lastErrorMessage.slice(0, 220)}`, 502);
}

function getIntakeFile(req) {
  if (req.file?.buffer) return req.file;
  if (req.files?.intakeFile?.[0]?.buffer) return req.files.intakeFile[0];
  return null;
}

function getIntakeFileKind(file) {
  const mimeType = String(file?.mimetype || '').toLowerCase();
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('image/')) return 'image';
  return 'unsupported';
}

function getClaudeImageMediaType(file) {
  const mimeType = String(file?.mimetype || '').toLowerCase();
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'image/jpeg';
  if (mimeType === 'image/png') return 'image/png';
  if (mimeType === 'image/webp') return 'image/webp';
  if (mimeType === 'image/gif') return 'image/gif';
  return null;
}

function parseNumericLoose(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === '') return null;
  const cleaned = String(rawValue).replace(',', '.').match(/-?\d+(\.\d+)?/);
  if (!cleaned) return null;
  const parsed = Number(cleaned[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseIntegerLoose(rawValue) {
  const parsed = parseNumericLoose(rawValue);
  if (parsed === null) return null;
  return Number.parseInt(parsed, 10);
}

function parseDateLoose(rawValue) {
  if (!rawValue) return null;
  const value = String(rawValue).trim();
  if (!value) return null;

  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString().slice(0, 10);

  const slashMatch = value.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (slashMatch) {
    const day = slashMatch[1].padStart(2, '0');
    const month = slashMatch[2].padStart(2, '0');
    const year = slashMatch[3];
    const normalized = `${year}-${month}-${day}`;
    const dt = new Date(normalized);
    if (!Number.isNaN(dt.getTime())) return normalized;
  }

  return null;
}

function sanitizeExtractedFields(rawFields = {}) {
  const source = rawFields && typeof rawFields === 'object' ? rawFields : {};
  const stringField = (name) => {
    const value = source[name];
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    return text || null;
  };

  return {
    name: stringField('name'),
    email: stringField('email'),
    phone: stringField('phone'),
    heightCm: parseNumericLoose(source.heightCm),
    age: parseIntegerLoose(source.age),
    initialWeight: parseNumericLoose(source.initialWeight),
    waistCircumferenceCm: parseNumericLoose(source.waistCircumferenceCm),
    birthDate: parseDateLoose(source.birthDate),
    address: stringField('address'),
    startDate: parseDateLoose(source.startDate),
    goal: stringField('goal'),
    gymExperience: stringField('gymExperience'),
    motivation: stringField('motivation'),
    activityAndWork: stringField('activityAndWork'),
    trainingAvailability: stringField('trainingAvailability'),
    nutritionHabits: stringField('nutritionHabits'),
    healthIssues: stringField('healthIssues'),
    trainingPlanNotes: stringField('trainingPlanNotes'),
    trainingFrequency: parseIntegerLoose(source.trainingFrequency),
    notes: stringField('notes'),
  };
}

async function parseIntakeWithClaude({ apiKey, preferredModel, file }) {
  const templatePrompt = [
    'Extract client intake information from the provided document and return ONLY valid JSON.',
    'The output JSON must follow exactly this shape:',
    '{',
    '  "fields": {',
    '    "name": null,',
    '    "email": null,',
    '    "phone": null,',
    '    "heightCm": null,',
    '    "age": null,',
    '    "initialWeight": null,',
    '    "waistCircumferenceCm": null,',
    '    "birthDate": null,',
    '    "address": null,',
    '    "startDate": null,',
    '    "goal": null,',
    '    "gymExperience": null,',
    '    "motivation": null,',
    '    "activityAndWork": null,',
    '    "trainingAvailability": null,',
    '    "nutritionHabits": null,',
    '    "healthIssues": null,',
    '    "trainingPlanNotes": null,',
    '    "trainingFrequency": null,',
    '    "notes": null',
    '  }',
    '}',
    'Rules:',
    '- Keep unknown fields as null.',
    '- Use numeric values for heightCm, age, initialWeight, waistCircumferenceCm, trainingFrequency when possible.',
    '- Dates should be strings in YYYY-MM-DD if clear, otherwise null.',
    '- Accept documents in German, Portuguese, or English.',
    '- Return only JSON, no markdown and no comments.',
  ].join('\n');

  if (getIntakeFileKind(file) === 'pdf') {
    const parsedPdf = await pdfParse(file.buffer);
    const text = String(parsedPdf?.text || '').trim();
    if (!text) throw new AppError('Não foi possível extrair texto do PDF enviado.', 400);

    const response = await callClaudeWithFallback({
      apiKey,
      preferredModel,
      content: `${templatePrompt}\n\nDocument text:\n${text.slice(0, 30000)}`,
    });

    return extractJsonObject(getClaudeTextFromResponse(response));
  }

  const mediaType = getClaudeImageMediaType(file);
  if (!mediaType) {
    throw new AppError('Formato de imagem não suportado. Use PNG, JPG, WEBP ou GIF.', 400);
  }

  const response = await callClaudeWithFallback({
    apiKey,
    preferredModel,
    content: [
      { type: 'text', text: templatePrompt },
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType,
          data: file.buffer.toString('base64'),
        },
      },
    ],
  });

  return extractJsonObject(getClaudeTextFromResponse(response));
}

async function getTrainerOrThrow(userId) {
  const trainer = await prisma.trainer.findUnique({ where: { userId } });
  if (!trainer) throw new AppError('Trainer não encontrado.', 404);
  return trainer;
}

async function findClientForTrainer(clientId, trainerId) {
  const client = await prisma.client.findFirst({
    where: { id: clientId, trainerId },
    include: { user: { select: { email: true } }, package: true },
  });
  if (!client) throw new AppError('Cliente não encontrado.', 404);
  return client;
}

async function getPublicOnlineClientLinkOrThrow(token) {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) throw new AppError('Token inválido.', 400);

  const link = await prisma.onlineClientLink.findUnique({ where: { token: normalizedToken } });
  if (!link) throw new AppError('Link de cliente online não encontrado.', 404);
  if (isOnlineClientLinkUnavailable(link)) throw new AppError('Link de cliente online expirado.', 410);

  const trainer = await prisma.trainer.findUnique({ where: { id: link.trainerId } });
  if (!trainer) throw new AppError('Trainer não encontrado para este link.', 404);

  return { link, trainer };
}

async function getPublicFeedbackLinkOrThrow(token) {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) throw new AppError('Token inválido.', 400);

  const link = await prisma.feedbackLink.findUnique({ where: { token: normalizedToken } });
  if (!link) throw new AppError('Link de feedback não encontrado.', 404);
  if (isFeedbackLinkUnavailable(link)) throw new AppError('Link de feedback expirado.', 410);

  const client = await prisma.client.findUnique({ where: { id: link.clientId } });
  if (!client) throw new AppError('Cliente não encontrado para este link.', 404);

  return { link, client };
}

async function resolvePackageForTrainer(packageId, trainerId) {
  if (!packageId) return null;
  const pkg = await prisma.clientPackage.findFirst({ where: { id: packageId, trainerId } });
  if (!pkg) throw new AppError('Pacote inválido para este trainer.', 400);
  return pkg;
}

function normalizeFolderName(value) {
  return String(value || '').trim();
}

function normalizeItemTitle(value) {
  return String(value || '').trim();
}

function normalizeExternalUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new AppError('O link externo deve começar por http:// ou https://.', 400);
    }
    return url.toString();
  } catch {
    throw new AppError('Link externo inválido.', 400);
  }
}

function resolveAbsoluteUploadPath(urlPath) {
  const normalized = String(urlPath || '').replace(/^\/+/, '');
  return path.resolve(process.cwd(), normalized);
}

function deleteFileIfExists(urlPath) {
  if (!urlPath) return;
  const absolute = resolveAbsoluteUploadPath(urlPath);
  try {
    if (fs.existsSync(absolute)) fs.unlinkSync(absolute);
  } catch {
    // Ignore file cleanup issues to avoid blocking main flow.
  }
}

async function findClientFileFolderForTrainer({ trainerId, clientId, folderId }) {
  const folder = await prisma.clientFileFolder.findFirst({
    where: { id: folderId, trainerId, clientId },
  });
  if (!folder) throw new AppError('Pasta não encontrada.', 404);
  return folder;
}

async function findClientFileItemForTrainer({ trainerId, clientId, itemId }) {
  const item = await prisma.clientFileItem.findFirst({
    where: { id: itemId, trainerId, clientId },
  });
  if (!item) throw new AppError('Arquivo não encontrado.', 404);
  return item;
}

// GET /api/clients/:id/files/folders
export const listClientFileFolders = async (req, res, next) => {
  try {
    const trainer = await getTrainerOrThrow(req.userId);
    const client = await findClientForTrainer(req.params.id, trainer.id);

    const folders = await prisma.clientFileFolder.findMany({
      where: { trainerId: trainer.id, clientId: client.id },
      orderBy: { name: 'asc' },
    });

    const folderIds = folders.map((folder) => folder.id);
    const items = folderIds.length
      ? await prisma.clientFileItem.findMany({
          where: { trainerId: trainer.id, clientId: client.id, folderId: { in: folderIds } },
          orderBy: [{ createdAt: 'desc' }],
        })
      : [];

    const itemsByFolderId = new Map();
    for (const item of items) {
      const bucket = itemsByFolderId.get(item.folderId) || [];
      bucket.push(item);
      itemsByFolderId.set(item.folderId, bucket);
    }

    const payload = folders.map((folder) => ({
      ...folder,
      items: itemsByFolderId.get(folder.id) || [],
    }));

    res.json(payload);
  } catch (err) { next(err); }
};

// POST /api/clients/:id/files/folders
export const createClientFileFolder = async (req, res, next) => {
  try {
    const trainer = await getTrainerOrThrow(req.userId);
    const client = await findClientForTrainer(req.params.id, trainer.id);
    const name = normalizeFolderName(req.body?.name);

    if (!name) throw new AppError('Nome da pasta é obrigatório.', 400);

    const existing = await prisma.clientFileFolder.findFirst({
      where: { trainerId: trainer.id, clientId: client.id, name },
    });
    if (existing) throw new AppError('Já existe uma pasta com esse nome.', 409);

    const folder = await prisma.clientFileFolder.create({
      data: {
        trainerId: trainer.id,
        clientId: client.id,
        name,
      },
    });

    res.status(201).json(folder);
  } catch (err) { next(err); }
};

// PATCH /api/clients/:id/files/folders/:folderId
export const updateClientFileFolder = async (req, res, next) => {
  try {
    const trainer = await getTrainerOrThrow(req.userId);
    const client = await findClientForTrainer(req.params.id, trainer.id);
    const folder = await findClientFileFolderForTrainer({
      trainerId: trainer.id,
      clientId: client.id,
      folderId: req.params.folderId,
    });

    const nextName = normalizeFolderName(req.body?.name);
    if (!nextName) throw new AppError('Nome da pasta é obrigatório.', 400);

    const conflict = await prisma.clientFileFolder.findFirst({
      where: {
        trainerId: trainer.id,
        clientId: client.id,
        name: nextName,
      },
    });
    if (conflict && conflict.id !== folder.id) {
      throw new AppError('Já existe uma pasta com esse nome.', 409);
    }

    const updated = await prisma.clientFileFolder.update({
      where: { id: folder.id },
      data: { name: nextName },
    });

    res.json(updated);
  } catch (err) { next(err); }
};

// DELETE /api/clients/:id/files/folders/:folderId
export const deleteClientFileFolder = async (req, res, next) => {
  try {
    const trainer = await getTrainerOrThrow(req.userId);
    const client = await findClientForTrainer(req.params.id, trainer.id);
    const folder = await findClientFileFolderForTrainer({
      trainerId: trainer.id,
      clientId: client.id,
      folderId: req.params.folderId,
    });

    const items = await prisma.clientFileItem.findMany({
      where: { trainerId: trainer.id, clientId: client.id, folderId: folder.id },
    });

    for (const item of items) {
      if (item.type === 'FILE') deleteFileIfExists(item.fileUrl);
    }

    await prisma.clientFileFolder.delete({ where: { id: folder.id } });
    res.json({ message: 'Pasta removida com sucesso.' });
  } catch (err) { next(err); }
};

// POST /api/clients/:id/files/items
export const createClientFileItem = async (req, res, next) => {
  try {
    const trainer = await getTrainerOrThrow(req.userId);
    const client = await findClientForTrainer(req.params.id, trainer.id);

    const folderId = String(req.body?.folderId || '').trim();
    if (!folderId) throw new AppError('folderId é obrigatório.', 400);

    await findClientFileFolderForTrainer({
      trainerId: trainer.id,
      clientId: client.id,
      folderId,
    });

    const typeRaw = String(req.body?.type || (req.file ? 'FILE' : 'LINK')).toUpperCase();
    const type = typeRaw === 'LINK' ? 'LINK' : 'FILE';
    const title = normalizeItemTitle(req.body?.title || req.file?.originalname);
    if (!title) throw new AppError('Título é obrigatório.', 400);

    let itemData = null;
    if (type === 'LINK') {
      const externalUrl = normalizeExternalUrl(req.body?.externalUrl);
      if (!externalUrl) throw new AppError('externalUrl é obrigatório para links.', 400);

      itemData = {
        trainerId: trainer.id,
        clientId: client.id,
        folderId,
        title,
        type,
        externalUrl,
      };
    } else {
      if (!req.file) throw new AppError('Ficheiro não enviado.', 400);

      itemData = {
        trainerId: trainer.id,
        clientId: client.id,
        folderId,
        title,
        type,
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        fileUrl: `/uploads/${req.file.filename}`,
      };
    }

    const item = await prisma.clientFileItem.create({ data: itemData });
    res.status(201).json(item);
  } catch (err) { next(err); }
};

// DELETE /api/clients/:id/files/items/:itemId
export const deleteClientFileItem = async (req, res, next) => {
  try {
    const trainer = await getTrainerOrThrow(req.userId);
    const client = await findClientForTrainer(req.params.id, trainer.id);
    const item = await findClientFileItemForTrainer({
      trainerId: trainer.id,
      clientId: client.id,
      itemId: req.params.itemId,
    });

    if (item.type === 'FILE') deleteFileIfExists(item.fileUrl);
    await prisma.clientFileItem.delete({ where: { id: item.id } });

    res.json({ message: 'Arquivo removido com sucesso.' });
  } catch (err) { next(err); }
};

// GET /api/clients/:id/files/items/:itemId/download
export const downloadClientFileItem = async (req, res, next) => {
  try {
    const trainer = await getTrainerOrThrow(req.userId);
    const client = await findClientForTrainer(req.params.id, trainer.id);
    const item = await findClientFileItemForTrainer({
      trainerId: trainer.id,
      clientId: client.id,
      itemId: req.params.itemId,
    });

    if (item.type !== 'FILE' || !item.fileUrl) {
      throw new AppError('Este item não é um ficheiro para download.', 400);
    }

    const absolutePath = resolveAbsoluteUploadPath(item.fileUrl);
    if (!fs.existsSync(absolutePath)) throw new AppError('Ficheiro não encontrado no servidor.', 404);
    res.download(absolutePath, item.fileName || 'ficheiro');
  } catch (err) { next(err); }
};

// GET /api/clients
export const listClients = async (req, res, next) => {
  try {
    const trainer = await getTrainerOrThrow(req.userId);
    const now = new Date();
    const clients = await prisma.client.findMany({
      where: { trainerId: trainer.id },
      include: {
        user: { select: { email: true } },
        package: true,
        payments: {
          where: { month: now.getMonth() + 1, year: now.getFullYear() },
        },
      },
      orderBy: { name: 'asc' },
    });
    res.json(clients);
  } catch (err) { next(err); }
};

// GET /api/clients/:id
export const getClient = async (req, res, next) => {
  try {
    const trainer = await getTrainerOrThrow(req.userId);
    const now = new Date();
    const client = await prisma.client.findFirst({
      where: { id: req.params.id, trainerId: trainer.id },
      include: {
        user: { select: { email: true } },
        package: true,
        payments: {
          where: { month: now.getMonth() + 1, year: now.getFullYear() },
        },
      },
    });
    if (!client) throw new AppError('Cliente não encontrado.', 404);
    res.json(client);
  } catch (err) { next(err); }
};

// POST /api/clients
export const createClient = async (req, res, next) => {
  try {
    const trainer = await getTrainerOrThrow(req.userId);
    const {
      name,
      email,
      phone,
      heightCm,
      password = 'fitcoach123',
      language,
      age,
      initialWeight,
      waistCircumferenceCm,
      birthDate,
      address,
      startDate,
      goal,
      gymExperience,
      motivation,
      activityAndWork,
      trainingAvailability,
      nutritionHabits,
      healthIssues,
      trainingPlanNotes,
      trainingFrequency,
      monthlyPrice,
      packageId,
      notes,
      isOnline,
    } = req.body;

    const requiredFields = [
      ['name', name],
      ['email', email],
      ['phone', phone],
      ['heightCm', heightCm],
      ['initialWeight', initialWeight],
      ['waistCircumferenceCm', waistCircumferenceCm],
      ['birthDate', birthDate],
      ['address', address],
      ['gymExperience', gymExperience],
      ['goal', goal],
      ['motivation', motivation],
      ['activityAndWork', activityAndWork],
      ['trainingFrequency', trainingFrequency],
      ['trainingAvailability', trainingAvailability],
      ['nutritionHabits', nutritionHabits],
      ['healthIssues', healthIssues],
      ['trainingPlanNotes', trainingPlanNotes],
    ];

    const missingFields = requiredFields
      .filter(([, value]) => isMissing(value))
      .map(([fieldName]) => fieldName);

    if (missingFields.length) {
      throw new AppError(`Campos obrigatórios em falta: ${missingFields.join(', ')}.`, 400);
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new AppError('Email já em uso.', 409);

    const selectedPackage = await resolvePackageForTrainer(packageId, trainer.id);
    const languageCode = detectLanguage(req, language);
    const defaultMetricDefinitions = buildDefaultMetricDefinitions(languageCode);
    const parsedStartDate = parseDateField(startDate, 'startDate');
    const parsedIsOnline = parseBooleanField(isOnline);

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email, passwordHash, role: 'CLIENT' } });
      const client = await tx.client.create({
        data: {
          userId: user.id,
          trainerId: trainer.id,
          name,
          phone: String(phone).trim(),
          heightCm: parseNumberField(heightCm, 'heightCm', { required: true }),
          age: age ? parseIntegerField(age, 'age') : null,
          initialWeight: parseNumberField(initialWeight, 'initialWeight', { required: true }),
          waistCircumferenceCm: parseNumberField(waistCircumferenceCm, 'waistCircumferenceCm', { required: true }),
          birthDate: parseDateField(birthDate, 'birthDate', { required: true }),
          address: String(address).trim(),
          startDate: parsedStartDate || new Date(),
          goal: goal || null,
          gymExperience: gymExperience || null,
          motivation: motivation || null,
          activityAndWork: activityAndWork || null,
          trainingAvailability: trainingAvailability || null,
          nutritionHabits: nutritionHabits || null,
          healthIssues: healthIssues || null,
          trainingPlanNotes: trainingPlanNotes || null,
          trainingFrequency: parseIntegerField(trainingFrequency, 'trainingFrequency', { required: true }),
          packageId: selectedPackage?.id || null,
          monthlyPrice: selectedPackage ? selectedPackage.monthlyPrice : (monthlyPrice ? parseNumberField(monthlyPrice, 'monthlyPrice') : 0),
          notes: trainingPlanNotes || notes || null,
          isOnline: parsedIsOnline === undefined ? false : parsedIsOnline,
        },
      });

      await tx.metricDefinition.createMany({
        data: defaultMetricDefinitions.map((metricDefinition) => ({
          clientId: client.id,
          ...metricDefinition,
        })),
      });

      return { user, client };
    });

    res.status(201).json(result.client);
  } catch (err) { next(err); }
};

// POST /api/clients/extract-intake-ai
export const extractIntakeWithAi = async (req, res, next) => {
  try {
    await getTrainerOrThrow(req.userId);

    const intakeFile = getIntakeFile(req);
    if (!intakeFile) throw new AppError('Ficheiro não enviado.', 400);

    const intakeFileKind = getIntakeFileKind(intakeFile);
    if (intakeFileKind === 'unsupported') {
      throw new AppError('Formato inválido. Envie PDF ou imagem.', 400);
    }

    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) throw new AppError('ANTHROPIC_API_KEY não configurada no backend.', 500);

    const preferredModel = process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-latest';
    const parsed = await parseIntakeWithClaude({
      apiKey: anthropicApiKey,
      preferredModel,
      file: intakeFile,
    });

    const fields = sanitizeExtractedFields(parsed?.fields);
    const recognizedCount = Object.values(fields).filter((value) => value !== null && value !== undefined && value !== '').length;

    res.json({ fields, recognizedCount });
  } catch (err) { next(err); }
};

// PUT /api/clients/:id
export const updateClient = async (req, res, next) => {
  try {
    const trainer = await getTrainerOrThrow(req.userId);
    await findClientForTrainer(req.params.id, trainer.id);
    const {
      name,
      phone,
      heightCm,
      age,
      initialWeight,
      waistCircumferenceCm,
      birthDate,
      address,
      startDate,
      goal,
      gymExperience,
      motivation,
      activityAndWork,
      trainingAvailability,
      nutritionHabits,
      healthIssues,
      trainingPlanNotes,
      trainingFrequency,
      monthlyPrice,
      packageId,
      notes,
      avatarUrl,
      isOnline,
    } = req.body;

    const parsedIsOnline = parseBooleanField(isOnline);

    const selectedPackage = packageId === undefined
      ? undefined
      : await resolvePackageForTrainer(packageId, trainer.id);
    const parsedStartDate = startDate === undefined
      ? undefined
      : (parseDateField(startDate, 'startDate') || new Date());

    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(phone !== undefined && { phone: phone === null ? null : String(phone).trim() }),
        ...(heightCm !== undefined && { heightCm: parseNumberField(heightCm, 'heightCm') }),
        ...(age !== undefined && { age: parseIntegerField(age, 'age') }),
        ...(initialWeight !== undefined && { initialWeight: parseNumberField(initialWeight, 'initialWeight') }),
        ...(waistCircumferenceCm !== undefined && { waistCircumferenceCm: parseNumberField(waistCircumferenceCm, 'waistCircumferenceCm') }),
        ...(birthDate !== undefined && { birthDate: parseDateField(birthDate, 'birthDate') }),
        ...(address !== undefined && { address }),
        ...(parsedStartDate !== undefined && { startDate: parsedStartDate }),
        ...(goal !== undefined && { goal }),
        ...(gymExperience !== undefined && { gymExperience }),
        ...(motivation !== undefined && { motivation }),
        ...(activityAndWork !== undefined && { activityAndWork }),
        ...(trainingAvailability !== undefined && { trainingAvailability }),
        ...(nutritionHabits !== undefined && { nutritionHabits }),
        ...(healthIssues !== undefined && { healthIssues }),
        ...(trainingPlanNotes !== undefined && { trainingPlanNotes }),
        ...(trainingFrequency !== undefined && { trainingFrequency: parseIntegerField(trainingFrequency, 'trainingFrequency') }),
        ...(selectedPackage !== undefined && { packageId: selectedPackage?.id || null }),
        ...(selectedPackage !== undefined
          ? { monthlyPrice: selectedPackage ? selectedPackage.monthlyPrice : (monthlyPrice === null || monthlyPrice === '' ? 0 : parseNumberField(monthlyPrice || 0, 'monthlyPrice')) }
          : {}),
        ...(selectedPackage === undefined && monthlyPrice !== undefined && { monthlyPrice: monthlyPrice === null || monthlyPrice === '' ? 0 : parseNumberField(monthlyPrice, 'monthlyPrice') }),
        ...(notes !== undefined && { notes }),
        ...(trainingPlanNotes !== undefined && notes === undefined && { notes: trainingPlanNotes }),
        ...(avatarUrl && { avatarUrl }),
        ...(parsedIsOnline !== undefined && { isOnline: parsedIsOnline }),
      },
    });
    res.json(client);
  } catch (err) { next(err); }
};

// POST /api/clients/online-links
export const createOnlineClientLink = async (req, res, next) => {
  try {
    const trainer = await getTrainerOrThrow(req.userId);
    const { expiresInHours } = req.body || {};

    const token = createOnlineClientLinkToken();
    const expiresAt = resolveOnlineClientLinkExpiry(expiresInHours).toISOString();
    const nowIso = new Date().toISOString();

    const created = await prisma.$transaction(async (tx) => {
      const existingLinks = await tx.onlineClientLink.findMany({ where: { trainerId: trainer.id } });
      const activeLinks = existingLinks.filter((link) => !isOnlineClientLinkUnavailable(link));

      for (const activeLink of activeLinks) {
        await tx.onlineClientLink.update({
          where: { id: activeLink.id },
          data: { expiresAt: nowIso },
        });
      }

      return tx.onlineClientLink.create({
        data: {
          trainerId: trainer.id,
          token,
          expiresAt,
        },
      });
    });

    res.status(201).json(serializeOnlineClientLink(created, token));
  } catch (err) { next(err); }
};

// GET /api/clients/:id/feedback
export const listClientFeedback = async (req, res, next) => {
  try {
    const trainer = await getTrainerOrThrow(req.userId);
    const client = await findClientForTrainer(req.params.id, trainer.id);

    const feedbackEntries = await prisma.clientFeedback.findMany({
      where: { clientId: client.id },
      orderBy: { submittedAt: 'desc' },
    });

    res.json(feedbackEntries);
  } catch (err) { next(err); }
};

// GET /api/clients/:id/feedback-links
export const listClientFeedbackLinks = async (req, res, next) => {
  try {
    const trainer = await getTrainerOrThrow(req.userId);
    const client = await findClientForTrainer(req.params.id, trainer.id);

    const links = await prisma.feedbackLink.findMany({
      where: { clientId: client.id },
      orderBy: { createdAt: 'desc' },
    });

    const activeLinks = links
      .filter((link) => !isFeedbackLinkUnavailable(link))
      .map((link) => serializeFeedbackLink(link));

    res.json(activeLinks);
  } catch (err) { next(err); }
};

// POST /api/clients/:id/feedback-links
export const createClientFeedbackLink = async (req, res, next) => {
  try {
    const trainer = await getTrainerOrThrow(req.userId);
    const client = await findClientForTrainer(req.params.id, trainer.id);
    const { expiresInHours } = req.body || {};

    const token = createFeedbackLinkToken();
    const expiresAt = resolveFeedbackLinkExpiry(expiresInHours).toISOString();
    const nowIso = new Date().toISOString();

    const created = await prisma.$transaction(async (tx) => {
      const existingLinks = await tx.feedbackLink.findMany({ where: { clientId: client.id } });
      const activeLinks = existingLinks.filter((link) => !isFeedbackLinkUnavailable(link));

      for (const activeLink of activeLinks) {
        await tx.feedbackLink.update({
          where: { id: activeLink.id },
          data: { expiresAt: nowIso },
        });
      }

      return tx.feedbackLink.create({
        data: {
          clientId: client.id,
          token,
          expiresAt,
        },
      });
    });

    res.status(201).json(serializeFeedbackLink(created, token));
  } catch (err) { next(err); }
};

// GET /api/clients/public/online-links/:token
export const getPublicOnlineClientLink = async (req, res, next) => {
  try {
    const { link } = await getPublicOnlineClientLinkOrThrow(req.params.token);
    res.json({ link: serializeOnlineClientLink(link) });
  } catch (err) { next(err); }
};

// POST /api/clients/public/online-links/:token/submit
export const submitPublicOnlineClientLink = async (req, res, next) => {
  try {
    const { link, trainer } = await getPublicOnlineClientLinkOrThrow(req.params.token);
    const {
      fullName,
      birthDate,
      questionnaireDate,
      heightCm,
      weightKg,
      email,
      gymExperience,
      previousTraining,
      trainingMethod,
      mainGoal,
      motivationReason,
      realisticFrequency,
      sessionLength,
      preferredStyle,
      nutritionHabits,
      healthProblems,
      recentSurgeries,
    } = req.body || {};

    const normalizedFullName = String(fullName || '').trim();
    const normalizedEmail = sanitizeEmail(email);

    if (!normalizedFullName) throw new AppError('Campo obrigatório: fullName.', 400);
    if (!normalizedEmail) throw new AppError('Campo obrigatório: email.', 400);

    const parsedBirthDate = parseDateField(birthDate, 'birthDate', { required: true });
    const parsedQuestionnaireDate = parseDateField(questionnaireDate, 'questionnaireDate');
    const parsedHeightCm = parseNumberField(heightCm, 'heightCm', { required: true });
    const parsedWeightKg = parseNumberField(weightKg, 'weightKg', { required: true });

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) throw new AppError('Email já em uso.', 409);

    const trainingAvailability = [String(realisticFrequency || '').trim(), String(sessionLength || '').trim()]
      .filter(Boolean)
      .join(' | ') || null;

    const trainingPlanNotes = buildOnlineClientTrainingNotes(previousTraining, trainingMethod, preferredStyle);
    const combinedHealthIssues = buildOnlineClientHealthIssues(healthProblems, recentSurgeries);
    const normalizedGymExperience = String(gymExperience || '').trim() || null;
    const normalizedGoal = String(mainGoal || '').trim() || null;
    const normalizedMotivation = String(motivationReason || '').trim() || null;
    const normalizedNutritionHabits = String(nutritionHabits || '').trim() || null;

    const snapshotNotes = buildOnlineClientSnapshotNotes({
      fullName: normalizedFullName,
      birthDate,
      questionnaireDate,
      heightCm,
      weightKg,
      email: normalizedEmail,
      gymExperience,
      previousTraining,
      trainingMethod,
      mainGoal,
      motivationReason,
      realisticFrequency,
      sessionLength,
      preferredStyle,
      nutritionHabits,
      healthProblems,
      recentSurgeries,
    });

    const passwordHash = await bcrypt.hash(randomBytes(12).toString('hex'), 12);

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          role: 'CLIENT',
        },
      });

      const languageCode = 'de';
      const defaultMetricDefinitions = buildDefaultMetricDefinitions(languageCode);
      const client = await tx.client.create({
        data: {
          userId: user.id,
          trainerId: trainer.id,
          name: normalizedFullName,
          phone: null,
          heightCm: parsedHeightCm,
          age: calculateAgeFromBirthDate(parsedBirthDate),
          initialWeight: parsedWeightKg,
          waistCircumferenceCm: null,
          birthDate: parsedBirthDate,
          address: null,
          startDate: parsedQuestionnaireDate || new Date(),
          goal: normalizedGoal,
          gymExperience: normalizedGymExperience,
          motivation: normalizedMotivation,
          activityAndWork: null,
          trainingAvailability,
          nutritionHabits: normalizedNutritionHabits,
          healthIssues: combinedHealthIssues,
          trainingPlanNotes,
          trainingFrequency: parseTrainingFrequencyFromText(realisticFrequency),
          packageId: null,
          monthlyPrice: 0,
          notes: snapshotNotes || null,
          isOnline: true,
        },
      });

      await tx.metricDefinition.createMany({
        data: defaultMetricDefinitions.map((metricDefinition) => ({
          clientId: client.id,
          ...metricDefinition,
        })),
      });

      await tx.onlineClientLink.update({
        where: { id: link.id },
        data: {
          usedAt: new Date().toISOString(),
          submittedClientId: client.id,
        },
      });

      return client;
    });

    res.status(201).json({
      message: 'Cliente online criado com sucesso.',
      clientId: created.id,
    });
  } catch (err) { next(err); }
};

// GET /api/clients/public/feedback-links/:token
export const getPublicFeedbackLink = async (req, res, next) => {
  try {
    const { link, client } = await getPublicFeedbackLinkOrThrow(req.params.token);
    res.json({
      link: serializeFeedbackLink(link),
      client: {
        id: client.id,
        name: client.name,
      },
    });
  } catch (err) { next(err); }
};

// POST /api/clients/public/feedback-links/:token/submit
export const submitPublicFeedbackLink = async (req, res, next) => {
  try {
    const { link, client } = await getPublicFeedbackLinkOrThrow(req.params.token);
    const {
      language,
      trainingDuration,
      progressSinceStart,
      specificImprovements,
      biggestChange,
      supportFeeling,
      coachCanImprove,
      wouldRecommend,
      allowInstagramUse,
      mainDecisionReason,
    } = req.body || {};

    const normalizedLanguage = SUPPORTED_LANGUAGES.has(String(language || '').toLowerCase())
      ? String(language).toLowerCase()
      : detectLanguage(req);

    const normalizedTrainingDuration = String(trainingDuration || '').trim();
    const normalizedProgressSinceStart = String(progressSinceStart || '').trim();
    const normalizedSpecificImprovements = String(specificImprovements || '').trim() || null;
    const normalizedBiggestChange = String(biggestChange || '').trim() || null;
    const normalizedSupportFeeling = String(supportFeeling || '').trim();
    const normalizedCoachCanImprove = String(coachCanImprove || '').trim() || null;
    const normalizedWouldRecommend = String(wouldRecommend || '').trim();
    const normalizedMainDecisionReason = String(mainDecisionReason || '').trim() || null;

    if (!normalizedTrainingDuration) throw new AppError('Campo obrigatório: trainingDuration.', 400);
    if (!normalizedProgressSinceStart) throw new AppError('Campo obrigatório: progressSinceStart.', 400);
    if (!normalizedSupportFeeling) throw new AppError('Campo obrigatório: supportFeeling.', 400);
    if (!normalizedWouldRecommend) throw new AppError('Campo obrigatório: wouldRecommend.', 400);

    if (allowInstagramUse !== true && allowInstagramUse !== false) {
      throw new AppError('Campo obrigatório: allowInstagramUse.', 400);
    }

    const created = await prisma.$transaction(async (tx) => {
      const feedback = await tx.clientFeedback.create({
        data: {
          clientId: client.id,
          language: normalizedLanguage,
          trainingDuration: normalizedTrainingDuration,
          progressSinceStart: normalizedProgressSinceStart,
          specificImprovements: normalizedSpecificImprovements,
          biggestChange: normalizedBiggestChange,
          supportFeeling: normalizedSupportFeeling,
          coachCanImprove: normalizedCoachCanImprove,
          wouldRecommend: normalizedWouldRecommend,
          allowInstagramUse,
          mainDecisionReason: normalizedMainDecisionReason,
        },
      });

      await tx.feedbackLink.update({
        where: { id: link.id },
        data: {
          usedAt: new Date().toISOString(),
          submittedFeedbackId: feedback.id,
        },
      });

      return feedback;
    });

    res.status(201).json({
      message: 'Feedback enviado com sucesso.',
      feedbackId: created.id,
    });
  } catch (err) { next(err); }
};

// DELETE /api/clients/:id
export const deleteClient = async (req, res, next) => {
  try {
    const trainer = await getTrainerOrThrow(req.userId);
    const client = await findClientForTrainer(req.params.id, trainer.id);
    await prisma.user.delete({ where: { id: client.userId } });
    res.json({ message: 'Cliente removido com sucesso.' });
  } catch (err) { next(err); }
};

// GET /api/clients/:id/dashboard
export const getClientDashboard = async (req, res, next) => {
  try {
    const trainer = await getTrainerOrThrow(req.userId);
    const client = await findClientForTrainer(req.params.id, trainer.id);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const now = new Date();

    const [entries, photos, currentPayment] = await Promise.all([
      prisma.metricEntry.findMany({
        where: { clientId: client.id, recordedAt: { gte: thirtyDaysAgo } },
        include: { metricDefinition: true },
        orderBy: { recordedAt: 'asc' },
      }),
      prisma.progressPhoto.findMany({
        where: { clientId: client.id },
        orderBy: { takenAt: 'desc' },
        take: 6,
      }),
      prisma.payment.findUnique({
        where: { clientId_month_year: { clientId: client.id, month: now.getMonth() + 1, year: now.getFullYear() } },
      }),
    ]);

    res.json({ client, entries, photos, currentPayment });
  } catch (err) { next(err); }
};

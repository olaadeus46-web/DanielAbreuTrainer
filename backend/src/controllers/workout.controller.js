import { prisma } from '../config/database.js';
import { AppError } from '../utils/AppError.js';
import JSON5 from 'json5';
import * as pdfParseModule from 'pdf-parse';

const pdfParse = pdfParseModule.default ?? pdfParseModule;

function getClaudeTextFromResponse(data) {
  return (data?.content || [])
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim();
}

async function assertTrainerOwnsClient(userId, clientId) {
  const trainer = await prisma.trainer.findUnique({ where: { userId } });
  if (!trainer) throw new AppError('Não autorizado.', 403);
  const client = await prisma.client.findFirst({ where: { id: clientId, trainerId: trainer.id } });
  if (!client) throw new AppError('Cliente não encontrado.', 404);
}

async function assertAccess(userId, role, clientId) {
  if (role === 'TRAINER') {
    await assertTrainerOwnsClient(userId, clientId);
  } else {
    const client = await prisma.client.findFirst({ where: { id: clientId, user: { id: userId } } });
    if (!client) throw new AppError('Não autorizado.', 403);
  }
}

function normalizeExercise(raw = {}) {
  return {
    name: String(raw.name || '').trim(),
    sets: raw.sets !== undefined && raw.sets !== null && raw.sets !== '' ? parseInt(raw.sets, 10) : null,
    reps: raw.reps !== undefined && raw.reps !== null && raw.reps !== '' ? String(raw.reps) : null,
    load: raw.load !== undefined && raw.load !== null && raw.load !== '' ? String(raw.load) : null,
    restSeconds: raw.restSeconds !== undefined && raw.restSeconds !== null && raw.restSeconds !== '' ? parseInt(raw.restSeconds, 10) : null,
    notes: raw.notes !== undefined && raw.notes !== null && raw.notes !== '' ? String(raw.notes) : null,
    videoUrl: raw.videoUrl !== undefined && raw.videoUrl !== null && raw.videoUrl !== '' ? String(raw.videoUrl) : null,
  };
}

function normalizeGeneratedDays(days = []) {
  const ordered = new Array(7).fill(null).map((_, dayOfWeek) => ({ dayOfWeek, label: null, exercises: [] }));

  for (const rawDay of Array.isArray(days) ? days : []) {
    const idx = Number(rawDay?.dayOfWeek);
    if (!Number.isInteger(idx) || idx < 0 || idx > 6) continue;

    const normalizedExercises = Array.isArray(rawDay?.exercises)
      ? rawDay.exercises.map((ex) => normalizeExercise(ex)).filter((ex) => ex.name)
      : [];

    ordered[idx] = {
      dayOfWeek: idx,
      label: rawDay?.label ? String(rawDay.label) : null,
      exercises: normalizedExercises,
    };
  }

  return ordered;
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

async function callClaudeWithFallback({ apiKey, prompt, preferredModel }) {
  const fallbackModels = [
    preferredModel,
    'claude-3-5-sonnet-latest',
    'claude-3-7-sonnet-latest',
    'claude-3-haiku-20240307',
  ].filter(Boolean).filter((model, index, all) => all.indexOf(model) === index);

  let lastErrorMessage = '';

  const transientStatuses = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);

  for (const model of fallbackModels) {
    const maxAttempts = 3;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 2500,
          temperature: 0,
          messages: [{ role: 'user', content: prompt }],
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
      if (isAuthError) {
        throw new AppError('Falha de autenticação com Claude API. Verifique a ANTHROPIC_API_KEY.', 502);
      }

      const isTransient = transientStatuses.has(response.status)
        || lowerMessage.includes('overloaded')
        || errorType.includes('overloaded')
        || lowerMessage.includes('temporarily unavailable');

      if (isTransient && attempt < maxAttempts - 1) {
        const backoffMs = 700 * (2 ** attempt) + Math.floor(Math.random() * 300);
        await delay(backoffMs);
        continue;
      }

      const isRateLimit = response.status === 429 || errorType.includes('rate_limit');
      if (isRateLimit) {
        throw new AppError('Claude API temporariamente indisponível por limite de taxa. Tente novamente em instantes.', 502);
      }

      const looksLikeModelIssue =
        response.status === 404
        || lowerMessage.includes('not_found_error')
        || lowerMessage.includes('model')
        || lowerMessage.includes('unsupported')
        || lowerMessage.includes('unavailable')
        || lowerMessage.includes('does not exist');

      if (looksLikeModelIssue) break;

      if (response.status === 529 || lowerMessage.includes('overloaded')) {
        throw new AppError('Claude está sobrecarregada no momento. Tente novamente em alguns segundos.', 502);
      }

      throw new AppError(`Erro da Claude API (${response.status}). ${errorMessage.slice(0, 220)}`, 502);
    }
  }

  throw new AppError(
    `Nenhum modelo Claude disponível para a chave configurada. Detalhe: ${lastErrorMessage.slice(0, 220)}`,
    502,
  );
}

function getWorkoutFileKind(file) {
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

function sanitizeWorkoutImportFields(rawFields = {}) {
  const source = rawFields && typeof rawFields === 'object' ? rawFields : {};
  const stringField = (name) => {
    const value = source[name];
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    return text || null;
  };

  const personalSource = source.personalData && typeof source.personalData === 'object' ? source.personalData : {};
  const personalString = (name) => {
    const value = personalSource[name];
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    return text || null;
  };

  const workoutRows = Array.isArray(source.workoutRows)
    ? source.workoutRows
      .map((row) => ({
        block: row?.block !== undefined && row?.block !== null ? String(row.block).trim() : null,
        exercise: row?.exercise !== undefined && row?.exercise !== null ? String(row.exercise).trim() : null,
        sets: row?.sets !== undefined && row?.sets !== null ? String(row.sets).trim() : null,
        reps: row?.reps !== undefined && row?.reps !== null ? String(row.reps).trim() : null,
        load: row?.load !== undefined && row?.load !== null ? String(row.load).trim() : null,
      }))
      .filter((row) => row.exercise)
    : [];

  return {
    name: stringField('name'),
    planCode: stringField('planCode'),
    planDate: parseDateLoose(source.planDate),
    goalUntilNextAppointment: stringField('goalUntilNextAppointment'),
    priorities: stringField('priorities'),
    warmup: stringField('warmup'),
    trainingTitle: stringField('trainingTitle'),
    executionNotes: stringField('executionNotes'),
    nutritionNotes: stringField('nutritionNotes'),
    closingMessage: stringField('closingMessage'),
    personalData: {
      name: personalString('name'),
      birthDate: parseDateLoose(personalSource.birthDate),
      height: personalString('height'),
      weight: personalString('weight'),
      waist: personalString('waist'),
    },
    workoutRows,
  };
}

function countRecognizedWorkoutFields(fields) {
  const topLevelKeys = [
    'name',
    'planCode',
    'planDate',
    'goalUntilNextAppointment',
    'priorities',
    'warmup',
    'trainingTitle',
    'executionNotes',
    'nutritionNotes',
    'closingMessage',
  ];
  const personalKeys = ['name', 'birthDate', 'height', 'weight', 'waist'];

  const topLevelCount = topLevelKeys.filter((key) => fields[key]).length;
  const personalCount = personalKeys.filter((key) => fields.personalData?.[key]).length;
  const rowsCount = Array.isArray(fields.workoutRows) ? fields.workoutRows.length : 0;

  return topLevelCount + personalCount + rowsCount;
}

async function callClaudeWithContentFallback({ apiKey, preferredModel, content }) {
  const fallbackModels = [
    preferredModel,
    'claude-3-5-sonnet-latest',
    'claude-3-7-sonnet-latest',
    'claude-3-haiku-20240307',
  ].filter(Boolean).filter((model, index, all) => all.indexOf(model) === index);

  let lastErrorMessage = '';
  const transientStatuses = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);

  for (const model of fallbackModels) {
    const maxAttempts = 3;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 2500,
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
      if (isAuthError) {
        throw new AppError('Falha de autenticação com Claude API. Verifique a ANTHROPIC_API_KEY.', 502);
      }

      const isTransient = transientStatuses.has(response.status)
        || lowerMessage.includes('overloaded')
        || errorType.includes('overloaded')
        || lowerMessage.includes('temporarily unavailable');

      if (isTransient && attempt < maxAttempts - 1) {
        const backoffMs = 700 * (2 ** attempt) + Math.floor(Math.random() * 300);
        await delay(backoffMs);
        continue;
      }

      const isRateLimit = response.status === 429 || errorType.includes('rate_limit');
      if (isRateLimit) {
        throw new AppError('Claude API temporariamente indisponível por limite de taxa. Tente novamente em instantes.', 502);
      }

      const looksLikeModelIssue =
        response.status === 404
        || lowerMessage.includes('not_found_error')
        || lowerMessage.includes('model')
        || lowerMessage.includes('unsupported')
        || lowerMessage.includes('unavailable')
        || lowerMessage.includes('does not exist');

      if (looksLikeModelIssue) break;

      if (response.status === 529 || lowerMessage.includes('overloaded')) {
        throw new AppError('Claude está sobrecarregada no momento. Tente novamente em alguns segundos.', 502);
      }

      throw new AppError(`Erro da Claude API (${response.status}). ${errorMessage.slice(0, 220)}`, 502);
    }
  }

  throw new AppError(
    `Nenhum modelo Claude disponível para a chave configurada. Detalhe: ${lastErrorMessage.slice(0, 220)}`,
    502,
  );
}

async function repairWorkoutImportJsonWithClaude({ apiKey, preferredModel, rawText }) {
  const repairPrompt = [
    'Converta o conteúdo abaixo em JSON ESTRITO e devolva apenas JSON válido.',
    'Use exatamente esta estrutura:',
    '{',
    '  "fields": {',
    '    "name": null,',
    '    "planCode": null,',
    '    "planDate": null,',
    '    "goalUntilNextAppointment": null,',
    '    "priorities": null,',
    '    "warmup": null,',
    '    "trainingTitle": null,',
    '    "executionNotes": null,',
    '    "nutritionNotes": null,',
    '    "closingMessage": null,',
    '    "personalData": {',
    '      "name": null,',
    '      "birthDate": null,',
    '      "height": null,',
    '      "weight": null,',
    '      "waist": null',
    '    },',
    '    "workoutRows": [',
    '      { "block": null, "exercise": null, "sets": null, "reps": null, "load": null }',
    '    ]',
    '  }',
    '}',
    'Regras:',
    '- Devolva apenas JSON, sem markdown e sem explicações.',
    '- Mantenha workoutRows como array.',
    '- planDate e personalData.birthDate devem ser YYYY-MM-DD quando claras.',
    '',
    'Conteúdo a corrigir:',
    rawText,
  ].join('\n');

  const repaired = await callClaudeWithFallback({
    apiKey,
    prompt: repairPrompt,
    preferredModel,
  });

  return extractJsonObject(getClaudeTextFromResponse(repaired));
}

async function parseWorkoutImportWithClaude({ apiKey, preferredModel, file }) {
  const templatePrompt = [
    'Extract workout plan data from the provided document and return ONLY valid JSON.',
    'The output JSON must follow exactly this shape:',
    '{',
    '  "fields": {',
    '    "name": null,',
    '    "planCode": null,',
    '    "planDate": null,',
    '    "goalUntilNextAppointment": null,',
    '    "priorities": null,',
    '    "warmup": null,',
    '    "trainingTitle": null,',
    '    "executionNotes": null,',
    '    "nutritionNotes": null,',
    '    "closingMessage": null,',
    '    "personalData": {',
    '      "name": null,',
    '      "birthDate": null,',
    '      "height": null,',
    '      "weight": null,',
    '      "waist": null',
    '    },',
    '    "workoutRows": [',
    '      {',
    '        "block": null,',
    '        "exercise": null,',
    '        "sets": null,',
    '        "reps": null,',
    '        "load": null',
    '      }',
    '    ]',
    '  }',
    '}',
    'Rules:',
    '- Keep unknown fields as null.',
    '- Preserve the original training language when reasonable.',
    '- workoutRows should list the exercises in the order they appear.',
    '- Use the block field for section headers like cardio blocks when present.',
    '- Accept documents in German, Portuguese, or English.',
    '- Return only JSON, no markdown and no comments.',
  ].join('\n');

  if (getWorkoutFileKind(file) === 'pdf') {
    const parsedPdf = await pdfParse(file.buffer);
    const text = String(parsedPdf?.text || '').trim();
    if (!text) throw new AppError('Não foi possível extrair texto do PDF enviado.', 400);

    const response = await callClaudeWithFallback({
      apiKey,
      preferredModel,
      prompt: `${templatePrompt}\n\nDocument text:\n${text.slice(0, 30000)}`,
    });

    return extractJsonObject(getClaudeTextFromResponse(response));
  }

  const mediaType = getClaudeImageMediaType(file);
  if (!mediaType) {
    throw new AppError('Formato de imagem não suportado. Use PNG, JPG, WEBP ou GIF.', 400);
  }

  const response = await callClaudeWithContentFallback({
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

async function replaceWorkoutPlanForClient(clientId, rawPlan) {
  const normalizedDays = normalizeGeneratedDays(rawPlan?.days || []);

  await prisma.workoutPlan.deleteMany({ where: { clientId } });

  return prisma.workoutPlan.create({
    data: {
      clientId,
      name: rawPlan?.name ? String(rawPlan.name) : 'Plano de Treino',
      notes: rawPlan?.notes ? String(rawPlan.notes) : null,
      days: {
        create: normalizedDays.map((day, i) => ({
          dayOfWeek: day.dayOfWeek,
          label: day.label,
          order: i,
          exercises: {
            create: day.exercises.map((ex, j) => ({
              name: ex.name,
              sets: Number.isInteger(ex.sets) ? ex.sets : null,
              reps: ex.reps,
              load: ex.load,
              restSeconds: Number.isInteger(ex.restSeconds) ? ex.restSeconds : null,
              notes: ex.notes,
              videoUrl: ex.videoUrl,
              order: j,
            })),
          },
        })),
      },
    },
    include: {
      days: {
        orderBy: { order: 'asc' },
        include: { exercises: { orderBy: { order: 'asc' } } },
      },
    },
  });
}

// GET /api/workouts/:clientId
export const getWorkoutPlan = async (req, res, next) => {
  try {
    await assertAccess(req.userId, req.userRole, req.params.clientId);
    const plan = await prisma.workoutPlan.findUnique({
      where: { clientId: req.params.clientId },
      include: {
        days: {
          orderBy: { order: 'asc' },
          include: { exercises: { orderBy: { order: 'asc' } } },
        },
      },
    });
    res.json(plan || null);
  } catch (err) { next(err); }
};

// POST /api/workouts  (cria ou substitui o plano)
export const upsertWorkoutPlan = async (req, res, next) => {
  try {
    const { clientId, name, notes, days } = req.body;
    await assertTrainerOwnsClient(req.userId, clientId);

    const plan = await replaceWorkoutPlanForClient(clientId, {
      name: name || 'Plano de Treino',
      notes: notes || null,
      days: days || [],
    });
    res.status(201).json(plan);
  } catch (err) { next(err); }
};

// POST /api/workouts/extract-ai
export const extractWorkoutPlanWithAi = async (req, res, next) => {
  try {
    const { clientId } = req.body || {};
    if (!clientId) throw new AppError('clientId é obrigatório.', 400);
    if (!req.file) throw new AppError('Envia um PDF ou imagem para preencher o plano.', 400);

    await assertTrainerOwnsClient(req.userId, clientId);

    const fileKind = getWorkoutFileKind(req.file);
    if (fileKind === 'unsupported') {
      throw new AppError('Formato não suportado. Usa PDF, PNG, JPG, WEBP ou GIF.', 400);
    }

    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) throw new AppError('ANTHROPIC_API_KEY não configurada no backend.', 500);

    const preferredModel = process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-latest';

    let parsed;
    try {
      parsed = await parseWorkoutImportWithClaude({
        apiKey: anthropicApiKey,
        preferredModel,
        file: req.file,
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw error;
    }

    let extractedFields;
    try {
      extractedFields = sanitizeWorkoutImportFields(parsed?.fields || {});
    } catch {
      const repaired = await repairWorkoutImportJsonWithClaude({
        apiKey: anthropicApiKey,
        preferredModel,
        rawText: JSON.stringify(parsed),
      });
      extractedFields = sanitizeWorkoutImportFields(repaired?.fields || {});
    }

    res.json({
      fields: extractedFields,
      recognizedCount: countRecognizedWorkoutFields(extractedFields),
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/workouts/duplicate
export const duplicateWorkoutPlan = async (req, res, next) => {
  try {
    const { sourceClientId, targetClientId } = req.body;
    if (!sourceClientId || !targetClientId) {
      throw new AppError('sourceClientId e targetClientId são obrigatórios.', 400);
    }

    await assertTrainerOwnsClient(req.userId, sourceClientId);
    await assertTrainerOwnsClient(req.userId, targetClientId);

    const sourcePlan = await prisma.workoutPlan.findUnique({
      where: { clientId: sourceClientId },
      include: {
        days: {
          orderBy: { order: 'asc' },
          include: { exercises: { orderBy: { order: 'asc' } } },
        },
      },
    });

    if (!sourcePlan) throw new AppError('Plano de origem não encontrado.', 404);

    await prisma.workoutPlan.deleteMany({ where: { clientId: targetClientId } });

    const duplicated = await prisma.workoutPlan.create({
      data: {
        clientId: targetClientId,
        name: sourcePlan.name,
        notes: sourcePlan.notes,
        days: {
          create: sourcePlan.days.map((day, i) => ({
            dayOfWeek: day.dayOfWeek,
            label: day.label,
            order: i,
            exercises: {
              create: day.exercises.map((ex, j) => ({
                name: ex.name,
                sets: ex.sets,
                reps: ex.reps,
                load: ex.load,
                restSeconds: ex.restSeconds,
                notes: ex.notes,
                videoUrl: ex.videoUrl,
                order: j,
              })),
            },
          })),
        },
      },
      include: {
        days: {
          orderBy: { order: 'asc' },
          include: { exercises: { orderBy: { order: 'asc' } } },
        },
      },
    });

    res.status(201).json(duplicated);
  } catch (err) { next(err); }
};

import { randomBytes } from 'node:crypto';
import { prisma } from '../config/database.js';
import { AppError } from '../utils/AppError.js';
import * as pdfParseModule from 'pdf-parse';
import JSON5 from 'json5';

const pdfParse = pdfParseModule.default ?? pdfParseModule;

const DEFAULT_CHECKIN_LINK_TTL_HOURS = 72;

function parseBooleanValue(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') return value.toLowerCase() === 'true' || value === '1';
  return null;
}

function createCheckInLinkToken() {
  return randomBytes(24).toString('hex');
}

function resolveCheckInLinkExpiry(hoursInput) {
  const parsed = Number.parseInt(hoursInput ?? `${DEFAULT_CHECKIN_LINK_TTL_HOURS}`, 10);
  const safeHours = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CHECKIN_LINK_TTL_HOURS;
  return new Date(Date.now() + (safeHours * 60 * 60 * 1000));
}

function buildPublicCheckInUrl(token) {
  const origin = String(process.env.PUBLIC_APP_URL || process.env.CORS_ORIGIN || 'https://danieltrainer.com').replace(/\/$/, '');
  return `${origin}/check-in/${token}`;
}

function isLinkUnavailable(link) {
  if (!link) return true;
  if (link.usedAt) return true;
  return new Date(link.expiresAt).getTime() <= Date.now();
}

function serializeCheckInLink(link, token = null) {
  const resolvedToken = token || link.token || null;
  return {
    id: link.id,
    clientId: link.clientId,
    expiresAt: link.expiresAt,
    usedAt: link.usedAt,
    createdAt: link.createdAt,
    submittedCheckInId: link.submittedCheckInId || null,
    publicUrl: resolvedToken ? buildPublicCheckInUrl(resolvedToken) : null,
  };
}

function normalizeMetricType(raw) {
  const type = String(raw || '').toUpperCase().trim();
  if (['NUMBER', 'TEXT', 'BOOLEAN', 'SCALE', 'TIME'].includes(type)) return type;
  return 'NUMBER';
}

function normalizeDateKey(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function getClaudeTextFromResponse(data) {
  return (data?.content || [])
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim();
}

function extractJsonFromClaudeResponse(data) {
  const text = getClaudeTextFromResponse(data);

  if (!text) throw new AppError('Claude não retornou conteúdo para processar.', 502);

  const candidates = [];
  const fencedJsonBlocks = [...text.matchAll(/```json\s*([\s\S]*?)```/gi)].map((m) => m[1]?.trim()).filter(Boolean);
  const fencedAnyBlocks = [...text.matchAll(/```\s*([\s\S]*?)```/g)].map((m) => m[1]?.trim()).filter(Boolean);

  candidates.push(...fencedJsonBlocks);
  candidates.push(...fencedAnyBlocks);
  candidates.push(text);

  // Also try extracting the largest object-like JSON slice from each candidate.
  const expandedCandidates = [];
  for (const candidate of candidates) {
    expandedCandidates.push(candidate);
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      expandedCandidates.push(candidate.slice(start, end + 1));
    }
  }

  for (const raw of expandedCandidates) {
    const cleaned = raw
      .replace(/^[\uFEFF\u200B\u200C\u200D]+/, '')
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/,\s*([}\]])/g, '$1')
      .trim();

    if (!cleaned) continue;
    try {
      const parsed = JSON.parse(cleaned);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      try {
        const parsed = JSON5.parse(cleaned);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch {
        // Try next candidate.
      }
    }
  }

  throw new AppError('Não foi possível interpretar o JSON retornado pela Claude.', 502);
}

function parseLineBasedSheetOutput(rawText) {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('```'));

  const metricMap = new Map();
  const rowMap = new Map();

  for (const line of lines) {
    const parts = line.includes('\t')
      ? line.split('\t')
      : line.includes('|')
        ? line.split('|')
        : [];

    if (parts.length < 2) continue;

    const kind = String(parts[0] || '').trim().toUpperCase();
    if (kind === 'METRIC') {
      const name = String(parts[1] || '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      metricMap.set(key, {
        name,
        type: normalizeMetricType(parts[2]),
        unit: parts[3] ? String(parts[3]).trim() || null : null,
      });
      continue;
    }

    if (kind === 'ROW') {
      const date = normalizeDateKey(parts[1]);
      const metricName = String(parts[2] || '').trim();
      const valueRaw = parts.slice(3).join(parts.includes('\t') ? '\t' : '|').trim();
      if (!date || !metricName || valueRaw === '') continue;

      const row = rowMap.get(date) || { date, values: {} };
      row.values[metricName] = valueRaw;
      rowMap.set(date, row);

      const metricKey = metricName.toLowerCase();
      if (!metricMap.has(metricKey)) {
        metricMap.set(metricKey, {
          name: metricName,
          type: 'NUMBER',
          unit: null,
        });
      }
    }
  }

  return {
    metrics: Array.from(metricMap.values()),
    rows: Array.from(rowMap.values()).sort((a, b) => new Date(a.date) - new Date(b.date)),
  };
}

function buildValueForType(type, rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return { valueNumber: null, valueText: null, valueBoolean: null };
  }

  if (type === 'BOOLEAN') {
    return { valueNumber: null, valueText: null, valueBoolean: parseBooleanValue(rawValue) };
  }

  if (type === 'NUMBER' || type === 'SCALE') {
    const parsed = parseFloat(String(rawValue).replace(',', '.'));
    return {
      valueNumber: Number.isNaN(parsed) ? null : parsed,
      valueText: null,
      valueBoolean: null,
    };
  }

  return {
    valueNumber: null,
    valueText: String(rawValue),
    valueBoolean: null,
  };
}

function chunkPageTexts(pages, maxChars = 12000) {
  const chunks = [];
  let current = [];
  let currentSize = 0;

  for (const page of pages) {
    const pageText = String(page?.text || '').trim();
    if (!pageText) continue;

    const pageBlock = `\n\n[PAGE ${page.num}]\n${pageText}`;
    if (currentSize + pageBlock.length > maxChars && current.length > 0) {
      chunks.push(current.join('\n\n'));
      current = [pageBlock];
      currentSize = pageBlock.length;
      continue;
    }

    current.push(pageBlock);
    currentSize += pageBlock.length;
  }

  if (current.length > 0) chunks.push(current.join('\n\n'));
  return chunks;
}

function getUploadedSheetFile(req) {
  if (req.file?.buffer) return req.file;

  const sheetFile = req.files?.sheetFile?.[0];
  if (sheetFile?.buffer) return sheetFile;

  const legacySheetPdf = req.files?.sheetPdf?.[0];
  if (legacySheetPdf?.buffer) return legacySheetPdf;

  return null;
}

function getSheetFileKind(file) {
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

function mergeParsedSheetResults(results) {
  const metricMap = new Map();
  const rowMap = new Map();

  for (const result of results) {
    const metrics = Array.isArray(result?.metrics) ? result.metrics : [];
    const rows = Array.isArray(result?.rows) ? result.rows : [];

    for (const metric of metrics) {
      const name = String(metric?.name || '').trim();
      if (!name) continue;
      const key = name.toLowerCase();

      const existing = metricMap.get(key);
      if (!existing) {
        metricMap.set(key, {
          name,
          type: normalizeMetricType(metric?.type),
          unit: metric?.unit ? String(metric.unit).trim() : null,
        });
        continue;
      }

      if ((!existing.unit || existing.unit === '') && metric?.unit) {
        existing.unit = String(metric.unit).trim();
      }
    }

    for (const row of rows) {
      const dateKey = normalizeDateKey(row?.date);
      if (!dateKey) continue;
      const values = row?.values && typeof row.values === 'object' ? row.values : {};

      const existing = rowMap.get(dateKey) || { date: dateKey, values: {} };
      existing.values = { ...existing.values, ...values };
      rowMap.set(dateKey, existing);
    }
  }

  return {
    metrics: Array.from(metricMap.values()),
    rows: Array.from(rowMap.values()).sort((a, b) => new Date(a.date) - new Date(b.date)),
  };
}

async function parseSheetChunkWithClaude({ apiKey, preferredModel, chunkText }) {
  const prompt = [
    'You are a parser for fitness metric sheets in PDF text.',
    'Extract only tabular metric data and ignore narrative text.',
    'Return ONLY valid JSON with this exact shape:',
    '{',
    '  "metrics": [{ "name": "Peso", "type": "NUMBER", "unit": "kg" }],',
    '  "rows": [',
    '    { "date": "2026-03-30", "values": { "Peso": 80.2, "Sono": 7 } }',
    '  ]',
    '}',
    'Rules:',
    '- date must be YYYY-MM-DD.',
    '- metric type must be NUMBER, TEXT, BOOLEAN, SCALE, or TIME.',
    '- Keep metric names concise and consistent.',
    '- Return only rows found in this chunk.',
    '- No markdown and no extra keys.',
    '',
    'PDF chunk text:',
    chunkText,
  ].join('\n');

  const response = await callClaudeWithFallback({
    apiKey,
    prompt,
    preferredModel,
  });

  try {
    return extractJsonFromClaudeResponse(response);
  } catch {
    try {
      return repairJsonWithClaude({
        apiKey,
        preferredModel,
        rawText: getClaudeTextFromResponse(response),
      });
    } catch {
      const linePrompt = [
        'Extract fitness sheet data from this PDF text chunk.',
        'Return ONLY plain text lines (no markdown) in one of these formats:',
        'METRIC\t<name>\t<type>\t<unit>',
        'ROW\t<YYYY-MM-DD>\t<metricName>\t<value>',
        'Rules:',
        '- type must be NUMBER|TEXT|BOOLEAN|SCALE|TIME.',
        '- one row value per line (ROW).',
        '- no commentary, no extra text.',
        '',
        'Chunk text:',
        chunkText,
      ].join('\n');

      const lineResponse = await callClaudeWithFallback({
        apiKey,
        prompt: linePrompt,
        preferredModel,
      });

      const lineText = getClaudeTextFromResponse(lineResponse);
      const parsedLines = parseLineBasedSheetOutput(lineText);
      if (!parsedLines.metrics.length || !parsedLines.rows.length) {
        throw new AppError('Não foi possível extrair dados estruturados do chunk do PDF.', 502);
      }
      return parsedLines;
    }
  }
}

async function parseSheetImageWithClaude({ apiKey, preferredModel, imageBuffer, imageMediaType }) {
  const prompt = [
    'You are a parser for fitness metric sheets from an image.',
    'Extract only tabular metric data and ignore decorative content.',
    'Return ONLY valid JSON with this exact shape:',
    '{',
    '  "metrics": [{ "name": "Peso", "type": "NUMBER", "unit": "kg" }],',
    '  "rows": [',
    '    { "date": "2026-03-30", "values": { "Peso": 80.2, "Sono": 7 } }',
    '  ]',
    '}',
    'Rules:',
    '- date must be YYYY-MM-DD.',
    '- metric type must be NUMBER, TEXT, BOOLEAN, SCALE, or TIME.',
    '- Keep metric names concise and consistent.',
    '- No markdown and no extra keys.',
    '- If you cannot detect any valid sheet values, return {"metrics":[],"rows":[]}.',
  ].join('\n');

  const imageBase64 = imageBuffer.toString('base64');

  const response = await callClaudeWithFallback({
    apiKey,
    preferredModel,
    content: [
      { type: 'text', text: prompt },
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: imageMediaType,
          data: imageBase64,
        },
      },
    ],
  });

  try {
    return extractJsonFromClaudeResponse(response);
  } catch {
    return repairJsonWithClaude({
      apiKey,
      preferredModel,
      rawText: getClaudeTextFromResponse(response),
    });
  }
}

async function callClaudeWithFallback({ apiKey, prompt, preferredModel, content }) {
  const fallbackModels = [
    preferredModel,
    'claude-3-5-sonnet-latest',
    'claude-3-7-sonnet-latest',
    'claude-3-haiku-20240307',
  ].filter(Boolean);

  let lastErrorText = '';

  for (const model of fallbackModels) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1800,
        temperature: 0,
        messages: [{ role: 'user', content: content || prompt }],
      }),
    });

    if (response.ok) {
      const data = await response.json();
      return data;
    }

    const errorText = await response.text();
    lastErrorText = errorText;
    const isNotFound = errorText.includes('not_found_error') || errorText.includes('model:');
    if (!isNotFound) {
      throw new AppError(`Erro da Claude API: ${errorText.slice(0, 300)}`, 502);
    }
  }

  throw new AppError(`Erro da Claude API: ${lastErrorText.slice(0, 300)}`, 502);
}

async function repairJsonWithClaude({ apiKey, preferredModel, rawText }) {
  const repairPrompt = [
    'Convert the following content into STRICT JSON only.',
    'Output only valid JSON with exactly this shape:',
    '{',
    '  "metrics": [{ "name": "Peso", "type": "NUMBER", "unit": "kg" }],',
    '  "rows": [',
    '    { "date": "2026-03-30", "values": { "Peso": 80.2, "Sono": 7 } }',
    '  ]',
    '}',
    'Rules:',
    '- No markdown, no comments, no prose.',
    '- type must be NUMBER|TEXT|BOOLEAN|SCALE|TIME.',
    '- date must be YYYY-MM-DD.',
    '- Keep metric names as they appear.',
    '',
    'Content to fix:',
    rawText,
  ].join('\n');

  const repaired = await callClaudeWithFallback({
    apiKey,
    prompt: repairPrompt,
    preferredModel,
  });

  return extractJsonFromClaudeResponse(repaired);
}

async function assertTrainerOwnsClient(userId, clientId) {
  const trainer = await prisma.trainer.findUnique({ where: { userId } });
  if (!trainer) throw new AppError('Não autorizado.', 403);
  const client = await prisma.client.findFirst({ where: { id: clientId, trainerId: trainer.id } });
  if (!client) throw new AppError('Cliente não encontrado.', 404);
  return { trainer, client };
}

function mapDefinitionCoreData(source, order) {
  return {
    name: source.name,
    type: source.type || 'NUMBER',
    frequency: source.frequency || 'DAILY',
    unit: source.unit || null,
    minValue: source.minValue ?? null,
    maxValue: source.maxValue ?? null,
    targetMin: source.targetMin ?? null,
    targetMax: source.targetMax ?? null,
    isRequired: source.isRequired ?? false,
    order: order ?? source.order ?? 0,
  };
}

function mapClientDefinitionData(source, order) {
  return {
    ...mapDefinitionCoreData(source, order),
    isActive: true,
  };
}

async function upsertMetricDefinitionsForClient(tx, { clientId, definitions }) {
  const existingDefinitions = await tx.metricDefinition.findMany({
    where: { clientId },
  });
  const existingByName = new Map(
    existingDefinitions.map((definition) => [String(definition.name || '').trim().toLowerCase(), definition]),
  );

  let created = 0;
  let updated = 0;

  for (const [index, definition] of definitions.entries()) {
    const normalizedName = String(definition.name || '').trim();
    if (!normalizedName) continue;

    const data = {
      clientId,
      ...mapClientDefinitionData({ ...definition, name: normalizedName }, index),
    };
    const existing = existingByName.get(normalizedName.toLowerCase());

    if (existing) {
      await tx.metricDefinition.update({
        where: { id: existing.id },
        data: mapClientDefinitionData({ ...definition, name: normalizedName }, index),
      });
      updated += 1;
    } else {
      await tx.metricDefinition.create({ data });
      created += 1;
    }
  }

  return { created, updated };
}

async function getTrainerPresetOrThrow(userId, presetId) {
  const trainer = await prisma.trainer.findUnique({ where: { userId } });
  if (!trainer) throw new AppError('Não autorizado.', 403);

  const preset = await prisma.metricPreset.findFirst({
    where: { id: presetId, trainerId: trainer.id },
    include: { items: { orderBy: { order: 'asc' } } },
  });

  if (!preset) throw new AppError('Predefinição não encontrada.', 404);
  return { trainer, preset };
}

async function assertAccessToClient(userId, role, clientId) {
  if (role === 'TRAINER') {
    await assertTrainerOwnsClient(userId, clientId);
  } else {
    const client = await prisma.client.findFirst({ where: { id: clientId, user: { id: userId } } });
    if (!client) throw new AppError('Não autorizado.', 403);
  }
}

async function createCheckInWithEntries(tx, {
  clientId,
  frequency,
  periodLabel,
  coachQuestions,
  clientResponses,
  clientComment,
  recordedAt,
  entries,
  submittedByRole,
}) {
  const normalizedEntries = Array.isArray(entries) ? entries : [];
  const definitionIds = normalizedEntries.map((entry) => entry.metricDefinitionId).filter(Boolean);
  const definitions = await tx.metricDefinition.findMany({
    where: { clientId, id: { in: definitionIds }, isActive: true },
    select: { id: true, type: true },
  });

  if (definitions.length !== definitionIds.length) {
    throw new AppError('Uma ou mais métricas são inválidas para este cliente.', 400);
  }

  const definitionById = Object.fromEntries(definitions.map((definition) => [definition.id, definition]));
  const checkInRecordedAt = recordedAt ? new Date(recordedAt) : new Date();

  const checkIn = await tx.checkIn.create({
    data: {
      clientId,
      frequency: frequency || 'DAILY',
      periodLabel: periodLabel || null,
      coachQuestions: coachQuestions ?? null,
      clientResponses: clientResponses ?? null,
      clientComment: clientComment || null,
      submittedByRole,
      submittedAt: checkInRecordedAt,
    },
  });

  const createdEntries = await Promise.all(normalizedEntries.map((entry) => {
    const def = definitionById[entry.metricDefinitionId];
    if (!def) throw new AppError('Definição de métrica inválida.', 400);

    const data = {
      clientId,
      checkInId: checkIn.id,
      metricDefinitionId: entry.metricDefinitionId,
      recordedAt: checkInRecordedAt,
      valueNumber: null,
      valueText: null,
      valueBoolean: null,
    };

    if (def.type === 'NUMBER' || def.type === 'SCALE') {
      data.valueNumber = entry.valueNumber !== undefined && entry.valueNumber !== '' ? parseFloat(entry.valueNumber) : null;
    }
    if (def.type === 'TEXT' || def.type === 'TIME') {
      data.valueText = entry.valueText ? String(entry.valueText) : null;
    }
    if (def.type === 'BOOLEAN') {
      data.valueBoolean = parseBooleanValue(entry.valueBoolean);
    }

    return tx.metricEntry.create({ data });
  }));

  return { checkIn, entries: createdEntries };
}

async function getPublicCheckInLinkOrThrow(rawToken) {
  const link = await prisma.checkInLink.findFirst({ where: { token: rawToken } });
  if (!link) throw new AppError('Link de check-in inválido.', 404);
  if (isLinkUnavailable(link)) throw new AppError('Link de check-in expirado.', 410);

  const client = await prisma.client.findUnique({
    where: { id: link.clientId },
    select: { id: true, name: true },
  });
  if (!client) throw new AppError('Cliente não encontrado.', 404);

  return { link, client };
}

// GET /api/metrics/definitions?clientId=xxx
export const listDefinitions = async (req, res, next) => {
  try {
    await assertAccessToClient(req.userId, req.userRole, req.query.clientId);
    const definitions = await prisma.metricDefinition.findMany({
      where: { clientId: req.query.clientId, isActive: true },
      orderBy: { order: 'asc' },
    });
    res.json(definitions);
  } catch (err) { next(err); }
};

// POST /api/metrics/definitions
export const createDefinition = async (req, res, next) => {
  try {
    const { clientId, name, type, frequency, unit, minValue, maxValue, targetMin, targetMax, isRequired, order } = req.body;
    await assertTrainerOwnsClient(req.userId, clientId);
    const definition = await prisma.metricDefinition.create({
      data: {
        clientId, name,
        type: type || 'NUMBER',
        frequency: frequency || 'DAILY',
        unit: unit || null,
        minValue: minValue ? parseFloat(minValue) : null,
        maxValue: maxValue ? parseFloat(maxValue) : null,
        targetMin: targetMin !== undefined && targetMin !== '' ? parseFloat(targetMin) : null,
        targetMax: targetMax !== undefined && targetMax !== '' ? parseFloat(targetMax) : null,
        isRequired: isRequired ?? false,
        order: order ?? 0,
      },
    });
    res.status(201).json(definition);
  } catch (err) { next(err); }
};

// PUT /api/metrics/definitions/:id
export const updateDefinition = async (req, res, next) => {
  try {
    const def = await prisma.metricDefinition.findUnique({ where: { id: req.params.id } });
    if (!def) throw new AppError('Métrica não encontrada.', 404);
    await assertTrainerOwnsClient(req.userId, def.clientId);
    const { name, type, unit, frequency, minValue, maxValue, targetMin, targetMax, isRequired, order, isActive } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (type !== undefined) data.type = type;
    if (unit !== undefined) data.unit = unit || null;
    if (frequency !== undefined) data.frequency = frequency;
    if (minValue !== undefined) data.minValue = minValue !== '' && minValue !== null ? parseFloat(minValue) : null;
    if (maxValue !== undefined) data.maxValue = maxValue !== '' && maxValue !== null ? parseFloat(maxValue) : null;
    if (targetMin !== undefined) data.targetMin = targetMin !== '' && targetMin !== null ? parseFloat(targetMin) : null;
    if (targetMax !== undefined) data.targetMax = targetMax !== '' && targetMax !== null ? parseFloat(targetMax) : null;
    if (isRequired !== undefined) data.isRequired = isRequired;
    if (order !== undefined) data.order = order;
    if (isActive !== undefined) data.isActive = isActive;
    const updated = await prisma.metricDefinition.update({ where: { id: req.params.id }, data });
    res.json(updated);
  } catch (err) { next(err); }
};

// DELETE /api/metrics/definitions/:id  (soft delete)
export const deleteDefinition = async (req, res, next) => {
  try {
    const def = await prisma.metricDefinition.findUnique({ where: { id: req.params.id } });
    if (!def) throw new AppError('Métrica não encontrada.', 404);
    await assertTrainerOwnsClient(req.userId, def.clientId);
    await prisma.metricDefinition.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ message: 'Métrica desativada.' });
  } catch (err) { next(err); }
};

// POST /api/metrics/definitions/copy-from-client
export const copyDefinitionsFromClient = async (req, res, next) => {
  try {
    const { sourceClientId, targetClientId } = req.body;
    if (!sourceClientId || !targetClientId) throw new AppError('sourceClientId e targetClientId são obrigatórios.', 400);

    const { trainer } = await assertTrainerOwnsClient(req.userId, sourceClientId);
    await assertTrainerOwnsClient(req.userId, targetClientId);

    const sourceDefinitions = await prisma.metricDefinition.findMany({
      where: { clientId: sourceClientId, isActive: true },
      orderBy: { order: 'asc' },
    });

    if (!sourceDefinitions.length) throw new AppError('O cliente de origem não tem métricas ativas para copiar.', 400);

    const result = await prisma.$transaction((tx) => upsertMetricDefinitionsForClient(tx, {
      clientId: targetClientId,
      definitions: sourceDefinitions,
    }));

    res.json({
      message: 'Métricas copiadas com sucesso.',
      trainerId: trainer.id,
      ...result,
    });
  } catch (err) { next(err); }
};

// GET /api/metrics/presets
export const listMetricPresets = async (req, res, next) => {
  try {
    const trainer = await prisma.trainer.findUnique({ where: { userId: req.userId } });
    if (!trainer) throw new AppError('Não autorizado.', 403);

    const presets = await prisma.metricPreset.findMany({
      where: { trainerId: trainer.id },
      include: {
        _count: { select: { items: true } },
      },
      orderBy: [
        { updatedAt: 'desc' },
        { name: 'asc' },
      ],
    });

    res.json(presets);
  } catch (err) { next(err); }
};

// POST /api/metrics/presets
export const saveMetricPreset = async (req, res, next) => {
  try {
    const { clientId, name } = req.body;
    if (!clientId || !name?.trim()) throw new AppError('clientId e name são obrigatórios.', 400);

    const { trainer } = await assertTrainerOwnsClient(req.userId, clientId);
    const definitions = await prisma.metricDefinition.findMany({
      where: { clientId, isActive: true },
      orderBy: { order: 'asc' },
    });

    if (!definitions.length) throw new AppError('Não há métricas ativas para guardar como predefinição.', 400);

    const preset = await prisma.$transaction(async (tx) => {
      const savedPreset = await tx.metricPreset.upsert({
        where: {
          trainerId_name: {
            trainerId: trainer.id,
            name: name.trim(),
          },
        },
        create: {
          trainerId: trainer.id,
          name: name.trim(),
        },
        update: {
          name: name.trim(),
        },
      });

      await tx.metricPresetItem.deleteMany({ where: { presetId: savedPreset.id } });
      await tx.metricPresetItem.createMany({
        data: definitions.map((definition, index) => ({
          presetId: savedPreset.id,
          ...mapDefinitionCoreData(definition, index),
        })),
      });

      return tx.metricPreset.findUnique({
        where: { id: savedPreset.id },
        include: { _count: { select: { items: true } } },
      });
    });

    res.status(201).json(preset);
  } catch (err) { next(err); }
};

// POST /api/metrics/presets/:id/apply
export const applyMetricPreset = async (req, res, next) => {
  try {
    const { clientId } = req.body;
    if (!clientId) throw new AppError('clientId é obrigatório.', 400);

    await assertTrainerOwnsClient(req.userId, clientId);
    const { preset } = await getTrainerPresetOrThrow(req.userId, req.params.id);

    if (!preset.items.length) throw new AppError('A predefinição não tem métricas para aplicar.', 400);

    const result = await prisma.$transaction((tx) => upsertMetricDefinitionsForClient(tx, {
      clientId,
      definitions: preset.items,
    }));

    res.json({
      message: 'Predefinição aplicada com sucesso.',
      presetId: preset.id,
      presetName: preset.name,
      ...result,
    });
  } catch (err) { next(err); }
};

// GET /api/metrics/entries?clientId=xxx&from=date&to=date
export const listEntries = async (req, res, next) => {
  try {
    const { clientId, from, to, metricDefinitionId } = req.query;
    await assertAccessToClient(req.userId, req.userRole, clientId);
    const entries = await prisma.metricEntry.findMany({
      where: {
        clientId,
        ...(metricDefinitionId && { metricDefinitionId }),
        ...((from || to) && {
          recordedAt: {
            ...(from && { gte: new Date(from) }),
            ...(to && { lte: new Date(to) }),
          },
        }),
      },
      include: {
          metricDefinition: { select: { name: true, type: true, unit: true, frequency: true } },
      },
      orderBy: { recordedAt: 'asc' },
    });
    res.json(entries);
  } catch (err) { next(err); }
};

// GET /api/metrics/checkins?clientId=xxx
export const listCheckIns = async (req, res, next) => {
  try {
    const { clientId } = req.query;
    if (!clientId) throw new AppError('clientId é obrigatório.', 400);

    await assertAccessToClient(req.userId, req.userRole, clientId);

    const checkIns = await prisma.checkIn.findMany({
      where: { clientId },
      orderBy: { submittedAt: 'desc' },
    });

    const checkInIds = checkIns.map((checkIn) => checkIn.id);
    const entries = checkInIds.length > 0
      ? await prisma.metricEntry.findMany({
        where: {
          clientId,
          checkInId: { in: checkInIds },
        },
        include: {
          metricDefinition: { select: { name: true, type: true, unit: true, frequency: true } },
        },
        orderBy: { recordedAt: 'asc' },
      })
      : [];

    const entriesByCheckInId = entries.reduce((acc, entry) => {
      const key = entry.checkInId;
      if (!acc[key]) acc[key] = [];
      acc[key].push(entry);
      return acc;
    }, {});

    res.json(checkIns.map((checkIn) => ({
      ...checkIn,
      values: entriesByCheckInId[checkIn.id] || [],
    })));
  } catch (err) { next(err); }
};

// GET /api/metrics/checkin-links?clientId=xxx
export const listCheckInLinks = async (req, res, next) => {
  try {
    const { clientId } = req.query;
    if (!clientId) throw new AppError('clientId é obrigatório.', 400);

    await assertAccessToClient(req.userId, req.userRole, clientId);

    const links = await prisma.checkInLink.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
    });

    const activeLinks = links
      .filter((link) => !isLinkUnavailable(link))
      .map((link) => serializeCheckInLink(link));

    res.json(activeLinks);
  } catch (err) { next(err); }
};

// POST /api/metrics/checkin-links
export const createCheckInLink = async (req, res, next) => {
  try {
    const { clientId, expiresInHours } = req.body;
    if (!clientId) throw new AppError('clientId é obrigatório.', 400);

    await assertTrainerOwnsClient(req.userId, clientId);

    const token = createCheckInLinkToken();
    const expiresAt = resolveCheckInLinkExpiry(expiresInHours).toISOString();
    const nowIso = new Date().toISOString();

    const created = await prisma.$transaction(async (tx) => {
      const existingLinks = await tx.checkInLink.findMany({ where: { clientId } });
      const activeLinks = existingLinks.filter((link) => !isLinkUnavailable(link));

      for (const activeLink of activeLinks) {
        await tx.checkInLink.update({
          where: { id: activeLink.id },
          data: { expiresAt: nowIso },
        });
      }

      return tx.checkInLink.create({
        data: {
          clientId,
          token,
          expiresAt,
        },
      });
    });

    res.status(201).json(serializeCheckInLink(created, token));
  } catch (err) { next(err); }
};

// GET /api/metrics/public/checkin-links/:token
export const getPublicCheckInLink = async (req, res, next) => {
  try {
    const { link, client } = await getPublicCheckInLinkOrThrow(req.params.token);
    res.json({
      link: serializeCheckInLink(link),
      client: {
        id: client.id,
        name: client.name,
      },
    });
  } catch (err) { next(err); }
};

// POST /api/metrics/public/checkin-links/:token/submit
export const submitPublicCheckInLink = async (req, res, next) => {
  try {
    const { link, client } = await getPublicCheckInLinkOrThrow(req.params.token);
    const {
      frequency,
      periodLabel,
      coachQuestions,
      clientResponses,
      clientComment,
      recordedAt,
      entries,
    } = req.body;

    const normalizedEntries = Array.isArray(entries) ? entries : [];
    const hasNarrativeContent = [coachQuestions, clientResponses, clientComment].some((value) => {
      if (value === null || value === undefined) return false;
      if (typeof value === 'string') return value.trim() !== '';
      if (typeof value === 'object') return Object.keys(value).length > 0;
      return true;
    });

    if (!hasNarrativeContent && normalizedEntries.length === 0) {
      throw new AppError('Preenche pelo menos uma resposta no check-in.', 400);
    }

    const created = await prisma.$transaction(async (tx) => {
      const result = await createCheckInWithEntries(tx, {
        clientId: client.id,
        frequency,
        periodLabel,
        coachQuestions,
        clientResponses,
        clientComment,
        recordedAt,
        entries: normalizedEntries,
        submittedByRole: 'CLIENT',
      });

      await tx.checkInLink.update({
        where: { id: link.id },
        data: {
          usedAt: new Date().toISOString(),
          submittedCheckInId: result.checkIn.id,
        },
      });

      return result;
    });

    res.status(201).json({
      ...created,
      message: 'Check-in submetido com sucesso.',
    });
  } catch (err) { next(err); }
};

// POST /api/metrics/entries
export const createEntry = async (req, res, next) => {
  try {
    const { clientId, metricDefinitionId, valueNumber, valueText, valueBoolean, recordedAt } = req.body;
    await assertAccessToClient(req.userId, req.userRole, clientId);
    const def = await prisma.metricDefinition.findFirst({ where: { id: metricDefinitionId, clientId } });
    if (!def) throw new AppError('Definição de métrica inválida.', 400);
    const entry = await prisma.metricEntry.create({
      data: {
        clientId, metricDefinitionId,
        valueNumber: valueNumber !== undefined ? parseFloat(valueNumber) : null,
        valueText: valueText || null,
        valueBoolean: parseBooleanValue(valueBoolean),
        recordedAt: recordedAt ? new Date(recordedAt) : new Date(),
      },
    });
    res.status(201).json(entry);
  } catch (err) { next(err); }
};

// PUT /api/metrics/entries/:id
export const updateEntry = async (req, res, next) => {
  try {
    const existing = await prisma.metricEntry.findUnique({
      where: { id: req.params.id },
      include: { metricDefinition: { select: { id: true, type: true } } },
    });

    if (!existing) throw new AppError('Entrada de métrica não encontrada.', 404);
    await assertAccessToClient(req.userId, req.userRole, existing.clientId);

    const { valueNumber, valueText, valueBoolean, recordedAt } = req.body;
    const type = existing.metricDefinition.type;

    const data = {
      recordedAt: recordedAt ? new Date(recordedAt) : existing.recordedAt,
      valueNumber: null,
      valueText: null,
      valueBoolean: null,
    };

    if (type === 'NUMBER' || type === 'SCALE') {
      data.valueNumber = valueNumber !== undefined && valueNumber !== '' ? parseFloat(valueNumber) : null;
    }
    if (type === 'TEXT' || type === 'TIME') {
      data.valueText = valueText !== undefined && valueText !== null && valueText !== '' ? String(valueText) : null;
    }
    if (type === 'BOOLEAN') {
      data.valueBoolean = parseBooleanValue(valueBoolean);
    }

    const updated = await prisma.metricEntry.update({ where: { id: req.params.id }, data });
    res.json(updated);
  } catch (err) { next(err); }
};

// POST /api/metrics/entries/bulk-upsert
export const bulkUpsertEntries = async (req, res, next) => {
  try {
    const { clientId, operations } = req.body;
    if (!clientId) throw new AppError('clientId é obrigatório.', 400);
    if (!Array.isArray(operations) || operations.length === 0) {
      throw new AppError('operations deve ser um array com pelo menos uma entrada.', 400);
    }
    if (operations.length > 500) {
      throw new AppError('Máximo de 500 operações por pedido.', 400);
    }

    await assertAccessToClient(req.userId, req.userRole, clientId);

    const definitionIds = Array.from(new Set(operations.map((op) => op.metricDefinitionId).filter(Boolean)));
    const definitions = await prisma.metricDefinition.findMany({
      where: { clientId, id: { in: definitionIds }, isActive: true },
      select: { id: true, type: true },
    });

    if (definitions.length !== definitionIds.length) {
      throw new AppError('Uma ou mais definições de métrica são inválidas.', 400);
    }

    const definitionById = Object.fromEntries(definitions.map((definition) => [definition.id, definition]));
    const entryIds = operations.map((op) => op.entryId).filter(Boolean);

    const existingEntries = entryIds.length
      ? await prisma.metricEntry.findMany({
        where: { id: { in: entryIds }, clientId },
        select: { id: true, clientId: true, metricDefinitionId: true },
      })
      : [];

    const existingById = Object.fromEntries(existingEntries.map((entry) => [entry.id, entry]));

    const result = await prisma.$transaction(async (tx) => {
      const writes = [];

      for (const op of operations) {
        const definition = definitionById[op.metricDefinitionId];
        if (!definition) throw new AppError('Definição de métrica inválida.', 400);

        const data = {
          metricDefinitionId: op.metricDefinitionId,
          recordedAt: op.recordedAt ? new Date(op.recordedAt) : new Date(),
          valueNumber: null,
          valueText: null,
          valueBoolean: null,
        };

        if (definition.type === 'NUMBER' || definition.type === 'SCALE') {
          data.valueNumber = op.valueNumber !== undefined && op.valueNumber !== '' ? parseFloat(op.valueNumber) : null;
        }
        if (definition.type === 'TEXT' || definition.type === 'TIME') {
          data.valueText = op.valueText !== undefined && op.valueText !== null && op.valueText !== '' ? String(op.valueText) : null;
        }
        if (definition.type === 'BOOLEAN') {
          data.valueBoolean = parseBooleanValue(op.valueBoolean);
        }

        if (op.entryId) {
          const existing = existingById[op.entryId];
          if (!existing) throw new AppError('Uma das entradas a atualizar não existe.', 404);
          writes.push(tx.metricEntry.update({ where: { id: op.entryId }, data }));
        } else {
          writes.push(tx.metricEntry.create({ data: { ...data, clientId } }));
        }
      }

      return Promise.all(writes);
    });

    res.json({ count: result.length, entries: result });
  } catch (err) { next(err); }
};

// POST /api/metrics/checkins
export const createStructuredCheckIn = async (req, res, next) => {
  try {
    const {
      clientId,
      frequency,
      periodLabel,
      coachQuestions,
      clientResponses,
      clientComment,
      recordedAt,
      entries,
    } = req.body;

    if (!clientId) throw new AppError('clientId é obrigatório.', 400);
    const normalizedEntries = Array.isArray(entries) ? entries : [];
    const hasNarrativeContent = [coachQuestions, clientResponses, clientComment].some((value) => {
      if (value === null || value === undefined) return false;
      if (typeof value === 'string') return value.trim() !== '';
      if (typeof value === 'object') return Object.keys(value).length > 0;
      return true;
    });

    if (!hasNarrativeContent && normalizedEntries.length === 0) {
      throw new AppError('Preenche pelo menos uma resposta ou métrica no check-in.', 400);
    }

    await assertAccessToClient(req.userId, req.userRole, clientId);

    const created = await prisma.$transaction((tx) => createCheckInWithEntries(tx, {
      clientId,
      frequency,
      periodLabel,
      coachQuestions,
      clientResponses,
      clientComment,
      recordedAt,
      entries: normalizedEntries,
      submittedByRole: req.userRole,
    }));

    res.status(201).json(created);
  } catch (err) { next(err); }
};

// POST /api/metrics/import-pdf (TRAINER only)
export const importPdfSheet = async (req, res, next) => {
  try {
    const { clientId } = req.body;
    if (!clientId) throw new AppError('clientId é obrigatório.', 400);

    const uploadedFile = getUploadedSheetFile(req);
    if (!uploadedFile?.buffer) throw new AppError('Arquivo da sheet é obrigatório.', 400);

    const sheetFileKind = getSheetFileKind(uploadedFile);
    if (sheetFileKind === 'unsupported') {
      throw new AppError('Formato inválido. Envie PDF ou imagem (JPG, PNG, WEBP, GIF).', 400);
    }

    await assertTrainerOwnsClient(req.userId, clientId);

    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      throw new AppError('ANTHROPIC_API_KEY não configurada no backend.', 500);
    }

    const preferredModel = process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-latest';
    let parsed;

    if (sheetFileKind === 'pdf') {
      const pdfParser = new PDFParse({ data: uploadedFile.buffer });
      const pdfResult = await pdfParser.getText();
      await pdfParser.destroy();
      const pdfText = String(pdfResult?.text || '').trim();
      if (!pdfText) throw new AppError('Não foi possível extrair texto do PDF.', 400);

      const chunks = chunkPageTexts(pdfResult?.pages || []).length
        ? chunkPageTexts(pdfResult.pages)
        : [pdfText.slice(0, 12000)];

      const parsedChunks = [];
      for (const chunkText of chunks) {
        const parsedChunk = await parseSheetChunkWithClaude({
          apiKey: anthropicApiKey,
          preferredModel,
          chunkText,
        });
        parsedChunks.push(parsedChunk);
      }

      parsed = mergeParsedSheetResults(parsedChunks);
    } else {
      const imageMediaType = getClaudeImageMediaType(uploadedFile);
      if (!imageMediaType) {
        throw new AppError('Tipo de imagem não suportado. Use JPG, PNG, WEBP ou GIF.', 400);
      }

      parsed = await parseSheetImageWithClaude({
        apiKey: anthropicApiKey,
        preferredModel,
        imageBuffer: uploadedFile.buffer,
        imageMediaType,
      });
    }

    const parsedMetrics = Array.isArray(parsed.metrics) ? parsed.metrics : [];
    const parsedRows = Array.isArray(parsed.rows) ? parsed.rows : [];

    if (!parsedMetrics.length || !parsedRows.length) {
      throw new AppError('Não foi possível identificar métricas e linhas no arquivo enviado.', 400);
    }

    const existingDefinitions = await prisma.metricDefinition.findMany({
      where: { clientId, isActive: true },
      orderBy: { order: 'asc' },
    });

    const existingByName = new Map(existingDefinitions.map((d) => [d.name.trim().toLowerCase(), d]));
    let nextOrder = existingDefinitions.length;
    const createdDefinitions = [];

    for (const metric of parsedMetrics) {
      const metricName = String(metric?.name || '').trim();
      if (!metricName) continue;

      const key = metricName.toLowerCase();
      if (existingByName.has(key)) continue;

      const created = await prisma.metricDefinition.create({
        data: {
          clientId,
          name: metricName,
          type: normalizeMetricType(metric?.type),
          unit: metric?.unit ? String(metric.unit).trim() : null,
          frequency: 'DAILY',
          order: nextOrder++,
          isActive: true,
        },
      });

      existingByName.set(key, created);
      createdDefinitions.push(created);
    }

    const allDefinitions = await prisma.metricDefinition.findMany({
      where: { clientId, isActive: true },
      select: { id: true, name: true, type: true },
    });

    const definitionByName = new Map(allDefinitions.map((d) => [d.name.trim().toLowerCase(), d]));

    const normalizedRows = parsedRows
      .map((row) => ({
        dateKey: normalizeDateKey(row?.date),
        values: row?.values && typeof row.values === 'object' ? row.values : {},
      }))
      .filter((row) => row.dateKey);

    if (!normalizedRows.length) throw new AppError('Nenhuma linha válida de data foi encontrada.', 400);

    const allDateKeys = normalizedRows.map((row) => row.dateKey).sort();
    const minDate = new Date(`${allDateKeys[0]}T00:00:00.000Z`);
    const maxDate = new Date(`${allDateKeys[allDateKeys.length - 1]}T23:59:59.999Z`);

    const definitionIds = allDefinitions.map((d) => d.id);
    const existingEntries = await prisma.metricEntry.findMany({
      where: {
        clientId,
        metricDefinitionId: { in: definitionIds },
        recordedAt: { gte: minDate, lte: maxDate },
      },
      select: { id: true, metricDefinitionId: true, recordedAt: true },
    });

    const existingEntryByKey = new Map();
    for (const entry of existingEntries) {
      const key = `${entry.metricDefinitionId}|${normalizeDateKey(entry.recordedAt)}`;
      if (!existingEntryByKey.has(key)) existingEntryByKey.set(key, entry.id);
    }

    const operations = [];

    for (const row of normalizedRows) {
      const recordedAt = `${row.dateKey}T12:00:00.000Z`;
      for (const [metricNameRaw, rawValue] of Object.entries(row.values)) {
        const metricName = String(metricNameRaw || '').trim().toLowerCase();
        if (!metricName) continue;

        const definition = definitionByName.get(metricName);
        if (!definition) continue;

        const parsedValue = buildValueForType(definition.type, rawValue);
        const hasValue = parsedValue.valueNumber !== null || parsedValue.valueText !== null || parsedValue.valueBoolean !== null;
        if (!hasValue) continue;

        const lookupKey = `${definition.id}|${row.dateKey}`;
        operations.push({
          entryId: existingEntryByKey.get(lookupKey),
          metricDefinitionId: definition.id,
          recordedAt,
          valueNumber: parsedValue.valueNumber,
          valueText: parsedValue.valueText,
          valueBoolean: parsedValue.valueBoolean,
        });
      }
    }

    if (!operations.length) {
      return res.json({
        createdDefinitions: createdDefinitions.length,
        importedEntries: 0,
        message: 'Arquivo processado, mas não foi encontrado valor válido para importação.',
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const writes = operations.map((op) => {
        const data = {
          metricDefinitionId: op.metricDefinitionId,
          recordedAt: new Date(op.recordedAt),
          valueNumber: op.valueNumber,
          valueText: op.valueText,
          valueBoolean: op.valueBoolean,
        };
        if (op.entryId) return tx.metricEntry.update({ where: { id: op.entryId }, data });
        return tx.metricEntry.create({ data: { ...data, clientId } });
      });

      return Promise.all(writes);
    });

    res.json({
      createdDefinitions: createdDefinitions.length,
      importedEntries: updated.length,
      parsedRows: normalizedRows.length,
    });
  } catch (err) {
    next(err);
  }
};

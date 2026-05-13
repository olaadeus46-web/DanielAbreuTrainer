import { randomBytes } from 'node:crypto';
import '../config/env.js';
import twilio from 'twilio';
import { prisma } from '../config/database.js';
import { AppError } from '../utils/AppError.js';

// ── Twilio client (lazy, so missing creds don't crash startup) ──────────────
function getTwilioClient() {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new AppError('Twilio não configurado.', 503);
  return twilio(sid, token);
}

const TWILIO_FROM = process.env.TWILIO_PHONE || 'whatsapp:+14155238886';

// ── Link helpers (reuse same TTL logic as metric/client controllers) ─────────
const DEFAULT_LINK_TTL_HOURS = 168; // 7 days

function createToken() {
  return randomBytes(24).toString('hex');
}

function buildOrigin() {
  return String(process.env.PUBLIC_APP_URL || process.env.CORS_ORIGIN || 'https://danieltrainer.com').replace(/\/$/, '');
}

function buildCheckInUrl(token)  { return `${buildOrigin()}/check-in/${token}`; }
function buildFeedbackUrl(token) { return `${buildOrigin()}/feedback/${token}`; }

function isLinkStale(link) {
  if (!link) return true;
  if (link.usedAt) return true;
  return new Date(link.expiresAt).getTime() <= Date.now();
}

function expiresAt() {
  return new Date(Date.now() + DEFAULT_LINK_TTL_HOURS * 60 * 60 * 1000).toISOString();
}

// ── Message templates ───────────────────────────────────────────────────────
function buildDefaultMessageTemplate(type) {
  if (type === 'FEEDBACK') {
    return `🏋️‍♂️ *Daniel Abreu Personal Trainer*\n\nOlá {{name}}! 👋\n\nO Daniel gostaria de receber o teu *feedback*. A tua opinião é muito importante para continuarmos a evoluir juntos:\n\n👉 {{link}}\n\nObrigado! 🙏`;
  }

  if (type === 'MESSAGE_ONLY') {
    return `🏋️‍♂️ *Daniel Abreu Personal Trainer*\n\nOlá {{name}}! 👋\n\nComo estão a correr os treinos? Estou aqui se precisares de alguma coisa. 💬\n\nForça! 💪`;
  }

  return `🏋️‍♂️ *Daniel Abreu Personal Trainer*\n\nOlá {{name}}! 👋\n\nO Daniel preparou um novo *formulário de check-in* especialmente para ti. Preenche-o para acompanhares o teu progresso:\n\n👉 {{link}}\n\nForça! 💪`;
}

function renderMessageTemplate(template, clientName, linkUrl) {
  return String(template || '')
    .replaceAll('{{name}}', clientName)
    .replaceAll('{{link}}', linkUrl)
    .trim();
}

function getLinkDelegate(type) {
  return type === 'CHECK_IN' ? prisma.checkInLink : prisma.feedbackLink;
}

function getSubmittedField(type) {
  return type === 'CHECK_IN' ? 'submittedCheckInId' : 'submittedFeedbackId';
}

function extractTokenFromLinkUrl(linkUrl) {
  const normalized = String(linkUrl || '').trim();
  if (!normalized) return null;

  try {
    const parsed = new URL(normalized);
    const segments = parsed.pathname.split('/').filter(Boolean);
    return segments[segments.length - 1] || null;
  } catch {
    const segments = normalized.split('/').filter(Boolean);
    return segments[segments.length - 1] || null;
  }
}

async function getParentAutomationOrThrow(parentAutomationId, trainerId, type) {
  const parentAutomation = await prisma.automation.findFirst({ where: { id: parentAutomationId } });
  if (!parentAutomation) throw new AppError('Automação mãe não encontrada.', 404);
  if (parentAutomation.trainerId !== trainerId) throw new AppError('Sem permissão para usar esta automação mãe.', 403);
  if (parentAutomation.type !== type) throw new AppError('O follow-up tem de usar o mesmo tipo de formulário da automação mãe.', 400);
  if (!parentAutomation.sentAt) throw new AppError('A automação mãe ainda não foi enviada.', 400);
  return parentAutomation;
}

function buildSkippedResult(client, error) {
  return {
    clientId: client?.id || null,
    clientName: client?.name || 'Cliente',
    phone: client?.phone || null,
    status: 'skipped',
    error,
  };
}

async function getFollowUpEligibility(automation) {
  const clientIds = Array.isArray(automation.clientIds) ? automation.clientIds : [];
  if (!automation.parentAutomationId || !clientIds.length) {
    return { eligibleClientIds: clientIds, skippedByClientId: new Map() };
  }

  // MESSAGE_ONLY follow-ups have no form link to check — all clients are eligible
  if (automation.type === 'MESSAGE_ONLY') {
    return { eligibleClientIds: clientIds, skippedByClientId: new Map() };
  }

  const parentAutomation = await prisma.automation.findFirst({ where: { id: automation.parentAutomationId } });
  if (!parentAutomation) throw new AppError('Automação mãe não encontrada.', 404);
  if (parentAutomation.type !== automation.type) {
    throw new AppError('A automação de follow-up não corresponde ao tipo da automação mãe.', 400);
  }

  const submittedField = getSubmittedField(automation.type);
  const links = await getLinkDelegate(automation.type).findMany({
    where: {
      automationId: parentAutomation.id,
      clientId: { in: clientIds },
    },
    orderBy: [
      { createdAt: 'desc' },
    ],
  });

  const latestLinkByClientId = new Map();
  for (const link of links) {
    if (!latestLinkByClientId.has(link.clientId)) latestLinkByClientId.set(link.clientId, link);
  }

  const unresolvedClientIds = clientIds.filter((clientId) => !latestLinkByClientId.has(clientId));
  const legacyTokens = Array.from(new Set(
    (Array.isArray(parentAutomation.results) ? parentAutomation.results : [])
      .filter((result) => unresolvedClientIds.includes(result.clientId))
      .map((result) => extractTokenFromLinkUrl(result.linkUrl))
      .filter(Boolean),
  ));

  if (legacyTokens.length) {
    const legacyLinks = await getLinkDelegate(automation.type).findMany({
      where: {
        token: { in: legacyTokens },
        clientId: { in: unresolvedClientIds },
      },
      orderBy: [
        { createdAt: 'desc' },
      ],
    });

    for (const link of legacyLinks) {
      if (!latestLinkByClientId.has(link.clientId)) latestLinkByClientId.set(link.clientId, link);
    }
  }

  const skippedByClientId = new Map();
  const eligibleClientIds = [];
  for (const clientId of clientIds) {
    const link = latestLinkByClientId.get(clientId);
    if (!link) {
      skippedByClientId.set(clientId, 'A automação mãe não gerou um link para este cliente.');
      continue;
    }

    if (link[submittedField] || link.usedAt) {
      skippedByClientId.set(clientId, 'O formulário já foi respondido.');
      continue;
    }

    if (new Date(link.expiresAt).getTime() <= Date.now()) {
      skippedByClientId.set(clientId, 'O formulário original já expirou.');
      continue;
    }

    eligibleClientIds.push(clientId);
  }

  return { eligibleClientIds, skippedByClientId, parentAutomation };
}

function resolveScheduling(sendMode, delayDays, parentAutomation = null) {
  if (sendMode !== 'SCHEDULED') return { scheduledAt: null, parsedDelayDays: null };

  const days = Number.parseInt(String(delayDays ?? '0'), 10);
  if (!Number.isFinite(days) || days <= 0) throw new AppError('delayDays deve ser um número positivo.', 400);

  const baseDate = parentAutomation?.sentAt ? new Date(parentAutomation.sentAt) : new Date();
  return {
    parsedDelayDays: days,
    scheduledAt: new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000).toISOString(),
  };
}

// ── Internal: find trainer ────────────────────────────────────────────────────
async function getTrainerOrThrow(userId) {
  const trainer = await prisma.trainer.findFirst({ where: { userId } });
  if (!trainer) throw new AppError('Trainer não encontrado.', 404);
  return trainer;
}

// ── Internal: create link + send WhatsApp for one client ────────────────────
async function dispatchToClient(client, automation) {
  const phone = client.phone ? String(client.phone).trim() : null;
  const clientName = client.name || 'Cliente';

  if (!phone) {
    return { clientId: client.id, clientName, phone: null, status: 'skipped', error: 'Sem número de telefone.' };
  }

  // Normalise phone to E.164 "whatsapp:+..." format
  const toPhone = phone.startsWith('whatsapp:') ? phone : `whatsapp:${phone.startsWith('+') ? phone : '+' + phone}`;

  let linkUrl = null;

  if (automation.type !== 'MESSAGE_ONLY') {
    try {
      const token = createToken();
      const exp   = expiresAt();
      const nowIso = new Date().toISOString();

      if (automation.type === 'CHECK_IN') {
        // Expire existing active links for this client
        const existing = await prisma.checkInLink.findMany({ where: { clientId: client.id } });
        for (const l of existing.filter((l) => !isLinkStale(l))) {
          await prisma.checkInLink.update({ where: { id: l.id }, data: { expiresAt: nowIso } });
        }
        await prisma.checkInLink.create({ data: { clientId: client.id, automationId: automation.id, token, expiresAt: exp } });
        linkUrl = buildCheckInUrl(token);
      } else {
        // FEEDBACK
        const existing = await prisma.feedbackLink.findMany({ where: { clientId: client.id } });
        for (const l of existing.filter((l) => !isLinkStale(l))) {
          await prisma.feedbackLink.update({ where: { id: l.id }, data: { expiresAt: nowIso } });
        }
        await prisma.feedbackLink.create({ data: { clientId: client.id, automationId: automation.id, token, expiresAt: exp } });
        linkUrl = buildFeedbackUrl(token);
      }
    } catch (err) {
      return { clientId: client.id, clientName, phone: toPhone, status: 'failed', error: `Erro ao criar link: ${err.message}` };
    }
  }

  const body = renderMessageTemplate(
    automation.messageTemplate || buildDefaultMessageTemplate(automation.type),
    clientName,
    linkUrl || '',
  );

  if (!body) {
    return { clientId: client.id, clientName, phone: toPhone, status: 'failed', error: 'Mensagem vazia.' };
  }

  try {
    const tw = getTwilioClient();
    await tw.messages.create({ from: TWILIO_FROM, to: toPhone, body });
    return { clientId: client.id, clientName, phone: toPhone, status: 'sent', linkUrl };
  } catch (err) {
    return { clientId: client.id, clientName, phone: toPhone, status: 'failed', error: err.message, linkUrl };
  }
}

// ── Internal: execute one automation ────────────────────────────────────────
export async function executeAutomationById(automationId) {
  const automation = await prisma.automation.findFirst({ where: { id: automationId } });
  if (!automation) throw new AppError('Automação não encontrada.', 404);

  const clientIds = automation.clientIds || [];
  if (!clientIds.length) {
    await prisma.automation.update({
      where: { id: automationId },
      data: { status: 'SENT', sentAt: new Date().toISOString(), results: [] },
    });
    return [];
  }

  const { skippedByClientId = new Map() } = await getFollowUpEligibility(automation);
  const clients = await prisma.client.findMany({ where: { id: { in: clientIds } } });
  const clientById = new Map(clients.map((client) => [client.id, client]));

  const results = [];
  for (const clientId of clientIds) {
    const client = clientById.get(clientId) || { id: clientId, name: 'Cliente', phone: null };
    const followUpSkipReason = skippedByClientId.get(clientId);
    if (followUpSkipReason) {
      results.push(buildSkippedResult(client, followUpSkipReason));
      continue;
    }

    const result = await dispatchToClient(client, automation);
    results.push(result);
  }

  const allFailed = results.length > 0 && results.every((r) => r.status === 'failed');
  const status = allFailed ? 'FAILED' : 'SENT';

  await prisma.automation.update({
    where: { id: automationId },
    data: { status, sentAt: new Date().toISOString(), results },
  });

  return results;
}

// ── GET /api/automations ─────────────────────────────────────────────────────
export const listAutomations = async (req, res, next) => {
  try {
    const trainer = await getTrainerOrThrow(req.userId);
    const automations = await prisma.automation.findMany({
      where: { trainerId: trainer.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json(automations);
  } catch (err) { next(err); }
};

// ── POST /api/automations ────────────────────────────────────────────────────
export const createAutomation = async (req, res, next) => {
  try {
    const trainer = await getTrainerOrThrow(req.userId);
    const { name, type, sendMode, delayDays, clientIds, messageTemplate, parentAutomationId } = req.body || {};

    if (!name || !String(name).trim()) throw new AppError('Nome é obrigatório.', 400);
    if (!['CHECK_IN', 'FEEDBACK', 'MESSAGE_ONLY'].includes(type)) throw new AppError('Tipo inválido.', 400);
    if (!['IMMEDIATE', 'SCHEDULED'].includes(sendMode)) throw new AppError('Modo de envio inválido.', 400);
    if (!Array.isArray(clientIds) || !clientIds.length) throw new AppError('Seleciona pelo menos um cliente.', 400);
    if (!String(messageTemplate || buildDefaultMessageTemplate(type)).trim()) throw new AppError('Mensagem é obrigatória.', 400);

    const parentAutomation = parentAutomationId
      ? await getParentAutomationOrThrow(parentAutomationId, trainer.id, type)
      : null;
    const { scheduledAt, parsedDelayDays } = resolveScheduling(sendMode, delayDays, parentAutomation);

    const now = new Date().toISOString();
    const automation = await prisma.automation.create({
      data: {
        trainerId: trainer.id,
        name: String(name).trim(),
        type,
        parentAutomationId: parentAutomation?.id || null,
        sendMode,
        delayDays: parsedDelayDays,
        clientIds,
        messageTemplate: String(messageTemplate || buildDefaultMessageTemplate(type)).trim(),
        status: 'PENDING',
        scheduledAt,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Fire immediately if mode is IMMEDIATE
    if (sendMode === 'IMMEDIATE') {
      const results = await executeAutomationById(automation.id);
      const updated = await prisma.automation.findFirst({ where: { id: automation.id } });
      return res.status(201).json({ automation: updated, results });
    }

    res.status(201).json({ automation, results: null });
  } catch (err) { next(err); }
};

// ── PATCH /api/automations/:id ───────────────────────────────────────────────
export const updateAutomation = async (req, res, next) => {
  try {
    const trainer = await getTrainerOrThrow(req.userId);
    const automation = await prisma.automation.findFirst({ where: { id: req.params.id } });
    if (!automation) throw new AppError('Automação não encontrada.', 404);
    if (automation.trainerId !== trainer.id) throw new AppError('Sem permissão.', 403);
    if (automation.status !== 'PENDING') throw new AppError('Só podes editar automações pendentes.', 400);

    const {
      name = automation.name,
      type = automation.type,
      sendMode = automation.sendMode,
      delayDays = automation.delayDays,
      clientIds = automation.clientIds,
      messageTemplate = automation.messageTemplate || buildDefaultMessageTemplate(type),
      parentAutomationId = automation.parentAutomationId || null,
    } = req.body || {};

    if (!name || !String(name).trim()) throw new AppError('Nome é obrigatório.', 400);
    if (!['CHECK_IN', 'FEEDBACK', 'MESSAGE_ONLY'].includes(type)) throw new AppError('Tipo inválido.', 400);
    if (!['IMMEDIATE', 'SCHEDULED'].includes(sendMode)) throw new AppError('Modo de envio inválido.', 400);
    if (!Array.isArray(clientIds) || !clientIds.length) throw new AppError('Seleciona pelo menos um cliente.', 400);
    if (!String(messageTemplate || '').trim()) throw new AppError('Mensagem é obrigatória.', 400);

    if (automation.parentAutomationId && parentAutomationId !== automation.parentAutomationId) {
      throw new AppError('Não é possível trocar a automação mãe deste follow-up.', 400);
    }

    const parentAutomation = parentAutomationId
      ? await getParentAutomationOrThrow(parentAutomationId, trainer.id, type)
      : null;
    const { scheduledAt, parsedDelayDays } = resolveScheduling(sendMode, delayDays, parentAutomation);

    const updated = await prisma.automation.update({
      where: { id: automation.id },
      data: {
        name: String(name).trim(),
        type,
        parentAutomationId: parentAutomation?.id || null,
        sendMode,
        delayDays: parsedDelayDays,
        clientIds,
        messageTemplate: String(messageTemplate).trim(),
        scheduledAt,
        updatedAt: new Date().toISOString(),
      },
    });

    res.json({ automation: updated });
  } catch (err) { next(err); }
};

// ── POST /api/automations/:id/execute ────────────────────────────────────────
export const executeAutomation = async (req, res, next) => {
  try {
    const trainer = await getTrainerOrThrow(req.userId);
    const automation = await prisma.automation.findFirst({ where: { id: req.params.id } });
    if (!automation) throw new AppError('Automação não encontrada.', 404);
    if (automation.trainerId !== trainer.id) throw new AppError('Sem permissão.', 403);

    const results = await executeAutomationById(automation.id);
    const updated  = await prisma.automation.findFirst({ where: { id: automation.id } });
    res.json({ automation: updated, results });
  } catch (err) { next(err); }
};

// ── DELETE /api/automations/:id ──────────────────────────────────────────────
export const deleteAutomation = async (req, res, next) => {
  try {
    const trainer = await getTrainerOrThrow(req.userId);
    const automation = await prisma.automation.findFirst({ where: { id: req.params.id } });
    if (!automation) throw new AppError('Automação não encontrada.', 404);
    if (automation.trainerId !== trainer.id) throw new AppError('Sem permissão.', 403);
    await prisma.automation.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) { next(err); }
};

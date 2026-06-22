import { randomBytes } from 'node:crypto';
import path from 'node:path';
import '../config/env.js';
import { prisma } from '../config/database.js';
import { AppError } from '../utils/AppError.js';
import * as gmailService from '../services/gmail.service.js';

// ── Link helpers ───────────────────────────────────────────────────────────────
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

// ── Email HTML wrapper ─────────────────────────────────────────────────────────
function wrapHtmlEmail(bodyHtml) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
<tr><td style="background:linear-gradient(135deg,#10253C,#2C4F73);padding:28px 32px;text-align:center">
<h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:800">Daniel Abreu Personal Trainer</h1>
</td></tr>
<tr><td style="padding:32px 32px 24px">
${bodyHtml}
</td></tr>
<tr><td style="padding:0 32px 28px;text-align:center;color:#8899aa;font-size:12px">
<hr style="border:none;border-top:1px solid #e8ecf0;margin:0 0 16px">
Daniel Abreu Personal Trainer
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

// ── Plain text → styled HTML conversion ────────────────────────────────────────
const BTN_LABELS = { CHECK_IN: 'Preencher Check-in', FEEDBACK: 'Preencher Feedback' };

function textToHtml(plainText, type) {
  const escaped = String(plainText)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const paragraphs = escaped.split(/\n{2,}/);
  const lines = paragraphs.map((block) => {
    const content = block.replace(/\n/g, '<br>');
    if (content.includes('{{link}}')) {
      const label = BTN_LABELS[type] || 'Abrir link';
      return `<p style="text-align:center;margin:28px 0"><a href="{{link}}" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#10253C,#2C4F73);color:#ffffff;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px">${label}</a></p>`;
    }
    return `<p style="font-size:15px;color:#333;line-height:1.6">${content}</p>`;
  });

  return lines.join('\n');
}

// ── Default templates (plain text) ─────────────────────────────────────────────
function buildDefaultMessageTemplate(type) {
  if (type === 'FEEDBACK') {
    return `Olá {{name}}! 👋\n\nO Daniel gostaria de receber o teu feedback. A tua opinião é muito importante para continuarmos a evoluir juntos.\n\n{{link}}\n\nObrigado! 🙏`;
  }
  if (type === 'MESSAGE_ONLY') {
    return `Olá {{name}}! 👋\n\nComo estão a correr os treinos? Estou aqui se precisares de alguma coisa. 💬\n\nForça! 💪`;
  }
  return `Olá {{name}}! 👋\n\nO Daniel preparou um novo formulário de check-in especialmente para ti. Preenche-o para acompanhares o teu progresso.\n\n{{link}}\n\nForça! 💪`;
}

function buildDefaultSubject(type) {
  if (type === 'FEEDBACK') return 'Daniel Abreu PT — Feedback';
  if (type === 'MESSAGE_ONLY') return 'Daniel Abreu PT — Mensagem';
  return 'Daniel Abreu PT — Check-in';
}

function renderMessageTemplate(template, clientName, linkUrl) {
  return String(template || '')
    .replaceAll('{{name}}', clientName)
    .replaceAll('{{link}}', linkUrl)
    .trim();
}

function renderWelcomeTemplate(template, clientName, amount) {
  return String(template || '')
    .replaceAll('{{name}}', clientName)
    .replaceAll('{{amount}}', amount)
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
  return parentAutomation;
}

function buildSkippedResult(client, error) {
  return {
    clientId: client?.id || null,
    clientName: client?.name || 'Cliente',
    email: client?.email || null,
    status: 'skipped',
    error,
  };
}

async function getFollowUpEligibility(automation) {
  const clientIds = Array.isArray(automation.clientIds) ? automation.clientIds : [];
  if (!automation.parentAutomationId || !clientIds.length) {
    return { eligibleClientIds: clientIds, skippedByClientId: new Map() };
  }

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
    orderBy: [{ createdAt: 'desc' }],
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
      orderBy: [{ createdAt: 'desc' }],
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

function resolveScheduling(sendMode, scheduledAtRaw, delayDays, parentAutomation = null) {
  if (sendMode !== 'SCHEDULED') return { scheduledAt: null, parsedDelayDays: null };

  if (scheduledAtRaw) {
    const parsed = new Date(scheduledAtRaw);
    if (Number.isNaN(parsed.getTime())) throw new AppError('Data/hora agendada inválida.', 400);
    return { scheduledAt: parsed.toISOString(), parsedDelayDays: null };
  }

  const days = Number.parseInt(String(delayDays ?? '0'), 10);
  if (!Number.isFinite(days) || days <= 0) throw new AppError('Indica uma data ou número de dias.', 400);

  const baseDate = parentAutomation?.sentAt
    ? new Date(parentAutomation.sentAt)
    : parentAutomation?.scheduledAt
      ? new Date(parentAutomation.scheduledAt)
      : new Date();
  return {
    parsedDelayDays: days,
    scheduledAt: new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000).toISOString(),
  };
}

// ── Internal helpers ───────────────────────────────────────────────────────────
async function getTrainerOrThrow(userId) {
  const trainer = await prisma.trainer.findFirst({ where: { userId } });
  if (!trainer) throw new AppError('Trainer não encontrado.', 404);
  return trainer;
}

// ── Internal: create link + send email for one client ──────────────────────────
async function dispatchToClient(client, automation, trainer) {
  const email = (client.user?.email || client.email) ? String(client.user?.email || client.email).trim() : null;
  const clientName = client.name || 'Cliente';

  if (!email) {
    return { clientId: client.id, clientName, email: null, status: 'skipped', error: 'Sem email.' };
  }

  if (!trainer.gmailRefreshToken) {
    return { clientId: client.id, clientName, email, status: 'failed', error: 'Gmail não configurado. Conecta a tua conta Gmail primeiro.' };
  }

  let linkUrl = null;

  if (automation.type !== 'MESSAGE_ONLY') {
    try {
      const token = createToken();
      const exp = expiresAt();
      const nowIso = new Date().toISOString();

      if (automation.type === 'CHECK_IN') {
        const existing = await prisma.checkInLink.findMany({ where: { clientId: client.id } });
        for (const l of existing.filter((l) => !isLinkStale(l))) {
          await prisma.checkInLink.update({ where: { id: l.id }, data: { expiresAt: nowIso } });
        }
        await prisma.checkInLink.create({ data: { clientId: client.id, automationId: automation.id, token, expiresAt: exp } });
        linkUrl = buildCheckInUrl(token);
      } else {
        const existing = await prisma.feedbackLink.findMany({ where: { clientId: client.id } });
        for (const l of existing.filter((l) => !isLinkStale(l))) {
          await prisma.feedbackLink.update({ where: { id: l.id }, data: { expiresAt: nowIso } });
        }
        await prisma.feedbackLink.create({ data: { clientId: client.id, automationId: automation.id, token, expiresAt: exp } });
        linkUrl = buildFeedbackUrl(token);
      }
    } catch (err) {
      return { clientId: client.id, clientName, email, status: 'failed', error: `Erro ao criar link: ${err.message}` };
    }
  }

  const plainBody = renderMessageTemplate(
    automation.messageTemplate || buildDefaultMessageTemplate(automation.type),
    clientName,
    linkUrl || '',
  );

  if (!plainBody) {
    return { clientId: client.id, clientName, email, status: 'failed', error: 'Mensagem vazia.' };
  }

  const bodyHtml = textToHtml(plainBody, automation.type);
  const html = wrapHtmlEmail(bodyHtml);
  const subject = automation.subject || buildDefaultSubject(automation.type);
  const attachments = Array.isArray(automation.attachments) ? automation.attachments : [];

  try {
    await gmailService.sendEmail({
      refreshToken: trainer.gmailRefreshToken,
      senderEmail: trainer.gmailEmail,
      to: email,
      subject,
      html,
      attachments,
    });
    return { clientId: client.id, clientName, email, status: 'sent', linkUrl };
  } catch (err) {
    return { clientId: client.id, clientName, email, status: 'failed', error: err.message, linkUrl };
  }
}

// ── Internal: execute one automation ───────────────────────────────────────────
export async function executeAutomationById(automationId) {
  const automation = await prisma.automation.findFirst({ where: { id: automationId } });
  if (!automation) throw new AppError('Automação não encontrada.', 404);
  if (automation.type === 'CLIENT_WELCOME_EMAIL') throw new AppError('Esta automação é uma configuração, não pode ser executada.', 400);

  if (automation.parentAutomationId) {
    const parent = await prisma.automation.findFirst({ where: { id: automation.parentAutomationId } });
    if (parent && !parent.sentAt) return null;
  }

  const trainer = await prisma.trainer.findFirst({ where: { id: automation.trainerId } });
  if (!trainer) throw new AppError('Trainer não encontrado.', 404);

  const clientIds = automation.clientIds || [];
  if (!clientIds.length) {
    await prisma.automation.update({
      where: { id: automationId },
      data: { status: 'SENT', sentAt: new Date().toISOString(), results: [] },
    });
    return [];
  }

  const { skippedByClientId = new Map() } = await getFollowUpEligibility(automation);
  const clients = await prisma.client.findMany({ where: { id: { in: clientIds } }, include: { user: { select: { email: true } } } });
  const clientById = new Map(clients.map((client) => [client.id, client]));

  const results = [];
  for (const clientId of clientIds) {
    const client = clientById.get(clientId) || { id: clientId, name: 'Cliente', email: null };
    const followUpSkipReason = skippedByClientId.get(clientId);
    if (followUpSkipReason) {
      results.push(buildSkippedResult(client, followUpSkipReason));
      continue;
    }
    const result = await dispatchToClient(client, automation, trainer);
    results.push(result);
  }

  const allFailed = results.length > 0 && results.every((r) => r.status === 'failed');
  const status = allFailed ? 'FAILED' : 'SENT';

  const sentAt = new Date().toISOString();
  await prisma.automation.update({
    where: { id: automationId },
    data: { status, sentAt, results },
  });

  const pendingFollowUps = await prisma.automation.findMany({
    where: { parentAutomationId: automationId, status: 'PENDING' },
  });
  for (const followUp of pendingFollowUps) {
    if (followUp.sendMode === 'SCHEDULED' && followUp.delayDays) {
      const newScheduledAt = new Date(new Date(sentAt).getTime() + followUp.delayDays * 24 * 60 * 60 * 1000).toISOString();
      await prisma.automation.update({
        where: { id: followUp.id },
        data: { scheduledAt: newScheduledAt, updatedAt: new Date().toISOString() },
      });
    }
  }

  return results;
}

// ── Gmail OAuth ────────────────────────────────────────────────────────────────
export const getGmailAuthUrl = async (req, res, next) => {
  try {
    const url = gmailService.getAuthUrl();
    res.json({ url });
  } catch (err) { next(err); }
};

export const handleGmailCallback = async (req, res, next) => {
  try {
    const trainer = await getTrainerOrThrow(req.userId);
    const { code } = req.body;
    if (!code) throw new AppError('Código de autorização em falta.', 400);

    const tokens = await gmailService.exchangeCode(code);
    if (!tokens.refresh_token) throw new AppError('Não foi possível obter refresh token. Tenta novamente.', 400);

    const gmailEmail = await gmailService.getGmailEmail(tokens.refresh_token);

    await prisma.trainer.update({
      where: { id: trainer.id },
      data: { gmailRefreshToken: tokens.refresh_token, gmailEmail },
    });

    res.json({ success: true, email: gmailEmail });
  } catch (err) { next(err); }
};

export const getGmailStatus = async (req, res, next) => {
  try {
    const trainer = await getTrainerOrThrow(req.userId);
    res.json({
      connected: !!trainer.gmailRefreshToken,
      email: trainer.gmailEmail || null,
    });
  } catch (err) { next(err); }
};

export const disconnectGmail = async (req, res, next) => {
  try {
    const trainer = await getTrainerOrThrow(req.userId);
    await prisma.trainer.update({
      where: { id: trainer.id },
      data: { gmailRefreshToken: null, gmailEmail: null },
    });
    res.json({ success: true });
  } catch (err) { next(err); }
};

// ── GET /api/automations ────────────────────────────────────────────────────────
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

// ── POST /api/automations ───────────────────────────────────────────────────────
export const createAutomation = async (req, res, next) => {
  try {
    const trainer = await getTrainerOrThrow(req.userId);
    const { name, type, sendMode, delayDays, scheduledAt: scheduledAtRaw, clientIds, messageTemplate, subject, parentAutomationId } = req.body || {};

    if (!name || !String(name).trim()) throw new AppError('Nome é obrigatório.', 400);
    if (!['CHECK_IN', 'FEEDBACK', 'MESSAGE_ONLY', 'CLIENT_WELCOME_EMAIL'].includes(type)) throw new AppError('Tipo inválido.', 400);

    if (type === 'CLIENT_WELCOME_EMAIL') {
      const existing = await prisma.automation.findFirst({ where: { trainerId: trainer.id, type: 'CLIENT_WELCOME_EMAIL' } });
      if (existing) throw new AppError('Já existe uma configuração de email de boas-vindas. Edita a existente.', 400);

      const attachments = Array.isArray(req.body.attachments) ? req.body.attachments : [];
      const now = new Date().toISOString();
      const automation = await prisma.automation.create({
        data: {
          trainerId: trainer.id,
          name: String(name).trim(),
          type: 'CLIENT_WELCOME_EMAIL',
          sendMode: 'IMMEDIATE',
          clientIds: [],
          messageTemplate: String(messageTemplate || '').trim(),
          subject: String(subject || 'Daniel Abreu PT — Willkommen').trim(),
          attachments,
          status: 'PENDING',
          createdAt: now,
          updatedAt: now,
        },
      });
      return res.status(201).json({ automation, results: null });
    }

    if (!['IMMEDIATE', 'SCHEDULED'].includes(sendMode)) throw new AppError('Modo de envio inválido.', 400);
    if (!Array.isArray(clientIds) || !clientIds.length) throw new AppError('Seleciona pelo menos um cliente.', 400);
    if (!String(messageTemplate || buildDefaultMessageTemplate(type)).trim()) throw new AppError('Mensagem é obrigatória.', 400);

    const parentAutomation = parentAutomationId
      ? await getParentAutomationOrThrow(parentAutomationId, trainer.id, type)
      : null;
    const { scheduledAt, parsedDelayDays } = resolveScheduling(sendMode, scheduledAtRaw, delayDays, parentAutomation);

    const attachments = Array.isArray(req.body.attachments) ? req.body.attachments : [];

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
        subject: String(subject || buildDefaultSubject(type)).trim(),
        attachments,
        status: 'PENDING',
        scheduledAt,
        createdAt: now,
        updatedAt: now,
      },
    });

    if (sendMode === 'IMMEDIATE') {
      const results = await executeAutomationById(automation.id);
      const updated = await prisma.automation.findFirst({ where: { id: automation.id } });
      return res.status(201).json({ automation: updated, results });
    }

    res.status(201).json({ automation, results: null });
  } catch (err) { next(err); }
};

// ── PATCH /api/automations/:id ──────────────────────────────────────────────────
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
      scheduledAt: scheduledAtRaw,
      clientIds = automation.clientIds,
      messageTemplate = automation.messageTemplate || buildDefaultMessageTemplate(type),
      subject = automation.subject || buildDefaultSubject(type),
      attachments = automation.attachments || [],
      parentAutomationId = automation.parentAutomationId || null,
    } = req.body || {};

    if (!name || !String(name).trim()) throw new AppError('Nome é obrigatório.', 400);
    if (!['CHECK_IN', 'FEEDBACK', 'MESSAGE_ONLY', 'CLIENT_WELCOME_EMAIL'].includes(type)) throw new AppError('Tipo inválido.', 400);

    if (type === 'CLIENT_WELCOME_EMAIL') {
      const updated = await prisma.automation.update({
        where: { id: automation.id },
        data: {
          name: String(name).trim(),
          messageTemplate: String(messageTemplate || '').trim(),
          subject: String(subject || '').trim(),
          attachments: Array.isArray(attachments) ? attachments : [],
          updatedAt: new Date().toISOString(),
        },
      });
      return res.json({ automation: updated });
    }

    if (!['IMMEDIATE', 'SCHEDULED'].includes(sendMode)) throw new AppError('Modo de envio inválido.', 400);
    if (!Array.isArray(clientIds) || !clientIds.length) throw new AppError('Seleciona pelo menos um cliente.', 400);
    if (!String(messageTemplate || '').trim()) throw new AppError('Mensagem é obrigatória.', 400);

    if (automation.parentAutomationId && parentAutomationId !== automation.parentAutomationId) {
      throw new AppError('Não é possível trocar a automação mãe deste follow-up.', 400);
    }

    const parentAutomationData = parentAutomationId
      ? await getParentAutomationOrThrow(parentAutomationId, trainer.id, type)
      : null;
    const { scheduledAt, parsedDelayDays } = resolveScheduling(sendMode, scheduledAtRaw, delayDays, parentAutomationData);

    const updated = await prisma.automation.update({
      where: { id: automation.id },
      data: {
        name: String(name).trim(),
        type,
        parentAutomationId: parentAutomationData?.id || null,
        sendMode,
        delayDays: parsedDelayDays,
        clientIds,
        messageTemplate: String(messageTemplate).trim(),
        subject: String(subject).trim(),
        attachments: Array.isArray(attachments) ? attachments : [],
        scheduledAt,
        updatedAt: new Date().toISOString(),
      },
    });

    res.json({ automation: updated });
  } catch (err) { next(err); }
};

// ── POST /api/automations/:id/execute ───────────────────────────────────────────
export const executeAutomation = async (req, res, next) => {
  try {
    const trainer = await getTrainerOrThrow(req.userId);
    const automation = await prisma.automation.findFirst({ where: { id: req.params.id } });
    if (!automation) throw new AppError('Automação não encontrada.', 404);
    if (automation.trainerId !== trainer.id) throw new AppError('Sem permissão.', 403);

    const results = await executeAutomationById(automation.id);
    if (results === null) throw new AppError('A automação mãe ainda não foi enviada. O follow-up será executado automaticamente após o envio da mãe.', 400);
    const updated = await prisma.automation.findFirst({ where: { id: automation.id } });
    res.json({ automation: updated, results });
  } catch (err) { next(err); }
};

// ── DELETE /api/automations/:id ─────────────────────────────────────────────────
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

// ── GET /api/automations/welcome-config ──────────────────────────────────────────
export const getWelcomeConfig = async (req, res, next) => {
  try {
    const trainer = await getTrainerOrThrow(req.userId);
    const config = await prisma.automation.findFirst({
      where: { trainerId: trainer.id, type: 'CLIENT_WELCOME_EMAIL' },
    });
    res.json(config || null);
  } catch (err) { next(err); }
};

// ── POST /api/automations/send-welcome-email ─────────────────────────────────────
export const sendWelcomeEmail = async (req, res, next) => {
  try {
    const trainer = await getTrainerOrThrow(req.userId);
    const { clientId, messageBody, subject, attachments: extraAttachments } = req.body || {};

    if (!clientId) throw new AppError('Cliente é obrigatório.', 400);
    if (!messageBody || !String(messageBody).trim()) throw new AppError('Mensagem é obrigatória.', 400);

    if (!trainer.gmailRefreshToken) {
      throw new AppError('Gmail não configurado. Conecta a tua conta Gmail primeiro.', 400);
    }

    const client = await prisma.client.findFirst({ where: { id: clientId }, include: { user: { select: { email: true } } } });
    if (!client) throw new AppError('Cliente não encontrado.', 404);

    const email = (client.user?.email || client.email) ? String(client.user?.email || client.email).trim() : null;
    if (!email) throw new AppError('O cliente não tem email.', 400);

    const bodyHtml = textToHtml(String(messageBody).trim(), 'MESSAGE_ONLY');
    const html = wrapHtmlEmail(bodyHtml);
    const allAttachments = Array.isArray(extraAttachments) ? extraAttachments : [];

    await gmailService.sendEmail({
      refreshToken: trainer.gmailRefreshToken,
      senderEmail: trainer.gmailEmail,
      to: email,
      subject: String(subject || 'Daniel Abreu PT — Willkommen').trim(),
      html,
      attachments: allAttachments,
    });

    res.json({ success: true, email, clientName: client.name });
  } catch (err) { next(err); }
};

// ── POST /api/automations/upload-attachment ──────────────────────────────────────
export const uploadAttachment = async (req, res, next) => {
  try {
    await getTrainerOrThrow(req.userId);
    if (!req.file) throw new AppError('Nenhum ficheiro enviado.', 400);
    res.json({
      filename: req.file.filename,
      originalName: req.file.originalname,
      path: req.file.path,
      size: req.file.size,
    });
  } catch (err) { next(err); }
};

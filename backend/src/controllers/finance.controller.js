import { prisma, supabase } from '../config/database.js';
import { AppError } from '../utils/AppError.js';
import fs from 'fs';
import path from 'path';

const EXPENSE_ATTACHMENTS_BUCKET = process.env.EXPENSE_ATTACHMENTS_BUCKET || 'expense-attachments';
let expenseAttachmentsBucketEnsured = false;

function buildMonthBuckets(monthsBack = 6) {
  const now = new Date();
  const buckets = [];

  for (let i = monthsBack - 1; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      month: date.getMonth() + 1,
      year: date.getFullYear(),
    });
  }

  return buckets;
}

function getMonthRange(month, year) {
  if (!month || !year) return null;
  const start = new Date(Number(year), Number(month) - 1, 1);
  const end = new Date(Number(year), Number(month), 0, 23, 59, 59, 999);
  return { start, end };
}

function buildYearlyBuckets(yearsBack = 3) {
  const now = new Date();
  const years = [];
  for (let i = yearsBack - 1; i >= 0; i -= 1) {
    years.push(now.getFullYear() - i);
  }
  return years;
}

async function getTrainerByUserId(userId) {
  const trainer = await prisma.trainer.findUnique({ where: { userId } });
  if (!trainer) throw new AppError('Não autorizado.', 403);
  return trainer;
}

async function deleteAttachmentFiles(attachments = []) {
  for (const attachment of attachments) {
    if (!attachment?.url) continue;
    const storageRef = parseSupabaseStorageUrl(attachment.url);
    if (storageRef) {
      const { error } = await supabase.storage.from(storageRef.bucket).remove([storageRef.objectPath]);
      if (error && !String(error.message || '').toLowerCase().includes('not found')) {
        throw new AppError(`Não foi possível remover o anexo: ${error.message}`, 500);
      }
      continue;
    }
    const normalized = String(attachment.url).replace(/^\/+/, '');
    const absolutePath = path.resolve(process.cwd(), normalized);
    try {
      if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
    } catch {
      // No-op: file cleanup failure should not block DB consistency.
    }
  }
}

function isSupabaseStorageUrl(urlPath) {
  return String(urlPath || '').startsWith('supabase://');
}

function buildSupabaseStorageUrl(bucket, objectPath) {
  return `supabase://${bucket}/${objectPath}`;
}

function parseSupabaseStorageUrl(urlPath) {
  const raw = String(urlPath || '');
  if (!isSupabaseStorageUrl(raw)) return null;
  const remainder = raw.slice('supabase://'.length);
  const slashIndex = remainder.indexOf('/');
  if (slashIndex <= 0) return null;

  return {
    bucket: remainder.slice(0, slashIndex),
    objectPath: remainder.slice(slashIndex + 1),
  };
}

function sanitizeStorageName(value) {
  return String(value || 'attachment')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'attachment';
}

async function ensureExpenseAttachmentsBucket() {
  if (expenseAttachmentsBucketEnsured) return;

  const { error } = await supabase.storage.createBucket(EXPENSE_ATTACHMENTS_BUCKET, {
    public: false,
    fileSizeLimit: 15 * 1024 * 1024,
  });

  if (error && !String(error.message || '').toLowerCase().includes('already')) {
    throw new AppError(`Não foi possível preparar o bucket de anexos: ${error.message}`, 500);
  }

  expenseAttachmentsBucketEnsured = true;
}

async function uploadExpenseAttachmentToStorage({ trainerId, expenseId, file }) {
  await ensureExpenseAttachmentsBucket();

  const safeName = sanitizeStorageName(file.originalname || 'attachment');
  const objectPath = `${trainerId}/${expenseId}/${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeName}`;

  const { error } = await supabase.storage
    .from(EXPENSE_ATTACHMENTS_BUCKET)
    .upload(objectPath, file.buffer, {
      contentType: file.mimetype || 'application/octet-stream',
      upsert: false,
    });

  if (error) {
    throw new AppError(`Não foi possível guardar o anexo: ${error.message}`, 500);
  }

  return buildSupabaseStorageUrl(EXPENSE_ATTACHMENTS_BUCKET, objectPath);
}

async function downloadStoredAttachment(attachment) {
  const storageRef = parseSupabaseStorageUrl(attachment?.url);
  if (!storageRef) return null;

  const { data, error } = await supabase.storage.from(storageRef.bucket).download(storageRef.objectPath);
  if (error) {
    const message = String(error.message || '');
    if (message.toLowerCase().includes('not found')) return null;
    throw new AppError(`Não foi possível descarregar o anexo: ${message}`, 500);
  }

  return Buffer.from(await data.arrayBuffer());
}

function getAttachmentAbsolutePath(attachment) {
  const normalized = String(attachment?.url || '').replace(/^\/+/, '');
  return path.resolve(process.cwd(), normalized);
}

async function safeFindManyExpenses(args) {
  try {
    return await prisma.expense.findMany(args);
  } catch (err) {
    const message = String(err?.message || '');
    if (message.includes('Expense') || message.includes('relation') || message.includes('does not exist')) {
      return [];
    }
    throw err;
  }
}

async function safeFindManyExpenseAttachments(args) {
  try {
    return await prisma.expenseAttachment.findMany(args);
  } catch (err) {
    const message = String(err?.message || '');
    if (message.includes('ExpenseAttachment') || message.includes('relation') || message.includes('does not exist')) {
      return [];
    }
    throw err;
  }
}

// GET /api/finance/overview
export const getFinanceOverview = async (req, res, next) => {
  try {
    const trainer = await getTrainerByUserId(req.userId);

    const now = new Date();
    const month = req.query.month ? Number(req.query.month) : now.getMonth() + 1;
    const year = req.query.year ? Number(req.query.year) : now.getFullYear();

    let prevMonth = month - 1;
    let prevYear = year;
    if (prevMonth === 0) { prevMonth = 12; prevYear = year - 1; }

    const clients = await prisma.client.findMany({
      where: { trainerId: trainer.id },
      include: { payments: { where: { month, year } }, package: true },
    });

    const clientIds = clients.map((c) => c.id);
    const prevPayments = clientIds.length
      ? await prisma.payment.findMany({
          where: { clientId: { in: clientIds }, month: prevMonth, year: prevYear },
        })
      : [];
    const prevPaymentMap = new Map(prevPayments.map((p) => [p.clientId, p]));

    const allSummary = clients.map((c) => {
      const payment = c.payments[0];
      const expectedAmount = payment ? Number(payment.amount || 0) : 0;
      const prev = prevPaymentMap.get(c.id);
      const paymentStatus = payment?.status ?? 'PENDING';

      return {
        clientId: c.id,
        clientName: c.name,
        expectedAmount,
        monthlyPrice: expectedAmount,
        paymentStatus,
        paidAt: payment?.paidAt ?? null,
        packageName: c.package?.name || null,
        packagePrice: c.package ? Number(c.package.monthlyPrice || 0) : null,
        previousMonthAmount: prev ? Number(prev.amount || 0) : null,
        isAbsent: c.isAbsent || false,
      };
    });

    const summary = allSummary.filter(
      (c) => !c.isAbsent || c.paymentStatus === 'PAID'
    );

    const totalExpected = summary.reduce((sum, c) => sum + c.expectedAmount, 0);
    const totalReceived = summary
      .filter((c) => c.paymentStatus === 'PAID')
      .reduce((sum, c) => sum + c.expectedAmount, 0);

    res.json({
      month, year,
      totalClients: summary.length,
      totalExpected,
      totalReceived,
      totalPending: totalExpected - totalReceived,
      clients: summary,
    });
  } catch (err) { next(err); }
};

// PATCH /api/finance/payments/:clientId
export const updatePaymentStatus = async (req, res, next) => {
  try {
    const trainer = await getTrainerByUserId(req.userId);

    const { month, year, status } = req.body;
    const { clientId } = req.params;

    const client = await prisma.client.findFirst({ where: { id: clientId, trainerId: trainer.id } });
    if (!client) throw new AppError('Cliente não encontrado.', 404);

    const payment = await prisma.payment.upsert({
      where: { clientId_month_year: { clientId, month, year } },
      create: {
        clientId, month, year,
        amount: 0,
        status,
        paidAt: status === 'PAID' ? new Date() : null,
      },
      update: {
        status,
        paidAt: status === 'PAID' ? new Date() : null,
      },
    });
    res.json(payment);
  } catch (err) { next(err); }
};

// PATCH /api/finance/payments/:clientId/expected
export const updateExpectedAmount = async (req, res, next) => {
  try {
    const trainer = await getTrainerByUserId(req.userId);
    const { clientId } = req.params;
    const { month, year, amount } = req.body;

    const client = await prisma.client.findFirst({ where: { id: clientId, trainerId: trainer.id } });
    if (!client) throw new AppError('Cliente não encontrado.', 404);

    const parsedAmount = Number(amount);
    if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
      throw new AppError('Valor inválido.', 400);
    }

    const existing = await prisma.payment.findFirst({ where: { clientId, month, year } });
    if (existing?.status === 'PAID') {
      throw new AppError('Não é possível alterar o valor de um pagamento já efetuado.', 400);
    }

    const payment = await prisma.payment.upsert({
      where: { clientId_month_year: { clientId, month, year } },
      create: {
        clientId, month, year,
        amount: parsedAmount,
        status: 'PENDING',
        paidAt: null,
      },
      update: { amount: parsedAmount },
    });
    res.json(payment);
  } catch (err) { next(err); }
};

// GET /api/finance/stats
export const getFinanceStats = async (req, res, next) => {
  try {
    const trainer = await getTrainerByUserId(req.userId);

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const buckets = buildMonthBuckets(12);

    const clients = await prisma.client.findMany({
      where: { trainerId: trainer.id },
      include: { package: true },
    });

    const clientIds = clients.map((client) => client.id);
    const bucketPairs = new Set(buckets.map((bucket) => `${bucket.year}-${bucket.month}`));
    const bucketMonths = [...new Set(buckets.map((bucket) => bucket.month))];
    const bucketYears = [...new Set(buckets.map((bucket) => bucket.year))];

    const paymentsRaw = clientIds.length
      ? await prisma.payment.findMany({
        where: {
          clientId: { in: clientIds },
          month: { in: bucketMonths },
          year: { in: bucketYears },
        },
      })
      : [];

    const payments = paymentsRaw.filter((payment) => bucketPairs.has(`${payment.year}-${payment.month}`));

    const expenses = await safeFindManyExpenses({
      where: {
        trainerId: trainer.id,
        expenseDate: {
          gte: new Date(buckets[0].year, buckets[0].month - 1, 1),
          lte: new Date(buckets[buckets.length - 1].year, buckets[buckets.length - 1].month, 0, 23, 59, 59, 999),
        },
      },
    });

    const monthlySeries = buckets.map((bucket) => {
      const monthPayments = payments.filter(
        (payment) => payment.month === bucket.month && payment.year === bucket.year
      );

      const expected = monthPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      const received = monthPayments
        .filter((payment) => payment.status === 'PAID')
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

      const totalExpenses = expenses
        .filter((expense) => {
          const date = new Date(expense.expenseDate);
          return date.getMonth() + 1 === bucket.month && date.getFullYear() === bucket.year;
        })
        .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

      const pending = Math.max(expected - received, 0);
      const collectionRate = expected > 0 ? (received / expected) * 100 : 0;
      const net = received - totalExpenses;

      return {
        ...bucket,
        expected,
        received,
        pending,
        expenses: totalExpenses,
        net,
        collectionRate,
      };
    });

    const yearlyBuckets = buildYearlyBuckets(3);
    const yearlyRevenue = yearlyBuckets.map((year) => {
      const value = payments
        .filter((payment) => payment.year === year && payment.status === 'PAID')
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      return { year, value };
    });

    const yearlyExpenses = yearlyBuckets.map((year) => {
      const value = expenses
        .filter((expense) => new Date(expense.expenseDate).getFullYear() === year)
        .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
      return { year, value };
    });

    const monthlyRevenueVsExpenses = monthlySeries.map((month) => ({
      month: month.month,
      year: month.year,
      revenue: month.received,
      expenses: month.expenses,
      net: month.net,
      marginPct: month.received > 0 ? ((month.received - month.expenses) / month.received) * 100 : 0,
    }));

    const expenseByCategoryMap = new Map();
    const expenseByTypeMap = new Map();
    for (const expense of expenses) {
      const category = expense.category || 'Geral';
      const type = expense.type || 'FIXED';
      expenseByCategoryMap.set(category, (expenseByCategoryMap.get(category) || 0) + Number(expense.amount || 0));
      expenseByTypeMap.set(type, (expenseByTypeMap.get(type) || 0) + Number(expense.amount || 0));
    }

    const activeClients = clients.filter((client) => {
      if (!client.isAbsent) return true;
      const pmt = payments.find(
        (p) => p.clientId === client.id && p.month === currentMonth && p.year === currentYear
      );
      return pmt?.status === 'PAID';
    });

    const statusBreakdown = activeClients.reduce((acc, client) => {
      const currentPayment = payments.find(
        (payment) => payment.clientId === client.id && payment.month === currentMonth && payment.year === currentYear
      );
      const status = currentPayment?.status || 'PENDING';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, { PAID: 0, PENDING: 0, OVERDUE: 0 });

    const packageMap = new Map();
    for (const client of activeClients) {
      const packageName = client.package?.name || null;
      const packageKey = packageName || '__NO_PACKAGE__';
      const current = packageMap.get(packageKey) || { name: packageName, clients: 0, revenue: 0 };
      current.clients += 1;
      current.revenue += Number(client.monthlyPrice || 0);
      packageMap.set(packageKey, current);
    }

    const packageDistribution = Array.from(packageMap.values()).sort((a, b) => b.clients - a.clients);

    const averageCollectionRate = monthlySeries.length
      ? monthlySeries.reduce((sum, month) => sum + month.collectionRate, 0) / monthlySeries.length
      : 0;

    res.json({
      periodMonths: buckets.length,
      monthlySeries,
      packageDistribution,
      statusBreakdown,
      yearlyRevenue,
      yearlyExpenses,
      monthlyRevenueVsExpenses,
      expenseStats: {
        total: expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0),
        byCategory: Array.from(expenseByCategoryMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
        byType: Array.from(expenseByTypeMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
      },
      totals: {
        totalClients: activeClients.length,
        clientsWithPackage: activeClients.filter((client) => Boolean(client.packageId)).length,
        averageCollectionRate,
        annualRevenue: yearlyRevenue[yearlyRevenue.length - 1]?.value || 0,
        annualExpenses: yearlyExpenses[yearlyExpenses.length - 1]?.value || 0,
      },
    });
  } catch (err) { next(err); }
};

// GET /api/finance/expenses
export const listExpenses = async (req, res, next) => {
  try {
    const trainer = await getTrainerByUserId(req.userId);
    const { month, year, type } = req.query;
    const range = getMonthRange(month, year);

    const where = { trainerId: trainer.id };
    if (range) where.expenseDate = { gte: range.start, lte: range.end };
    if (type) where.type = String(type).toUpperCase();

    const expenses = await safeFindManyExpenses({
      where,
      orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
    });

    const attachments = expenses.length
      ? await safeFindManyExpenseAttachments({ where: { expenseId: { in: expenses.map((expense) => expense.id) } } })
      : [];

    const attachmentsByExpenseId = attachments.reduce((acc, item) => {
      if (!acc[item.expenseId]) acc[item.expenseId] = [];
      acc[item.expenseId].push(item);
      return acc;
    }, {});

    const byType = expenses.reduce((acc, expense) => {
      const key = expense.type || 'FIXED';
      acc[key] = (acc[key] || 0) + Number(expense.amount || 0);
      return acc;
    }, {});

    res.json({
      items: expenses.map((expense) => ({
        ...expense,
        attachments: attachmentsByExpenseId[expense.id] || [],
      })),
      totals: {
        count: expenses.length,
        amount: expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0),
        byType,
      },
    });
  } catch (err) { next(err); }
};

// POST /api/finance/expenses
export const createExpense = async (req, res, next) => {
  try {
    const trainer = await getTrainerByUserId(req.userId);
    const file = req.file || null;
    const {
      title,
      description,
      amount,
      category,
      paymentMethod,
      type,
      expenseDate,
    } = req.body;

    const parsedAmount = Number(amount);
    if (!title || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      throw new AppError('Dados inválidos para criar gasto.', 400);
    }

    const expense = await prisma.expense.create({
      data: {
        trainerId: trainer.id,
        title,
        description: description || null,
        amount: parsedAmount,
        category: category || null,
        paymentMethod: paymentMethod || null,
        type: String(type || 'FIXED').toUpperCase(),
        expenseDate: expenseDate ? new Date(expenseDate) : new Date(),
      },
    });

    const attachments = [];
    if (file) {
      const url = await uploadExpenseAttachmentToStorage({
        trainerId: trainer.id,
        expenseId: expense.id,
        file,
      });

      const attachment = await prisma.expenseAttachment.create({
        data: {
          expenseId: expense.id,
          fileName: file.originalname,
          mimeType: file.mimetype || null,
          fileSize: Number(file.size || 0),
          url,
        },
      });
      attachments.push(attachment);
    }

    res.status(201).json({ ...expense, attachments });
  } catch (err) { next(err); }
};

// PATCH /api/finance/expenses/:id
export const updateExpense = async (req, res, next) => {
  try {
    const trainer = await getTrainerByUserId(req.userId);
    const file = req.file || null;
    const { id } = req.params;

    const existing = await prisma.expense.findFirst({ where: { id, trainerId: trainer.id } });
    if (!existing) throw new AppError('Gasto não encontrado.', 404);

    const data = {};
    for (const key of ['title', 'description', 'category', 'paymentMethod']) {
      if (req.body[key] !== undefined) data[key] = req.body[key] || null;
    }
    if (req.body.amount !== undefined) {
      const parsedAmount = Number(req.body.amount);
      if (Number.isNaN(parsedAmount) || parsedAmount <= 0) throw new AppError('Valor inválido.', 400);
      data.amount = parsedAmount;
    }
    if (req.body.type !== undefined) data.type = String(req.body.type || 'FIXED').toUpperCase();
    if (req.body.expenseDate !== undefined) data.expenseDate = new Date(req.body.expenseDate);

    const updated = await prisma.expense.update({ where: { id }, data });

    if (file) {
      const currentAttachments = await safeFindManyExpenseAttachments({ where: { expenseId: id } });
      for (const attachment of currentAttachments) {
        await prisma.expenseAttachment.delete({ where: { id: attachment.id } });
      }
      await deleteAttachmentFiles(currentAttachments);

      const url = await uploadExpenseAttachmentToStorage({
        trainerId: trainer.id,
        expenseId: id,
        file,
      });

      await prisma.expenseAttachment.create({
        data: {
          expenseId: id,
          fileName: file.originalname,
          mimeType: file.mimetype || null,
          fileSize: Number(file.size || 0),
          url,
        },
      });
    }

    const attachments = await safeFindManyExpenseAttachments({ where: { expenseId: id }, orderBy: { createdAt: 'desc' } });
    res.json({ ...updated, attachments });
  } catch (err) { next(err); }
};

// DELETE /api/finance/expenses/:id
export const deleteExpense = async (req, res, next) => {
  try {
    const trainer = await getTrainerByUserId(req.userId);
    const { id } = req.params;

    const existing = await prisma.expense.findFirst({ where: { id, trainerId: trainer.id } });
    if (!existing) throw new AppError('Gasto não encontrado.', 404);

    const attachments = await safeFindManyExpenseAttachments({ where: { expenseId: id } });
    for (const attachment of attachments) {
      await prisma.expenseAttachment.delete({ where: { id: attachment.id } });
    }
    await deleteAttachmentFiles(attachments);

    await prisma.expense.delete({ where: { id } });
    res.json({ message: 'Gasto eliminado.' });
  } catch (err) { next(err); }
};

// GET /api/finance/expenses/:id/attachment/download
export const downloadExpenseAttachment = async (req, res, next) => {
  try {
    const trainer = await getTrainerByUserId(req.userId);
    const { id } = req.params;

    const existing = await prisma.expense.findFirst({ where: { id, trainerId: trainer.id } });
    if (!existing) throw new AppError('Gasto não encontrado.', 404);

    const [attachment] = await safeFindManyExpenseAttachments({ where: { expenseId: id }, orderBy: { createdAt: 'desc' } });
    if (!attachment) throw new AppError('Anexo não encontrado.', 404);

    const storedAttachmentBuffer = await downloadStoredAttachment(attachment);
    if (storedAttachmentBuffer) {
      res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(attachment.fileName || 'anexo')}"`);
      return res.send(storedAttachmentBuffer);
    }

    const absolutePath = getAttachmentAbsolutePath(attachment);
    if (!fs.existsSync(absolutePath)) {
      throw new AppError('Ficheiro não encontrado no servidor. Se foi enviado em produção antes desta correção, pode ser necessário reenviar.', 404);
    }

    res.download(absolutePath, attachment.fileName || 'anexo');
  } catch (err) { next(err); }
};

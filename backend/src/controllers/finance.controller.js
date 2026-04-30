import { prisma } from '../config/database.js';
import { AppError } from '../utils/AppError.js';

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

// GET /api/finance/overview
export const getFinanceOverview = async (req, res, next) => {
  try {
    const trainer = await prisma.trainer.findUnique({ where: { userId: req.userId } });
    if (!trainer) throw new AppError('Não autorizado.', 403);

    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const clients = await prisma.client.findMany({
      where: { trainerId: trainer.id },
      include: { payments: { where: { month, year } } },
    });

    const summary = clients.map((c) => ({
      clientId: c.id,
      clientName: c.name,
      monthlyPrice: c.monthlyPrice,
      paymentStatus: c.payments[0]?.status ?? 'PENDING',
      paidAt: c.payments[0]?.paidAt ?? null,
    }));

    const totalExpected = clients.reduce((sum, c) => sum + c.monthlyPrice, 0);
    const totalReceived = clients
      .filter((c) => c.payments[0]?.status === 'PAID')
      .reduce((sum, c) => sum + c.monthlyPrice, 0);

    res.json({
      month, year,
      totalClients: clients.length,
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
    const trainer = await prisma.trainer.findUnique({ where: { userId: req.userId } });
    if (!trainer) throw new AppError('Não autorizado.', 403);

    const { month, year, status } = req.body;
    const { clientId } = req.params;

    const client = await prisma.client.findFirst({ where: { id: clientId, trainerId: trainer.id } });
    if (!client) throw new AppError('Cliente não encontrado.', 404);

    const payment = await prisma.payment.upsert({
      where: { clientId_month_year: { clientId, month, year } },
      create: {
        clientId, month, year,
        amount: client.monthlyPrice,
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

// GET /api/finance/stats
export const getFinanceStats = async (req, res, next) => {
  try {
    const trainer = await prisma.trainer.findUnique({ where: { userId: req.userId } });
    if (!trainer) throw new AppError('Não autorizado.', 403);

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const buckets = buildMonthBuckets(6);

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

    const totals = clients.reduce((acc, client) => {
      const price = Number(client.monthlyPrice || 0);
      return {
        expectedMonthly: acc.expectedMonthly + price,
      };
    }, { expectedMonthly: 0 });

    const monthlySeries = buckets.map((bucket) => {
      const received = payments
        .filter((payment) => payment.month === bucket.month && payment.year === bucket.year && payment.status === 'PAID')
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

      const expected = totals.expectedMonthly;
      const pending = Math.max(expected - received, 0);
      const collectionRate = expected > 0 ? (received / expected) * 100 : 0;

      return {
        ...bucket,
        expected,
        received,
        pending,
        collectionRate,
      };
    });

    const statusBreakdown = clients.reduce((acc, client) => {
      const currentPayment = payments.find(
        (payment) => payment.clientId === client.id && payment.month === currentMonth && payment.year === currentYear
      );
      const status = currentPayment?.status || 'PENDING';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, { PAID: 0, PENDING: 0, OVERDUE: 0 });

    const packageMap = new Map();
    for (const client of clients) {
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
      totals: {
        totalClients: clients.length,
        clientsWithPackage: clients.filter((client) => Boolean(client.packageId)).length,
        averageCollectionRate,
      },
    });
  } catch (err) { next(err); }
};

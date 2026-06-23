import { prisma } from '../../backend/src/config/database.js';
import { executeAutomationById } from '../../backend/src/controllers/automation.controller.js';

export async function handler() {
  try {
    const now = Date.now();
    const pending = await prisma.automation.findMany({
      where: { status: 'PENDING', sendMode: 'SCHEDULED' },
    });
    const due = pending.filter((a) => a.scheduledAt && new Date(a.scheduledAt).getTime() <= now);

    console.log(`[cron] Found ${pending.length} pending, ${due.length} due`);

    const results = [];
    for (const automation of due) {
      try {
        console.log(`[cron] Executing automation: ${automation.name} (${automation.id})`);
        await executeAutomationById(automation.id);
        results.push({ id: automation.id, status: 'executed' });
      } catch (err) {
        console.error(`[cron] Failed automation ${automation.id}:`, err.message);
        results.push({ id: automation.id, status: 'failed', error: err.message });
      }
    }

    const body = JSON.stringify({ executed: results.length, results });
    console.log(`[cron] Done: ${body}`);
    return { statusCode: 200, body };
  } catch (err) {
    console.error('[cron] Scheduler error:', err.message);
    return { statusCode: 500, body: err.message };
  }
}

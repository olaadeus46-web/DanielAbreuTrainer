export async function handler() {
  const baseUrl = process.env.URL || 'https://danieltrainer.com';
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    console.error('[cron-automations] CRON_SECRET env var not set');
    return { statusCode: 500, body: 'CRON_SECRET not configured' };
  }

  try {
    const res = await fetch(`${baseUrl}/.netlify/functions/api/api/cron/run-automations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': secret,
      },
    });
    const body = await res.text();
    console.log(`[cron-automations] ${res.status}: ${body}`);
    return { statusCode: res.status, body };
  } catch (err) {
    console.error('[cron-automations] Error:', err.message);
    return { statusCode: 500, body: err.message };
  }
}

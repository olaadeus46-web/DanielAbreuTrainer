import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeRawMessage } from './gmail.service.js';

// Decodes RFC 2047 encoded-word(s) back to the original text, joining any
// folded continuation lines the way mail clients do.
function decodeSubjectHeader(raw) {
  const unfolded = raw.replace(/\r\n[ \t]+/g, ' ').replace(/\?=\s+=\?/g, '?==?');
  return unfolded.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, charset, encoding, text) => {
    if (encoding.toUpperCase() === 'B') {
      return Buffer.from(text, 'base64').toString(charset);
    }
    const bytes = text.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));
    return Buffer.from(bytes, 'binary').toString(charset);
  });
}

function extractSubjectLine(rawUrlSafeBase64) {
  const message = Buffer.from(rawUrlSafeBase64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  const headerBlock = message.split('\r\n\r\n')[0];
  const match = headerBlock.match(/^Subject: ([\s\S]*?)\r\n(?=\S|$)/m);
  return match[1];
}

test('accented subject is RFC 2047 MIME-encoded and round-trips correctly', async () => {
  const original = 'Olá José, o teu check-in de hoje — Müller, François, İbrahim (ã, ç, ö, ü, è, é)';
  const raw = await composeRawMessage({
    senderEmail: 'trainer@example.com',
    to: 'client@example.com',
    subject: original,
    html: '<p>oi</p>',
  });

  const subjectLine = extractSubjectLine(raw);
  assert.match(subjectLine, /=\?UTF-8\?[BQ]\?/i, 'subject should use RFC 2047 encoded-word syntax for non-ASCII');
  assert.equal(decodeSubjectHeader(subjectLine), original);
});

test('plain ASCII subject is left unencoded', async () => {
  const original = 'Your check-in is ready';
  const raw = await composeRawMessage({
    senderEmail: 'trainer@example.com',
    to: 'client@example.com',
    subject: original,
    html: '<p>hi</p>',
  });

  const subjectLine = extractSubjectLine(raw);
  assert.equal(subjectLine, original);
});

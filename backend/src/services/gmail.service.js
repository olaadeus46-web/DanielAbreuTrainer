import { google } from 'googleapis';
import nodemailer from 'nodemailer';
import '../config/env.js';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
];

function buildRedirectUrl() {
  const origin = process.env.PUBLIC_APP_URL || process.env.CORS_ORIGIN || 'http://localhost:5173';
  return `${String(origin).replace(/\/$/, '')}/automations`;
}

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    buildRedirectUrl(),
  );
}

export function getAuthUrl() {
  const oauth2 = getOAuth2Client();
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
}

export async function exchangeCode(code) {
  const oauth2 = getOAuth2Client();
  const { tokens } = await oauth2.getToken(code);
  return tokens;
}

export async function getGmailEmail(refreshToken) {
  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({ refresh_token: refreshToken });
  const oauth2Api = google.oauth2({ version: 'v2', auth: oauth2 });
  const { data } = await oauth2Api.userinfo.get();
  return data.email;
}

export async function sendEmail({ refreshToken, senderEmail, to, subject, html, attachments = [] }) {
  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({ refresh_token: refreshToken });

  const gmail = google.gmail({ version: 'v1', auth: oauth2 });

  const mailComposer = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const message = await mailComposer.sendMail({
    from: senderEmail,
    to,
    subject,
    html,
    attachments: attachments.map((att) => ({
      filename: att.originalName || att.filename,
      path: att.path,
    })),
  });

  const raw = message.message.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const result = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  });

  return result.data;
}

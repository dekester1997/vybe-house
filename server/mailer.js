const nodemailer = require('nodemailer');

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
  ADMIN_NOTIFICATION_EMAIL
} = process.env;

const configured = !!(SMTP_HOST && SMTP_USER && SMTP_PASS && ADMIN_NOTIFICATION_EMAIL);

let transporter = null;
if (configured) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
} else {
  console.log('[vybe-house] Email notifications are OFF — set SMTP_HOST, SMTP_USER, SMTP_PASS and ADMIN_NOTIFICATION_EMAIL in .env to turn them on.');
}

// Fire-and-forget: notification emails should never block or break the
// request that triggered them (an application/booking/inquiry must still
// save even if email sending fails or isn't configured).
function notifyAdmin(subject, lines) {
  if (!transporter) return;
  const text = lines.join('\n');
  const html = '<p>' + lines.map((l) => escapeHtml(l)).join('</p><p>') + '</p>';
  const sending = transporter.sendMail({
    from: SMTP_FROM || SMTP_USER,
    to: ADMIN_NOTIFICATION_EMAIL,
    subject: '[VYBE HOUSE] ' + subject,
    text,
    html
  }).catch((err) => {
    console.error('[vybe-house] Failed to send notification email:', err.message);
  });
  // Serverless functions can freeze right after replying; waitUntil lets the email finish.
  if (process.env.VERCEL) {
    try { require('@vercel/functions').waitUntil(sending); } catch (e) {}
  }
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

module.exports = { notifyAdmin, emailConfigured: configured };

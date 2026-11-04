const nodemailer = require('nodemailer');
const config = require('./config');

let transport = null;
if (config.smtp.host && config.smtp.user && config.smtp.pass) {
  transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
  });
}

async function sendMail({ to, subject, text, html, replyTo, headers }) {
  if (!transport) {
    console.log(`[mail disabled] to=${to} subject="${subject}"\n${text}`);
    return;
  }
  try {
    await transport.sendMail({ from: config.smtp.from, to, subject, text, html, replyTo, headers });
    return true;
  } catch (err) {
    console.error('Mail send failed:', err.message);
    return false;
  }
}

module.exports = { sendMail };

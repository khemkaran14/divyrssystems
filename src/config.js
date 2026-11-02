const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);

const env = process.env;

module.exports = {
  isProd: env.NODE_ENV === 'production',
  port: Number(env.PORT || 3100),
  baseUrl: (env.BASE_URL || 'http://localhost:3100').replace(/\/$/, ''),
  sessionSecret: env.SESSION_SECRET || 'dev-secret',
  adminEmail: (env.ADMIN_EMAIL || '').toLowerCase(),
  dbPath: env.DB_PATH || path.join(__dirname, '..', 'data', 'divyrs.db'),
  razorpay: {
    keyId: env.RAZORPAY_KEY_ID || '',
    keySecret: env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: env.RAZORPAY_WEBHOOK_SECRET || '',
  },
  smtp: {
    host: env.SMTP_HOST || '',
    port: Number(env.SMTP_PORT || 465),
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.MAIL_FROM || 'Divyrs Systems <no-reply@divyrs.com>',
  },
  business: {
    name: env.BUSINESS_NAME || 'Divyrs Systems',
    address: env.BUSINESS_ADDRESS || 'India',
    email: env.SUPPORT_EMAIL || 'support@divyrs.com',
    phone: env.SUPPORT_PHONE || '',
    gstin: env.GSTIN || '',
  },
};

# Launch checklist (your part)

## Today
- [ ] Run the install command on the VPS; open https://divyrs.com
- [ ] `npm run regdata:check`: all feeds ✔
- [ ] Fill `.env`: SMTP_PASS, ANTHROPIC_API_KEY, SUPPORT_PHONE, BUSINESS_ADDRESS, GRIEVANCE_OFFICER/EMAIL, GSTIN/BUSINESS_STATE (if registered)
- [ ] `pm2 restart divyrs`; sign up with ADMIN_EMAIL; confirm the email link arrives
- [ ] /admin/regdata → Check feeds now → Process waiting
- [ ] Add https://divyrs.com/healthz to a free uptime monitor (UptimeRobot / Better Stack), alerts to your phone
- [ ] Off-site backups: `rclone config` (Google Drive or Backblaze), set RCLONE_REMOTE in .env, run `deploy/backup.sh` once

## This week
- [ ] Back-fill: paste SEBI and RBI archive listing pages into /admin/regdata → Back-fill (start with the last 12 months)
- [ ] Verify the high-impact items each morning (15 min)
- [ ] Subscribe yourself to the newsletter; check Monday's email
- [ ] Register the business (proprietorship/LLP/Pvt Ltd), current account, Udyam; decide on GST registration
- [ ] Razorpay KYC + website approval + international payments
- [ ] CA/lawyer: review Terms, Privacy, Refund and business/contracts/*
- [ ] LinkedIn company page

## This month
- [ ] Build the 100-name target list (business/outreach.md)
- [ ] 10 conversations → 3 pilots (business/pilot-agreement.md)
- [ ] Post the weekly roundup on LinkedIn every Monday
- [ ] Trademark "Divyrs" (classes 9 & 42)

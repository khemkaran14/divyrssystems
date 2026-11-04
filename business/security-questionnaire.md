# Security questionnaire answers

Copy these into vendor-assessment forms. Update anything that changes, e.g. if you move hosting.

| Question | Answer |
|---|---|
| Company | Divyrs Systems, {legal form}, {address}. Contact: {name}, {email} |
| Hosting | Dedicated VPS at Hostinger ({data-centre country}). Single region; daily backups, also copied off-site {if RCLONE_REMOTE configured} |
| Encryption in transit | TLS (Let's Encrypt) on all endpoints; HTTP redirected to HTTPS; webhooks HTTPS-only and HMAC-SHA256 signed |
| Encryption at rest | Disk encryption per hosting provider; off-site backups can be encrypted with rclone crypt |
| Authentication | Email + password (bcrypt). Password reset by single-use 1-hour link. API access by bearer keys (rotatable). SSO: not yet (roadmap) |
| Authorisation | Each customer sees only its own data; admin access limited to the owner account |
| Logging | Application and web-server logs kept about 14 days (rotated). API usage counted per month. Screening names are not saved by the application; POST /enforcement/screen keeps names out of URLs and logs |
| Backups | Daily SQLite backup with integrity check; 14 days on server, 60 days off-site |
| Vulnerability management | OS updates applied regularly; dependencies audited with `npm audit`; responsible disclosure at divyrs.com/.well-known/security.txt |
| Incident response | Owner alerted automatically on crashes, feed failures and processing backlogs; customer notified of personal-data breaches within 24 hours |
| Personal data processed | Account users' names, emails, phone; billing details; names submitted for screening (not stored) and watchlists (stored until deleted) |
| Sub-processors | Hostinger (hosting, email), Razorpay (payments), Anthropic (AI reading of public regulator documents only) |
| Data residency | {India / provider region}. Public regulator documents are processed by Anthropic's API |
| Data deletion | Self-service account deletion; on request within 30 days; invoices kept as tax law requires |
| Availability | Target 99.5%; public status page divyrs.com/regdata/status; health endpoint /healthz |
| Certifications | None yet (ISO 27001 / SOC 2 not held). Willing to answer additional questions or sign a DPA |
| Insurance | {Cyber / professional indemnity policy, if any} |

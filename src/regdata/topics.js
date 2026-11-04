// Topic pages: evergreen landing pages built from the live data (good for search).
const TOPICS = [
  { slug: 'digital-lending', name: 'Digital lending', intro: 'RBI rules for banks, NBFCs and lending apps on digital loans, key fact statements, loss-sharing and lending service providers.', f: { q: 'digital lending' } },
  { slug: 'kyc-aml', name: 'KYC & anti-money laundering', intro: 'Know-your-customer, customer due diligence and AML/CFT rules from RBI and SEBI.', f: { q: 'kyc' } },
  { slug: 'cybersecurity', name: 'Cybersecurity & IT', intro: 'Cybersecurity, cyber resilience, IT governance and outsourcing requirements for regulated entities.', f: { q: 'cyber' } },
  { slug: 'fraud', name: 'Fraud risk management', intro: 'Fraud classification, reporting and risk-management directions.', f: { q: 'fraud' } },
  { slug: 'nbfc', name: 'NBFC regulations', intro: 'Every recent rule that applies to non-banking financial companies.', f: { applies_to: ['nbfc'] } },
  { slug: 'banks', name: 'Bank regulations', intro: 'Recent RBI directions and circulars for commercial banks.', f: { applies_to: ['bank'] } },
  { slug: 'co-operative-banks', name: 'Co-operative bank regulations', intro: 'Rules and penalties for urban and rural co-operative banks.', f: { applies_to: ['cooperative_bank'] } },
  { slug: 'payment-aggregators', name: 'Payment aggregators & payments', intro: 'Rules for payment aggregators, payment system operators and prepaid instruments.', f: { applies_to: ['payment_aggregator', 'payment_system_operator', 'ppi_issuer'] } },
  { slug: 'stock-brokers', name: 'Stock brokers & depository participants', intro: 'SEBI circulars for brokers and depository participants.', f: { applies_to: ['stock_broker', 'depository_participant'] } },
  { slug: 'mutual-funds', name: 'Mutual funds & AMCs', intro: 'SEBI rules for mutual funds and asset management companies.', f: { applies_to: ['mutual_fund'] } },
  { slug: 'listed-companies', name: 'Listed companies (LODR)', intro: 'SEBI disclosure and governance rules for listed companies.', f: { applies_to: ['listed_company'] } },
  { slug: 'master-directions', name: 'Master directions & master circulars', intro: 'Consolidated master directions and master circulars, and amendments to them.', f: { type: ['master_direction'] } },
  { slug: 'rbi-penalties', name: 'RBI penalties', intro: 'Monetary penalties, licence cancellations and restrictions imposed by the Reserve Bank of India.', f: { regulator: ['RBI'], enforcement: true } },
  { slug: 'sebi-orders', name: 'SEBI orders & penalties', intro: 'SEBI adjudication, settlement, interim and final orders.', f: { regulator: ['SEBI'], enforcement: true } },
];
const bySlug = Object.fromEntries(TOPICS.map((t) => [t.slug, t]));
module.exports = { TOPICS, bySlug };

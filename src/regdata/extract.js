// Turns one regulator document into structured JSON with Claude.
// Only used when ANTHROPIC_API_KEY is set; otherwise rules.js is used.
const { ENTITY_TYPES, ACTION_TYPES, DOC_TYPES } = require('./rules');

const MODEL = process.env.REGDATA_MODEL || 'claude-opus-5-5';
const EFFORT = process.env.REGDATA_EFFORT || 'medium';

const APPLIES_TO = [
  'all_regulated_entities', 'bank', 'small_finance_bank', 'payments_bank', 'cooperative_bank', 'rrb', 'nbfc', 'hfc',
  'arc', 'payment_aggregator', 'payment_system_operator', 'ppi_issuer', 'digital_lending', 'credit_information_company',
  'forex_dealer', 'stock_broker', 'depository_participant', 'mutual_fund', 'aif', 'portfolio_manager', 'investment_adviser',
  'research_analyst', 'listed_company', 'stock_exchange', 'clearing_corporation', 'registrar_transfer_agent',
  'credit_rating_agency', 'merchant_banker', 'insurer', 'insurance_intermediary', 'other',
];

const nullable = (t) => ({ anyOf: [{ type: t }, { type: 'null' }] });

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['doc_type', 'published_date', 'ref_no', 'summary', 'impact', 'effective_date', 'applies_to', 'topics', 'obligations', 'deadlines', 'amends', 'enforcement_actions'],
  properties: {
    doc_type: { type: 'string', enum: DOC_TYPES },
    published_date: nullable('string'),
    ref_no: nullable('string'),
    summary: { type: 'string' },
    impact: { type: 'string', enum: ['high', 'medium', 'low'] },
    effective_date: nullable('string'),
    applies_to: { type: 'array', items: { type: 'string', enum: APPLIES_TO } },
    topics: { type: 'array', items: { type: 'string' } },
    obligations: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['what', 'who', 'deadline', 'page'],
        properties: { what: { type: 'string' }, who: { type: 'string' }, deadline: nullable('string'), page: nullable('integer') },
      },
    },
    deadlines: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['what', 'date'],
        properties: { what: { type: 'string' }, date: { type: 'string' } },
      },
    },
    amends: { type: 'array', items: { type: 'string' } },
    enforcement_actions: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['entity_name', 'entity_type', 'action_type', 'amount_inr', 'action_date', 'reason'],
        properties: {
          entity_name: { type: 'string' },
          entity_type: { type: 'string', enum: ENTITY_TYPES },
          action_type: { type: 'string', enum: ACTION_TYPES },
          amount_inr: nullable('integer'),
          action_date: nullable('string'),
          reason: nullable('string'),
        },
      },
    },
  },
};

const SYSTEM = `You extract structured data from official documents published by Indian financial regulators (RBI, SEBI and others) for a compliance data service. Accuracy matters more than completeness: never invent facts that are not in the document.

Rules:
- summary: 2-4 plain-English sentences a compliance officer can act on.
- impact: "high" if regulated entities must change processes, systems or disclosures, or face new deadlines; "medium" for clarifications or narrower changes; "low" for informational items, speeches, data releases, or orders affecting only named parties.
- applies_to: the types of regulated entities that must act. Empty if none.
- obligations: concrete things a regulated entity must do, each with who must do it, the deadline (YYYY-MM-DD if stated, else null) and the 1-based PDF page where it appears (null if not a PDF or unknown).
- deadlines: every dated requirement, as YYYY-MM-DD.
- published_date: the date printed on the document (YYYY-MM-DD), else null.
- effective_date: YYYY-MM-DD if stated, else null.
- amends: reference numbers or titles of earlier circulars/directions this document amends, supersedes or withdraws.
- enforcement_actions: only when the document imposes a penalty, passes an order, cancels a licence/registration, settles proceedings or imposes restrictions on specific named entities or persons. One entry per named party. amount_inr in whole rupees (e.g. "₹2.50 lakh" = 250000) or null. action_date YYYY-MM-DD of the order or press release if stated. reason: one sentence on what the party did wrong.
- Use null rather than guessing.`;

let client = null;
function getClient() {
  if (client) return client;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const Anthropic = require('@anthropic-ai/sdk');
  const K = Anthropic.default || Anthropic;
  client = new K();
  return client;
}
// Tests inject a fake client.
function setClient(c) { client = c; }
const enabled = () => !!getClient();

async function extract({ regulator, title, url, publishedAt, text, pdf }) {
  const c = getClient();
  if (!c) throw new Error('ANTHROPIC_API_KEY is not set');

  const content = [];
  if (pdf) {
    content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') } });
  }
  content.push({
    type: 'text',
    text: `Regulator: ${regulator}\nTitle: ${title}\nURL: ${url}\nPublished: ${new Date(publishedAt).toISOString().slice(0, 10)}\n\n` +
      (text ? `Web page text:\n${text}\n\n` : '') +
      (pdf ? 'The attached PDF is the official document.\n\n' : '') +
      'Extract the structured data.',
  });

  // fallbacks: "default" lets the API retry on another model if the request is declined.
  const res = await c.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    output_config: { effort: EFFORT, format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content }],
  });

  if (res.stop_reason === 'refusal') throw new Error('Model declined: ' + (res.stop_details?.category || 'unknown'));
  if (res.stop_reason === 'max_tokens') throw new Error('Output was cut off (max_tokens)');
  const textBlock = (res.content || []).find((b) => b.type === 'text');
  if (!textBlock) throw new Error('No text in model response');
  const data = JSON.parse(textBlock.text);
  return { data, model: res.model || MODEL, usage: res.usage || {} };
}

module.exports = { extract, enabled, setClient, SCHEMA, APPLIES_TO, MODEL };

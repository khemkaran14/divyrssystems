// OpenAPI 3.1 description of the RegData API, served at /regdata/openapi.json.
const { APPLIES_TO } = require('./extract');
const { DOC_TYPES, ACTION_TYPES, ENTITY_TYPES } = require('./rules');
const { REGULATORS } = require('./sources');

const csv = (desc, values) => ({ type: 'string', description: `${desc}${values ? ' Comma-separated. One of: ' + values.join(', ') : ''}` });
const q = (name, schema, description) => ({ name, in: 'query', required: false, schema, description });
const err = { description: 'Error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
const errors = { 401: err, 402: err, 404: err, 429: err };
const ok = (schema, description = 'OK') => ({ description, content: { 'application/json': { schema } } });
const nstr = { type: ['string', 'null'] };

module.exports = (baseUrl) => ({
  openapi: '3.1.0',
  info: {
    title: 'Divyrs RegData API',
    version: '1.0.0',
    description: 'Indian regulatory changes (RBI, SEBI) and enforcement actions as structured data. Information only, not legal advice.',
    contact: { url: `${baseUrl}/contact` },
  },
  servers: [{ url: `${baseUrl}/api/regdata/v1` }],
  security: [{ bearer: [] }],
  paths: {
    '/changes': {
      get: {
        summary: 'List regulatory changes, newest first',
        parameters: [
          q('regulator', csv('Regulators.', REGULATORS)),
          q('applies_to', csv('Entity types that must act.', APPLIES_TO)),
          q('impact', csv('Impact.', ['high', 'medium', 'low'])),
          q('type', csv('Document types.', DOC_TYPES)),
          q('enforcement', { type: 'boolean' }, 'Only (true) or exclude (false) documents that penalise named parties.'),
          q('q', { type: 'string' }, 'Keyword search in title and summary.'),
          q('since', { type: 'string', format: 'date' }, 'Published on or after.'),
          q('until', { type: 'string', format: 'date' }, 'Published before.'),
          q('limit', { type: 'integer', default: 20 }, '1-100.'),
          q('cursor', { type: 'string' }, 'next_cursor from the previous page.'),
        ],
        responses: {
          200: ok({ type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Change' } }, next_cursor: nstr, delayed_days: { type: 'integer' } } }),
          ...errors,
        },
      },
    },
    '/changes/{id}': {
      get: {
        summary: 'Get one change with its enforcement actions',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', example: 'chg_1024' } }],
        responses: { 200: ok({ type: 'object', properties: { data: { allOf: [{ $ref: '#/components/schemas/Change' }, { type: 'object', properties: { enforcement_actions: { type: 'array', items: { $ref: '#/components/schemas/Action' } } } }] } } }), ...errors },
      },
    },
    '/enforcement': {
      get: {
        summary: 'Search enforcement actions by name, or list the latest',
        parameters: [
          q('name', { type: 'string' }, 'Company or person name (fuzzy match).'),
          q('min_confidence', { type: 'number', default: 0.6 }, '0.3-1.'),
          q('regulator', csv('Regulators.', REGULATORS)),
          q('action_type', csv('When listing without a name.', ACTION_TYPES)),
          q('since', { type: 'string', format: 'date' }),
          q('limit', { type: 'integer', default: 20 }),
          q('cursor', { type: 'string' }),
        ],
        responses: { 200: ok({ type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Action' } }, next_cursor: nstr } }), ...errors },
      },
    },
    '/enforcement/{id}': {
      get: {
        summary: 'Get one enforcement action',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', example: 'act_311' } }],
        responses: { 200: ok({ type: 'object', properties: { data: { $ref: '#/components/schemas/Action' } } }), ...errors },
      },
    },
    '/enforcement/screen': {
      post: {
        summary: 'Screen up to 100 names at once (one call per name)',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['names'], properties: { names: { type: 'array', items: { type: 'string' }, maxItems: 100 }, min_confidence: { type: 'number', default: 0.75 } } } } } },
        responses: {
          200: ok({ type: 'object', properties: { flagged: { type: 'integer' }, data: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, flagged: { type: 'boolean' }, matches: { type: 'array', items: { $ref: '#/components/schemas/Action' } } } } } } }),
          400: err, ...errors,
        },
      },
    },
    '/webhooks': {
      get: { summary: 'List webhooks', responses: { 200: ok({ type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Webhook' } } } }), ...errors } },
      post: {
        summary: 'Create a webhook (Starter and Business plans)',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/WebhookInput' } } } },
        responses: { 201: ok({ type: 'object', properties: { data: { allOf: [{ $ref: '#/components/schemas/Webhook' }, { type: 'object', properties: { secret: { type: 'string' } } }] } } }, 'Created. The signing secret is returned only once.'), 400: err, ...errors },
      },
    },
    '/webhooks/{id}': {
      delete: { summary: 'Delete a webhook', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', example: 'wh_12' } }], responses: { 200: ok({ type: 'object', properties: { deleted: { type: 'boolean' } } }), ...errors } },
    },
    '/regulators': { get: { summary: 'Feeds covered and when each was last checked', responses: { 200: ok({ type: 'object' }), ...errors } } },
    '/usage': { get: { summary: 'Your plan and calls used this month', responses: { 200: ok({ type: 'object', properties: { plan: { type: 'string' }, month: { type: 'string' }, calls: { type: 'integer' }, limit: { type: 'integer' }, plan_expires: nstr } }), ...errors } } },
  },
  components: {
    securitySchemes: { bearer: { type: 'http', scheme: 'bearer', description: 'API key from /dashboard/regdata (starts with rdk_).' } },
    schemas: {
      Error: { type: 'object', properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } } } },
      Change: {
        type: 'object',
        properties: {
          id: { type: 'string' }, regulator: { type: 'string', enum: REGULATORS }, title: { type: 'string' }, doc_type: { type: 'string', enum: DOC_TYPES },
          ref_no: nstr, published: { type: 'string', format: 'date' }, effective_date: nstr, impact: { type: ['string', 'null'], enum: ['high', 'medium', 'low', null] },
          applies_to: { type: 'array', items: { type: 'string', enum: APPLIES_TO } }, topics: { type: 'array', items: { type: 'string' } }, summary: nstr,
          obligations: { type: 'array', items: { type: 'object', properties: { what: { type: 'string' }, who: { type: 'string' }, deadline: nstr, page: { type: ['integer', 'null'] } } } },
          deadlines: { type: 'array', items: { type: 'object', properties: { what: { type: 'string' }, date: { type: 'string', format: 'date' } } } },
          amends: { type: 'array', items: { type: 'string' } }, url: { type: 'string', format: 'uri' }, pdf_url: nstr, is_enforcement: { type: 'boolean' },
          verified: { type: 'boolean' }, extraction: { type: ['string', 'null'], enum: ['ai', 'rules', null] }, page: { type: 'string', format: 'uri' },
        },
      },
      Action: {
        type: 'object',
        properties: {
          id: { type: 'string' }, regulator: { type: 'string' }, entity_name: { type: 'string' }, entity_type: { type: 'string', enum: ENTITY_TYPES },
          action_type: { type: 'string', enum: ACTION_TYPES }, amount_inr: { type: ['integer', 'null'] }, action_date: nstr, reason: nstr,
          url: { type: 'string', format: 'uri' }, pdf_url: nstr, change_id: { type: 'string' }, match_confidence: { type: 'number' },
        },
      },
      WebhookInput: {
        type: 'object', required: ['url'],
        properties: {
          url: { type: 'string', format: 'uri', description: 'Public https:// endpoint.' },
          events: { type: 'array', items: { type: 'string', enum: ['change', 'enforcement'] } },
          regulators: { type: 'array', items: { type: 'string', enum: REGULATORS } },
          applies_to: { type: 'array', items: { type: 'string', enum: APPLIES_TO } },
          impact: { type: 'array', items: { type: 'string', enum: ['high', 'medium', 'low'] } },
          watchlist: { type: 'array', items: { type: 'string' }, description: 'Enforcement events only fire when one of these names matches.' },
        },
      },
      Webhook: { type: 'object', properties: { id: { type: 'string' }, url: { type: 'string' }, filters: { type: 'object' }, active: { type: 'boolean' }, last_status: nstr, created: { type: 'string', format: 'date-time' } } },
    },
  },
});

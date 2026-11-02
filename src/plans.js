// Single source of truth for what each plan costs and allows.
// Prices are per month. Yearly = 10x monthly (2 months free).
const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    price: { INR: 0, USD: 0 },
    limits: {
      monitors: 2,
      intervalMin: 5,
      links: 10,
      savedInvoices: 3,
      emailAlerts: false,
      statusPage: false,
      whiteLabel: false,
      invoiceWatermark: true,
      apiAccess: false,
    },
    tagline: 'For trying things out',
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: { INR: 499, USD: 9 },
    limits: {
      monitors: 20,
      intervalMin: 1,
      links: 1000,
      savedInvoices: Infinity,
      emailAlerts: true,
      statusPage: true,
      whiteLabel: false,
      invoiceWatermark: false,
      apiAccess: true,
    },
    tagline: 'For freelancers and professionals',
  },
  business: {
    id: 'business',
    name: 'Business',
    price: { INR: 1999, USD: 29 },
    limits: {
      monitors: 100,
      intervalMin: 1,
      links: Infinity,
      savedInvoices: Infinity,
      emailAlerts: true,
      statusPage: true,
      whiteLabel: true,
      invoiceWatermark: false,
      apiAccess: true,
    },
    tagline: 'For agencies and companies',
  },
};

const CURRENCIES = ['INR', 'USD'];

function priceFor(planId, currency, months) {
  const plan = PLANS[planId];
  if (!plan || !CURRENCIES.includes(currency)) return null;
  const monthly = plan.price[currency];
  return months === 12 ? monthly * 10 : monthly;
}

// Plan the user actually gets right now (paid plans lapse to free on expiry).
function effectivePlan(user) {
  if (!user) return PLANS.free;
  if (user.plan !== 'free' && user.plan_expires && user.plan_expires > Date.now()) {
    return PLANS[user.plan] || PLANS.free;
  }
  return PLANS.free;
}

function formatPrice(amount, currency) {
  if (currency === 'INR') return '₹' + amount.toLocaleString('en-IN');
  return '$' + amount.toLocaleString('en-US');
}

module.exports = { PLANS, CURRENCIES, priceFor, effectivePlan, formatPrice };

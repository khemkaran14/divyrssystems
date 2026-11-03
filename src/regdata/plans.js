// RegData API plans. Billed through the same Razorpay checkout as the tools.
const REG_PLANS = {
  reg_free: {
    id: 'reg_free', name: 'Developer', price: { INR: 0, USD: 0 },
    tagline: 'Try the API and build your integration',
    limits: { callsMonth: 100, delayDays: 7, webhooks: 0, perMinute: 10 },
  },
  reg_starter: {
    id: 'reg_starter', name: 'Starter', price: { INR: 14999, USD: 179 },
    tagline: 'Fintechs and growing compliance teams',
    limits: { callsMonth: 10000, delayDays: 0, webhooks: 3, perMinute: 60 },
  },
  reg_business: {
    id: 'reg_business', name: 'Business', price: { INR: 49999, USD: 599 },
    tagline: 'Banks, NBFCs, brokers and software vendors',
    limits: { callsMonth: 100000, delayDays: 0, webhooks: 25, perMinute: 300 },
  },
};

function regPlanFor(user) {
  if (user && user.reg_plan && user.reg_plan !== 'reg_free' && user.reg_plan_expires > Date.now()) {
    return REG_PLANS[user.reg_plan] || REG_PLANS.reg_free;
  }
  return REG_PLANS.reg_free;
}

module.exports = { REG_PLANS, regPlanFor };

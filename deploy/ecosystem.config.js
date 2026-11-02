// PM2 process file: pm2 start deploy/ecosystem.config.js
module.exports = {
  apps: [{
    name: 'divyrs',
    script: 'server.js',
    cwd: __dirname + '/..',
    instances: 1, // keep 1: the uptime checker runs inside this process
    max_memory_restart: '300M',
    env: { NODE_ENV: 'production' },
  }],
};

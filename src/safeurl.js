const dns = require('dns').promises;
const net = require('net');

// Basic validation for user-supplied URLs.
function parseHttpUrl(input) {
  try {
    const u = new URL(String(input).trim());
    if (!['http:', 'https:'].includes(u.protocol)) return null;
    if (!u.hostname) return null;
    return u;
  } catch (_) {
    return null;
  }
}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224;
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateIp(v6.slice(7));
  return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80');
}

// Stops the uptime monitor being used to probe your VPS or its private network.
async function isPublicUrl(urlObj) {
  const host = urlObj.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
  try {
    const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
    return addrs.length > 0 && addrs.every((a) => !isPrivateIp(a.address));
  } catch (_) {
    return false;
  }
}

module.exports = { parseHttpUrl, isPublicUrl, isPrivateIp };

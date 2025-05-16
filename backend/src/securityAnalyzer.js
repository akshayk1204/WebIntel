const { exec } = require('child_process');
const https = require('https');

const DOMAIN_REGEX = /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;

const WAF_NORMALIZATION = {
  'Cloudflare': 'Cloudflare WAF',
  'Imperva': 'Imperva WAF',
  'Incapsula': 'Imperva WAF',
  'Akamai': 'Akamai WAF',
  'AWS': 'AWS WAF',
  'Amazon': 'AWS WAF',
  'Cloudfront': 'AWS WAF',
  'Azure': 'Azure WAF',
  'Google': 'Google Cloud WAF',
  'Fastly': 'Fastly WAF',
  'Signal Sciences': 'Fastly WAF',
  'Edgio': 'Edgio WAF',
  'Edgecast': 'Edgio WAF',
  'Radware': 'Radware WAF',
  'F5': 'F5 WAF',
  'BIG-IP': 'F5 WAF',
  'Fortinet': 'FortiWeb WAF',
  'Sucuri': 'Sucuri WAF',
  'StackPath': 'StackPath WAF',
  'ModSecurity': 'ModSecurity',
  'Wordfence': 'Wordfence WAF',
  'Malcare': 'Malcare WAF',
  'Cloudbric': 'Cloudbric WAF',
  'Reblaze': 'Reblaze WAF',
  'Wallarm': 'Wallarm WAF',
  'Kona': 'Akamai WAF',
  'SiteLock': 'SiteLock WAF',
  'GoDaddy': 'GoDaddy WAF',
  'CacheWall': 'CacheWall WAF'
};

const BOT_MANAGER_NORMALIZATION = {
  'Cloudflare Bot Management': 'Cloudflare Bot Manager',
  'Datadome': 'Datadome Bot Manager',
  'Kasada': 'Kasada Bot Manager',
  'Akamai Bot Manager': 'Akamai Bot Manager',
  'Imperva Bot Management': 'Imperva Bot Manager',
  'PerimeterX': 'PerimeterX Bot Manager',
  'F5 Bot Defense': 'F5 Bot Manager',
  'Shape Security': 'F5 Bot Manager',
  'Human Security': 'Human Bot Manager',
  'Google reCAPTCHA': 'Google Bot Manager',
  'Arkose Labs': 'Arkose Bot Manager',
  'SecurityHeaders.io': 'Basic Bot Manager'
};

const BOT_MANAGER_PATTERNS = [
  { header: 'x-ak-bms', name: 'Akamai Bot Manager' },
  { header: 'cf-bot-management', name: 'Cloudflare Bot Manager' },
  { header: 'x-shape-sec', name: 'F5 Bot Manager' },
  { header: 'x-bm-datadome', name: 'Datadome Bot Manager' },
  { header: 'x-perimeterx', name: 'PerimeterX Bot Manager' },
  { header: 'x-kasada', name: 'Kasada Bot Manager' },
  { header: 'x-recaptcha', name: 'Google Bot Manager' },
  { header: 'arkose-token', name: 'Arkose Bot Manager' },
];

function normalizeSecurityProductName(rawName) {
  if (!rawName || typeof rawName !== 'string') return null;
  const allMappings = { ...WAF_NORMALIZATION, ...BOT_MANAGER_NORMALIZATION };

  const match = Object.entries(allMappings).find(([key]) =>
    rawName.toLowerCase().includes(key.toLowerCase())
  );

  if (match) return match[1];

  return rawName
    .replace(/\(.*?\)/g, '')
    .replace(/[0-9\.]+/g, '')
    .replace(/\b(inc|llc|corp|technologies|limited|gmbh)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function runWAFW00F(domain, timeout = 30000) {
  return new Promise((resolve) => {
    const wafw00fPath = '/opt/webintel-venv/bin/wafw00f';
    exec(`${wafw00fPath} ${domain}`, { timeout }, (error, stdout, stderr) => {
      if (error) {
        if (error.killed && error.signal === 'SIGTERM') return resolve(['Timeout']);
        if (stderr.includes('Name or service not known')) return resolve(['Invalid domain']);
        console.error(`WAFW00F error for ${domain}:`, error.message);
        return resolve(['Detection failed']);
      }

      const detected = [];
      stdout.split('\n').forEach((line) => {
        if (line.startsWith('[+]')) {
          const cleaned = line.replace(/^\[\+\]\s*/, '').replace(/\s*\(.*?\)$/, '').trim();
          if (cleaned && !/generic/i.test(cleaned) && !/ASP\.?NET/i.test(cleaned)) {
            const normalized = normalizeSecurityProductName(cleaned);
            if (normalized) detected.push(normalized);
          }
        }
      });

      resolve(detected.length ? detected : ['No WAF detected']);
    });
  });
}

function detectBotManagerViaHeaders(domain) {
  return new Promise((resolve) => {
    const options = {
      hostname: domain,
      port: 443,
      path: '/',
      method: 'GET',
      rejectUnauthorized: false,
      timeout: 7000,
    };

    const req = https.request(options, (res) => {
      const detected = [];

      for (const [key] of Object.entries(res.headers)) {
        const match = BOT_MANAGER_PATTERNS.find(p =>
          key.toLowerCase().includes(p.header.toLowerCase())
        );
        if (match) detected.push(match.name);
      }

      resolve(detected.length ? detected.map(normalizeSecurityProductName) : []);
    });

    req.on('error', (err) => {
      console.warn(`Bot Manager header scan failed for ${domain}:`, err.message);
      resolve([]);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve([]);
    });

    req.end();
  });
}

async function analyzeSecurity(domain) {
  if (!domain || typeof domain !== 'string') return 'No website provided';

  const cleanDomain = domain.trim().replace(/^https?:\/\//, '');
  if (!DOMAIN_REGEX.test(cleanDomain)) return 'Invalid domain';

  try {
    const [wafResult, botResult] = await Promise.all([
      runWAFW00F(cleanDomain),
      detectBotManagerViaHeaders(cleanDomain),
    ]);

    const combined = [...new Set([...wafResult, ...botResult])];
    const filtered = combined.filter(item => item && item !== 'No WAF detected');

    return filtered.length ? filtered.join(', ') : 'No security solution detected';
  } catch (err) {
    console.error(`Unexpected error analyzing ${domain}:`, err);
    return 'Analysis failed';
  }
}

module.exports = analyzeSecurity;

const axios = require('axios');
const dns = require('dns').promises;

// Complete CDN/Hosting Provider Mapping (ASN → Clean Name)
const CDN_MAPPING = {
  'AS13335': 'Cloudflare',
  'AS209242': 'Cloudflare',
  'AS54113': 'Fastly',
  'AS14618': 'Amazon CloudFront',
  'AS16509': 'Amazon CloudFront',
  'AS19905': 'Amazon CloudFront',
  'AS20940': 'Akamai',
  'AS16625': 'Akamai',
  'AS19551': 'Imperva (Incapsula)',
  'AS18881': 'Imperva (Incapsula)',
  'AS396982': 'Google Cloud CDN',
  'AS15169': 'Google Cloud CDN',
  'AS8075': 'Microsoft Azure CDN',
  'AS8068': 'Microsoft Azure CDN',
  'AS20473': 'Linode',
  'AS21859': 'Zenlayer',
  'AS60626': 'StackPath',
  'AS18680': 'KeyCDN',
  'AS13649': 'G-Core Labs',
  'AS14061': 'DigitalOcean',
  'AS16276': 'OVH',
  'AS35540': 'BunnyCDN',
  'AS46606': 'Section.io',
  'AS60068': 'CDN77',
  'AS54825': 'PacketCDN',
  'AS26496': 'GoDaddy',
  'AS44273': 'HostGator',
  'AS55293': 'A2 Hosting',
  'AS32475': 'SingleHop',
  'AS30315': 'ColoCrossing',
  'AS13768': 'Peer1',
  'AS36351': 'SoftLayer',
  'AS21502': 'Canaca',
  'AS8560': 'Ionos',
  'AS22612': 'Namecheap',
  'AS7018': 'AT&T',
  'AS7922': 'Comcast',
  'AS36561': 'Sucuri',
  'AS18978': 'Enzu',
  'AS62567': 'NS1',
  'AS40034': 'Confluence'
};

// Keywords indicating self-hosting
const SELF_HOSTED_KEYWORDS = [
  'PRIVATE', 'DEDICATED', 'INTERNAL', 'CORPORATE',
  'ENTERPRISE', 'LOCAL', 'INTRANET'
];

// Common providers to keep as-is
const COMMON_PROVIDERS = [
  'IP PATHWAYS', 'LIQUID WEB', 'RACKSPACE',
  'DIGITALOCEAN', 'LINODE', 'VULTR', 'HETZNER', 'UPCLOUD'
];

// Legal suffixes to strip
const LEGAL_SUFFIXES = [
  'LLC', 'INC', 'LTD', 'CORP', 'CORPORATION',
  'LIMITED', 'GMBH', 'SA', 'S\\.A', 'PTY', 'PLC'
];

function cleanProviderName(rawName) {
  if (!rawName) return null;

  let cleanName = rawName.replace(/^AS\d+\s*/i, '');
  cleanName = cleanName
    .replace(new RegExp(`[,.]?\\s*(${LEGAL_SUFFIXES.join('|')})\\b\\.?`, 'gi'), '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const upper = cleanName.toUpperCase();
  if (SELF_HOSTED_KEYWORDS.some(k => upper.includes(k))) return 'Self Hosted';
  if (COMMON_PROVIDERS.some(p => upper.includes(p))) return cleanName;

  return 'Self Hosted';
}

async function fetchWithRetry(url, options = {}, retries = 3, delay = 1000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await axios.get(url, options);
    } catch (err) {
      const isLast = attempt === retries;

      // Retry only on timeout or network errors
      if (
        isLast ||
        !['ECONNABORTED', 'ETIMEDOUT'].includes(err.code) &&
        !(err.response && err.response.status >= 500)
      ) throw err;

      await new Promise(res => setTimeout(res, delay * attempt));
    }
  }
}

/**
 * Detects CDN for a given domain using IPInfo.io
 * @param {string} domain - Domain to scan
 * @param {string} token - IPInfo API Token
 * @param {boolean} verbose - Optional: log errors
 */
async function detectCDN(domain, token, verbose = false) {
  if (!token) return 'API Token Required';
  if (!domain) return 'No Domain Provided';

  try {
    const { address } = await dns.lookup(domain);
    if (!address) return 'DNS Lookup Failed';

    const url = `https://ipinfo.io/${address}?token=${token}`;
    const response = await fetchWithRetry(url, { timeout: 6000 });

    const { org, company } = response.data;
    const asn = org?.split(' ')[0];
    if (asn && CDN_MAPPING[asn]) return CDN_MAPPING[asn];

    const cleaned = cleanProviderName(org || company?.name);
    return cleaned || 'Unknown';

  } catch (err) {
    if (verbose) {
      console.error(`CDN detection failed for ${domain}:`, err.message);
    }

    if (err.code === 'ENOTFOUND') return 'DNS Lookup Failed';
    if (err.response?.status === 429) return 'API Rate Limit Exceeded';
    if (err.code === 'ECONNABORTED') return 'API Timeout';
    return 'Detection Failed';
  }
}

module.exports = detectCDN;

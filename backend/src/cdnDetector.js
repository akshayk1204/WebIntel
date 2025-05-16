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

const KNOWN_CDNS = [
  'Cloudflare', 'Fastly', 'Akamai', 'Amazon CloudFront', 'Google Cloud CDN',
  'Microsoft Azure CDN', 'Imperva', 'Sucuri', 'StackPath', 'CDN77',
  'G-Core Labs', 'KeyCDN', 'BunnyCDN', 'Section.io', 'Zenlayer', 'Linode',
  'DigitalOcean', 'OVH', 'GoDaddy', 'HostGator', 'A2 Hosting', 'SingleHop',
  'ColoCrossing', 'Peer1', 'SoftLayer', 'Canaca', 'Ionos', 'Namecheap',
  'NS1', 'Confluence'
];

// Normalize org string from IPInfo
function normalizeCdn(orgString) {
  if (!orgString || typeof orgString !== 'string') return 'Unknown';

  const asnMatch = orgString.match(/AS\d+/);
  if (asnMatch) {
    const asn = asnMatch[0];
    if (CDN_MAPPING[asn]) {
      return CDN_MAPPING[asn];
    }
  }

  // Remove ASN and legal suffixes
  let name = orgString.replace(/AS\d+\s*/g, '')
                      .replace(/(LLC|Inc\.?|Ltd\.?|GmbH|S\.A\.|Co\.)/gi, '')
                      .trim();

  // Try matching known CDNs
  const match = KNOWN_CDNS.find(cdn => name.toLowerCase().includes(cdn.toLowerCase()));
  if (match) return match;

  if (/vps|bare metal|dedicated/i.test(name)) return 'Self-hosted';

  return 'Unknown';
}

module.exports = {
  CDN_MAPPING,
  normalizeCdn
};

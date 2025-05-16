const axios = require('axios');
const dns = require('dns').promises;

const IPINFO_TOKEN = process.env.IPINFO_TOKEN; // put in .env and use dotenv

async function getCDNInfo(domain) {
  try {
    const { address } = await dns.lookup(domain.replace(/^https?:\/\//, ''));
    const response = await axios.get(`https://ipinfo.io/${address}?token=${IPINFO_TOKEN}`);
    const org = response.data.org || '';
    const cdnMatches = [];

    if (/cloudflare/i.test(org)) cdnMatches.push('Cloudflare');
    if (/akamai/i.test(org)) cdnMatches.push('Akamai');
    if (/fastly/i.test(org)) cdnMatches.push('Fastly');
    if (/google/i.test(org)) cdnMatches.push('Google CDN');
    if (/amazon|aws/i.test(org)) cdnMatches.push('Amazon CloudFront');
    if (/edgecast|verizon/i.test(org)) cdnMatches.push('Edgecast');

    return cdnMatches.length ? cdnMatches.join(', ') : 'Unknown';
  } catch (err) {
    console.error(`CDN detection failed for ${domain}: ${err.message}`);
    return 'Unknown';
  }
}

module.exports = { getCDNInfo };


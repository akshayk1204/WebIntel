const puppeteer = require('puppeteer');

const trafficCache = new Map();
const CACHE_TTL = 3600000; // 1 hour

function normalizeDomain(domain) {
  return domain.replace(/^(https?:\/\/)?(www\.)?/i, '').split('/')[0].toLowerCase();
}

function parseVisitCount(text) {
  if (!text) return null;

  const match = text.match(/([\d.,]+)\s*(M|K)?/i);
  if (!match) return null;

  let number = parseFloat(match[1].replace(/,/g, ''));
  const unit = match[2]?.toUpperCase();

  if (isNaN(number)) return null;
  if (unit === 'M') return Math.round(number * 1_000_000);
  if (unit === 'K') return Math.round(number * 1_000);
  return Math.round(number);
}

async function getHypestatTraffic(domain) {
  const cleanDomain = normalizeDomain(domain);

  const cached = trafficCache.get(cleanDomain);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const url = `https://hypestat.com/info/${cleanDomain}`;
  console.log(`🌐 Scraping Hypestat (headless) for: ${cleanDomain}`);

  try {
    const browser = await puppeteer.launch({
      headless: 'new', // Or true
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--single-process'
      ]
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
                            '(KHTML, like Gecko) Chrome/115.0 Safari/537.36');

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    const monthlyVisits = await page.evaluate(() => {
      const row = Array.from(document.querySelectorAll('td')).find(td =>
        td.textContent.trim() === 'Monthly Visits'
      );
      if (row && row.nextElementSibling) {
        return row.nextElementSibling.textContent.trim();
      }
      return null;
    });

    await browser.close();

    const parsedVisits = parseVisitCount(monthlyVisits);
    if (!parsedVisits) {
      console.warn(`⚠️ Monthly visits not found for ${cleanDomain}`);
      return null;
    }

    const result = {
      monthlyVisits: parsedVisits,
      source: 'Hypestat'
    };

    trafficCache.set(cleanDomain, {
      data: result,
      timestamp: Date.now()
    });

    return result;
  } catch (err) {
    console.error(`❌ Puppeteer error for ${cleanDomain}:`, err.message);
    return null;
  }
}

function formatTrafficData(data) {
  if (!data?.monthlyVisits) return 'No data available';

  const visits = data.monthlyVisits;
  const source = data.source;

  if (visits >= 1_000_000) {
    return `${(visits / 1_000_000).toFixed(1)}M/mo (${source})`;
  }
  if (visits >= 1_000) {
    return `${(visits / 1_000).toFixed(1)}K/mo (${source})`;
  }
  return `${visits}/mo (${source})`;
}

async function getTrafficData(domain) {
  const data = await getHypestatTraffic(domain);
  return formatTrafficData(data);
}

module.exports = {
  getHypestatTraffic,
  getTrafficData,
  formatTrafficData
};

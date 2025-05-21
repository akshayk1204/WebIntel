const axios = require('axios');
const https = require('https');
require('dotenv').config();

const axiosInstance = axios.create({
  baseURL: 'https://xranks.com/api/v1/',
  timeout: 15000,
  httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  headers: {
    'Authorization': process.env.XRANKS_API_KEY,
    'Accept': 'application/json'
  }
});

function extractVisitsFromAnyKey(obj) {
  if (!obj || typeof obj !== 'object') return null;

  for (const key of Object.keys(obj)) {
    const value = obj[key];
    
    // If key includes 'visits' and value looks like a number
    if (/visits/i.test(key) && (typeof value === 'number' || typeof value === 'string')) {
      const parsed = typeof value === 'string' 
        ? parseInt(value.replace(/,/g, '')) 
        : value;

      if (!isNaN(parsed)) return parsed;
    }

    // Recursively check nested objects
    if (typeof value === 'object') {
      const nested = extractVisitsFromAnyKey(value);
      if (nested !== null) return nested;
    }
  }

  return null;
}

async function getXranksTraffic(domain) {
  const cleanDomain = domain.replace(/^(https?:\/\/)?(www\.)?/, '');
  
  try {
    console.log(`🌐 Fetching XRanks data for: ${cleanDomain}`);
    
    const response = await axiosInstance.get('domain/rank', {
      params: { domain: cleanDomain }
    });

    const data = response.data;
    
    // Try to find visits or estimated daily users, fallback to rank if nothing else
    let monthlyVisits = null;

    if (data.estimated_daily_users) {
      monthlyVisits = data.estimated_daily_users * 30; // rough monthly estimate
    }

    // If no visits or daily users, optionally use rank as a proxy (not visits)
    if (!monthlyVisits && data.rank) {
      monthlyVisits = null;  // or keep null, since rank is not visits
    }

    if (!monthlyVisits) {
      console.error('Monthly visits not found or zero in XRanks data:', data);
      return null;
    }

    return {
      monthlyVisits,
      source: 'XRanks'
    };
  } catch (error) {
    console.error(`❌ XRanks API failed for ${cleanDomain}:`, {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    return null;
  }
}



// Cache implementation
const trafficCache = new Map();
const CACHE_TTL = 3600000; // 1 hour

async function getTrafficData(domain) {
  const cacheKey = domain.toLowerCase();
  
  if (trafficCache.has(cacheKey)) {
    const cached = trafficCache.get(cacheKey);
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
  }

  const result = await getXranksTraffic(domain);
  if (result) {
    trafficCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });
  }
  return result;
}

function formatTrafficData(data) {
  if (!data?.monthlyVisits) return 'No data available';
  
  if (data.monthlyVisits >= 1000000) {
    return `${(data.monthlyVisits/1000000).toFixed(1)}M/mo (${data.source})`;
  }
  if (data.monthlyVisits >= 1000) {
    return `${(data.monthlyVisits/1000).toFixed(1)}K/mo (${data.source})`;
  }
  return `${data.monthlyVisits}/mo (${data.source})`;
}

module.exports = {
  getTrafficData,
  formatTrafficData
};
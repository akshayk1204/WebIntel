require('dotenv').config(); // Load environment variables from .env

console.log('📦 Loaded XRANKS_API_KEY:', process.env.XRANKS_API_KEY);

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const morgan = require('morgan');
const axios = require('axios');
const { exec } = require('child_process');
const dns = require('dns').promises;

const analyzeSpreadsheet = require('./src/analyzeSpreadsheet');

const IPINFO_TOKEN = process.env.IPINFO_API_KEY;
const PORT = process.env.PORT || 5050;

const app = express();
app.use(morgan('dev'));
app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

process.on('unhandledRejection', reason => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});

process.on('uncaughtException', err => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

// Strip ANSI codes from CLI output
function stripAnsiCodes(str) {
  if (!str || typeof str !== 'string') return str;
  return str.replace(/\u001b\[[0-9;]*m/g, '');
}

// Map common org names to known CDN providers
function normalizeCdn(orgString) {
  const mapping = {
    cloudflare: 'Cloudflare',
    akamai: 'Akamai',
    fastly: 'Fastly',
    google: 'Google Cloud CDN',
    amazon: 'Amazon CloudFront',
    edgecast: 'Edgecast',
    stackpath: 'StackPath',
    microsoft: 'Azure CDN',
    bunny: 'BunnyCDN',
    quiccloud: 'QuicCloud',
    imperva: 'Imperva',
    leaseweb: 'Leaseweb',
    cdnetworks: 'CDNetworks',
    limelight: 'Limelight',
    incapsula: 'Incapsula'
  };

  const lower = orgString.toLowerCase();
  for (const keyword in mapping) {
    if (lower.includes(keyword)) {
      return mapping[keyword];
    }
  }
  return 'Unknown';
}

// IPInfo-based CDN detection
async function getCdnInfo(ip) {
  try {
    const url = `https://ipinfo.io/${ip}/json?token=${IPINFO_TOKEN}`;
    const response = await axios.get(url);
    if (response.data && response.data.org) {
      return normalizeCdn(response.data.org);
    }
    return 'Unknown';
  } catch (error) {
    console.error('IPInfo API error:', error.message);
    return 'Unknown';
  }
}

// wafw00f-based WAF detection
function getWafInfo(domain) {
  return new Promise((resolve) => {
    exec(`wafw00f http://${domain}`, { timeout: 15000 }, (error, stdout) => {
      console.log('✅ wafw00f stdout:\n', stdout);

      if (error) {
        console.error('❌ wafw00f error:', error.message);
        return resolve('Unknown');
      }

      const wafMatch = stdout.match(/is behind ([^(]+)\s*\(/i);
      if (wafMatch && wafMatch[1]) {
        return resolve(wafMatch[1].trim());
      }

      if (stdout.includes('No WAF detected')) {
        return resolve('None detected');
      }

      return resolve('Unknown');
    });
  });
}

// GET status
app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', message: 'WebIntel backend is running' });
});

// POST bulk spreadsheet analysis
app.post('/api/analyze', upload.single('file'), async (req, res) => {
  try {
    const inputPath = req.file.path;
    const outputPath = await analyzeSpreadsheet(inputPath, IPINFO_TOKEN);

    res.download(outputPath, 'WebIntel_Results.xlsx', err => {
      if (err) {
        console.error('Error sending file:', err);
        if (!res.headersSent) {
          res.status(500).send('Failed to send file');
        }
      }

      // Cleanup temp files
      fs.unlink(inputPath, err => err && console.error('Error deleting input file:', err));
      fs.unlink(outputPath, err => err && console.error('Error deleting output file:', err));
    });
  } catch (err) {
    console.error('❌ Error processing spreadsheet:', err);
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Failed to process spreadsheet',
        details: err.message || String(err)
      });
    }
  }
});

// GET ad hoc domain analysis
app.get('/api/analyze/domain', async (req, res) => {
  let domain = req.query.domain;

  if (!domain) {
    return res.status(400).json({ error: 'Domain parameter is required' });
  }

  try {
    // Normalize domain
    domain = domain.toLowerCase().trim()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/$/, '');

    // Resolve domain to IP
    const resolved = await dns.resolve4(domain);
    if (!resolved || resolved.length === 0) {
      return res.status(400).json({ error: 'Unable to resolve domain IP' });
    }

    const ip = resolved[0];
    const [cdnRaw, wafRaw] = await Promise.all([
      getCdnInfo(ip),
      getWafInfo(domain)
    ]);

    const cdn = stripAnsiCodes(cdnRaw);
    const waf = stripAnsiCodes(wafRaw);

    return res.json({ cdn, waf });
  } catch (error) {
    console.error('Error analyzing domain:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});

require('dotenv').config(); // Load environment variables from .env

const IPINFO_TOKEN = process.env.IPINFO_API_KEY;

(async () => {
  try {
    // Global error handlers
    process.on('unhandledRejection', (reason) => {
      console.error('Unhandled Rejection:', reason);
      process.exit(1);
    });

    process.on('uncaughtException', err => {
      console.error('Uncaught Exception:', err);
      process.exit(1);
    });

    // Core modules
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

    const app = express();
    const PORT = process.env.PORT || 5050;

    app.use(morgan('dev'));
    app.use(cors());
    app.use(express.json());

    const upload = multer({ dest: 'uploads/' });

    app.get('/api/status', (req, res) => {
      res.json({ status: 'ok', message: 'WebIntel backend is running' });
    });

    // Bulk spreadsheet analysis route
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
          // Clean up temp files
          fs.unlink(inputPath, err => err && console.error('Error deleting input file:', err));
          fs.unlink(outputPath, err => err && console.error('Error deleting output file:', err));
        });
      } catch (err) {
        console.error('Error processing spreadsheet:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to process spreadsheet' });
        }
      }
    });

    // Helper: Normalize organization string into known CDN
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

    // Get CDN info from IPInfo API
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

    // Run wafw00f to detect WAF
    function getWafInfo(domain) {
      return new Promise((resolve) => {
        const target = `https://${domain}`;
        exec(`npx wafw00f ${target}`, { timeout: 10000 }, (error, stdout, stderr) => {
          if (error) {
            console.error(`❌ wafw00f exec error: ${error.message}`);
            return resolve('Unknown');
          }
    
          console.log('✅ wafw00f stdout:\n', stdout);  // Debug only; remove in prod
    
          const match =
            stdout.match(/is behind a\s+(.+?)\s+Web Application Firewall/i) ||
            stdout.match(/Generic detection:\s*(.+)/i);
    
          if (match && match[1]) {
            return resolve(match[1].trim());
          }
    
          return resolve('None detected');
        });
      });
    }
    

    // Ad hoc domain analysis route
    app.get('/api/analyze/domain', async (req, res) => {
      let domain = req.query.domain;

      if (!domain) {
        return res.status(400).json({ error: 'Domain parameter is required' });
      }

      try {
        // Normalize domain
        domain = domain.toLowerCase().trim();
        domain = domain.replace(/^https?:\/\//, '');
        domain = domain.replace(/^www\./, '');
        domain = domain.replace(/\/$/, '');

        // Resolve domain to public IP
        const resolved = await dns.resolve4(domain);
        if (!resolved || resolved.length === 0) {
          return res.status(400).json({ error: 'Unable to resolve domain IP' });
        }
        const ip = resolved[0];

        const cdn = await getCdnInfo(ip);
        const waf = await getWafInfo(domain);

        // Optional debug logging
        // console.log(`Resolved IP for ${domain}: ${ip}`);
        // console.log(`CDN: ${cdn}, WAF: ${waf}`);

        return res.json({ cdn, waf });
      } catch (error) {
        console.error('Error analyzing domain:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });

    app.listen(PORT, () => {
      console.log(`✅ Server is running on port ${PORT}`);
    });
  } catch (err) {
    console.error('🔥 Top-level error during server startup:', err);
    process.exit(1);
  }
})();

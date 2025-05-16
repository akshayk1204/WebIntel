require('dotenv').config(); // Load environment variables from .env

const IPINFO_TOKEN = process.env.IPINFO_API_KEY;

(async () => {
  try {
    // Global error handlers
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection:', reason);
      // Consider not exiting in prod — adjust if needed
      process.exit(1);
    });

    process.on('uncaughtException', err => {
      console.error('Uncaught Exception:', err);
      // Consider not exiting in prod — adjust if needed
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

    const analyzeSpreadsheet = require('./src/analyzeSpreadsheet'); // Your spreadsheet logic

    const app = express();
    const PORT = process.env.PORT || 5050;

    app.use(morgan('dev'));
    app.use(cors());
    app.use(express.json());

    const upload = multer({ dest: 'uploads/' });

    app.get('/api/status', (req, res) => {
      res.json({ status: 'ok', message: 'WebIntel backend is running' });
    });

    // Bulk spreadsheet upload analysis route
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
          fs.unlink(inputPath, unlinkErr => {
            if (unlinkErr) console.error('Error deleting input file:', unlinkErr);
          });
          fs.unlink(outputPath, unlinkErr => {
            if (unlinkErr) console.error('Error deleting output file:', unlinkErr);
          });
        });
      } catch (err) {
        console.error('Error processing spreadsheet:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to process spreadsheet' });
        }
      }
    });

    // Helper: Get CDN info from IPInfo API (pass IP, not domain)
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


// Helper: Run wafw00f CLI tool to detect WAF on domain
    function getWafInfo(domain) {
      return new Promise((resolve) => {
        exec(`wafw00f ${domain}`, (error, stdout, stderr) => {
          if (error) {
            console.error(`wafw00f exec error: ${error.message}`);
            return resolve('Unknown');
          }

          if (stderr) {
            console.error(`wafw00f stderr: ${stderr}`);
          }

          // Look for any WAF detection line
          const lines = stdout.split('\n');
          for (const line of lines) {
            const match = line.match(/Reason:\s*(.*)\s*\(/i);
            if (match && match[1]) {
              return resolve(match[1].trim());
            }
          }

          // Fallback: Legacy output
          const alt = lines.find((line) =>
            line.toLowerCase().includes('waf detected')
          );
          if (alt) {
            const wafName = alt.split(':')[1]?.trim() || 'Unknown';
            return resolve(wafName);
          }

          return resolve('None detected');
        });
      });
    }


    // Adhoc domain analysis route - normalize domain, resolve IP, detect CDN + WAF
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

        // Resolve domain to IP
        const ips = await dns.lookup(domain);

        if (!ips || !ips.address) {
          return res.status(400).json({ error: 'Unable to resolve domain IP' });
        }

        // Get CDN info using IP
        const cdn = await getCdnInfo(ips.address);
        // Get WAF info using domain name
        const waf = await getWafInfo(domain);

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


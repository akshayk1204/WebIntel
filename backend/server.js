require('dotenv').config(); // Load environment variables from .env

const IPINFO_TOKEN = process.env.IPINFO_API_KEY; // Grab API key

(async () => {
  try {
    // Global error handlers
    process.on('unhandledRejection', (reason, promise) => {
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
    const analyzeSpreadsheet = require('./src/analyzeSpreadsheet'); // Ensure this file exists

    const app = express();
    const PORT = process.env.PORT || 5050;

    app.use(morgan('dev'));
    app.use(cors());
    app.use(express.json());

    const upload = multer({ dest: 'uploads/' });

    app.post('/api/analyze', upload.single('file'), async (req, res) => {
      try {
        const inputPath = req.file.path;
        const outputPath = await analyzeSpreadsheet(inputPath, IPINFO_TOKEN); // pass token to logic
        res.download(outputPath, 'WebIntel_Results.xlsx', err => {
          if (err) {
            console.error('Error sending file:', err);
            res.status(500).send('Failed to send file');
          }
          fs.unlinkSync(inputPath);
          fs.unlinkSync(outputPath);
        });
      } catch (err) {
        console.error('Error processing spreadsheet:', err);
        res.status(500).json({ error: 'Failed to process spreadsheet' });
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

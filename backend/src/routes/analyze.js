const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const { getCDNInfo } = require('../utils/cdn');
const { getSecurityInfo } = require('../utils/security');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.post('/', upload.single('file'), async (req, res) => {
  try {
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet, { defval: '' });

    const updatedData = [];

    for (const row of data) {
      const domain = Object.values(row)[0]; // assume first column is URL
      if (!domain || typeof domain !== 'string') continue;

      const cdn = await getCDNInfo(domain);
      const security = await getSecurityInfo(domain);

      updatedData.push({
        ...row,
        CDN: cdn,
        Security: security
      });
    }

    // Delete temp file
    fs.unlinkSync(req.file.path);

    res.json({ data: updatedData, headers: [...Object.keys(data[0]), 'CDN', 'Security'] });
  } catch (err) {
    console.error('Error in /analyze:', err.message);
    res.status(500).json({ error: 'Failed to process the spreadsheet' });
  }
});

module.exports = router;


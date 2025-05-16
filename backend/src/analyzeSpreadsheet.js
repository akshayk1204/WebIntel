const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');
const detectCDN = require('./cdnDetector');
const analyzeSecurity = require('./securityAnalyzer');

function isLikelyUrl(value) {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  return (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    /^[\w-]+\.[\w.-]+$/.test(trimmed) // basic domain pattern like example.com
  );
}

function findWebsiteColumn(row) {
  for (const key of Object.keys(row)) {
    if (isLikelyUrl(row[key])) {
      return key;
    }
  }
  return null;
}

async function analyzeSpreadsheet(inputPath, ipinfoToken) {
  const workbook = xlsx.readFile(inputPath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const jsonData = xlsx.utils.sheet_to_json(worksheet, { defval: '' });

  if (jsonData.length === 0) {
    throw new Error('The spreadsheet is empty.');
  }

  // Detect website column dynamically from the first data row
  const websiteColumn = findWebsiteColumn(jsonData[0]);

  if (!websiteColumn) {
    throw new Error('No website URL found in any column.');
  }

  const updatedData = await Promise.all(
    jsonData.map(async (row) => {
      const rawUrl = (row[websiteColumn] || '').trim();

      if (!rawUrl) {
        return { ...row, CDN: 'No Website Provided', Security: 'No Website Provided' };
      }

      try {
        const domain = new URL(
          rawUrl.startsWith('http') ? rawUrl : `http://${rawUrl}`
        ).hostname;

        console.log(`📡 Detecting CDN for ${domain} using token: ${ipinfoToken}`);

        const [cdn, security] = await Promise.all([
          detectCDN(domain, ipinfoToken),
          analyzeSecurity(domain),
        ]);

        return { ...row, CDN: cdn, Security: security };
      } catch (err) {
        console.error(`Error analyzing ${rawUrl}:`, err);
        return { ...row, CDN: 'Invalid URL', Security: 'Invalid URL' };
      }
    })
  );

  const newSheet = xlsx.utils.json_to_sheet(updatedData);
  const newWorkbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(newWorkbook, newSheet, 'Results');

  const outputPath = path.join(__dirname, '../output', `analyzed-${Date.now()}.xlsx`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  xlsx.writeFile(newWorkbook, outputPath);

  return outputPath;
}

module.exports = analyzeSpreadsheet;

const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');
const pLimit = require('p-limit');
const detectCDN = require('./cdnDetector');
const analyzeSecurity = require('./securityAnalyzer');

function isLikelyUrl(value) {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  return (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    /^[\w-]+\.[\w.-]+$/.test(trimmed)
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

  const websiteColumn = findWebsiteColumn(jsonData[0]);
  if (!websiteColumn) {
    throw new Error('No website URL found in any column.');
  }

  const limit = pLimit(5); // Max 5 concurrent analyses

  const tasks = jsonData.map((row) =>
    limit(async () => {
      const rawUrl = (row[websiteColumn] || '').trim();

      if (!rawUrl) {
        return { ...row, CDN: 'No Website Provided', Security: 'No Website Provided' };
      }

      let domain;
      try {
        domain = new URL(rawUrl.startsWith('http') ? rawUrl : `http://${rawUrl}`).hostname;
      } catch (err) {
        console.error(`❌ Invalid URL: ${rawUrl}`);
        return { ...row, CDN: 'Invalid URL', Security: 'Invalid URL' };
      }

      console.log(`📡 Detecting CDN for ${domain} using token: ${ipinfoToken}`);

      let cdn = 'Error', security = 'Error';

      try {
        cdn = await detectCDN(domain, ipinfoToken);
      } catch (err) {
        console.error(`❌ CDN detection failed for ${domain}:`, err.message);
        cdn = 'CDN Detection Error';
      }

      try {
        security = await analyzeSecurity(domain);
      } catch (err) {
        console.error(`❌ Security analysis failed for ${domain}:`, err.message);
        security = 'Security Analysis Error';
      }

      return { ...row, CDN: cdn, Security: security };
    })
  );

  const updatedData = await Promise.all(tasks);

  console.log('✅ Finished all lookups, writing result file...');

  const newSheet = xlsx.utils.json_to_sheet(updatedData);
  const newWorkbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(newWorkbook, newSheet, 'Results');

  const outputPath = path.join(__dirname, '../output', `analyzed-${Date.now()}.xlsx`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  xlsx.writeFile(newWorkbook, outputPath);

  console.log(`✅ Results saved to ${outputPath}`);
  return outputPath;
}

module.exports = analyzeSpreadsheet;

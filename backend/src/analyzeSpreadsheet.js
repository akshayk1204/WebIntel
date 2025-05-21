const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');
const pLimit = require('p-limit').default;
const { detectCDN } = require('./cdnDetector');
const analyzeSecurity = require('./securityAnalyzer');
const { getTrafficData, formatTrafficData } = require('./trafficAnalyzer');

// Constants
const MAX_CONCURRENT_REQUESTS = 5;
const ANALYSIS_TIMEOUT = 15000; // 15 seconds
const OUTPUT_DIR = path.join(__dirname, '../output');

// Helper Functions
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
  return Object.keys(row).find(key => isLikelyUrl(row[key])) || null;
}

function sanitizeDomain(rawUrl) {
  try {
    return new URL(rawUrl.startsWith('http') ? rawUrl : `http://${rawUrl}`).hostname;
  } catch {
    return null;
  }
}

function withTimeout(promise, ms, timeoutMessage) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(timeoutMessage));
      }, ms);
      // Make sure we clean up the timer
      promise.finally(() => clearTimeout(timer));
    })
  ]);
}

async function analyzeDomain(domain, ipinfoToken) {
  const results = {
    cdn: 'Error',
    security: 'Error',
    traffic: 'Error'
  };

  try {
    // CDN Detection with timeout
    results.cdn = await withTimeout(
      detectCDN(domain, ipinfoToken),
      ANALYSIS_TIMEOUT,
      'CDN detection timeout'
    );
    console.log(`✅ CDN: ${results.cdn}`);
  } catch (err) {
    console.error(`❌ CDN detection failed for ${domain}:`, err.message);
    results.cdn = `CDN: ${err.message.includes('timeout') ? 'Timeout' : 'Error'}`;
  }

  try {
    // Security Analysis with timeout
    results.security = await withTimeout(
      analyzeSecurity(domain),
      ANALYSIS_TIMEOUT,
      'Security analysis timeout'
    );
    console.log(`✅ Security: ${results.security}`);
  } catch (err) {
    console.error(`❌ Security analysis failed for ${domain}:`, err.message);
    results.security = `Security: ${err.message.includes('timeout') ? 'Timeout' : 'Error'}`;
  }

  try {
    // Traffic Analysis with timeout
    const trafficData = await withTimeout(
      getTrafficData(domain),
      ANALYSIS_TIMEOUT,
      'Traffic analysis timeout'
    );
    results.traffic = formatTrafficData(trafficData);
    console.log(`✅ Traffic: ${results.traffic}`);
  } catch (err) {
    console.error(`❌ Traffic analysis failed for ${domain}:`, err.message);
    results.traffic = `Traffic: ${err.message.includes('timeout') ? 'Timeout' : 'Error'}`;
  }

  return results;
}

// Main Function
async function analyzeSpreadsheet(inputPath, ipinfoToken) {
  console.log('📥 Reading file:', inputPath);
  console.log('🔑 IPInfo token received:', !!ipinfoToken);

  // Initialize output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Load workbook
  let workbook;
  try {
    workbook = xlsx.readFile(inputPath);
    console.log('✅ Workbook loaded');
  } catch (err) {
    console.error('❌ Failed to read spreadsheet:', err.message);
    throw new Error('Failed to parse spreadsheet. Ensure it is a valid .xlsx file.');
  }

  const sheetName = workbook.SheetNames[0];
  console.log('📝 First sheet name:', sheetName);

  const worksheet = workbook.Sheets[sheetName];
  const jsonData = xlsx.utils.sheet_to_json(worksheet, { defval: '' });
  console.log(`📊 Parsed ${jsonData.length} rows`);

  if (jsonData.length === 0) {
    throw new Error('The spreadsheet is empty.');
  }

  const websiteColumn = findWebsiteColumn(jsonData[0]);
  console.log('🔍 Detected website column:', websiteColumn);

  if (!websiteColumn) {
    throw new Error('No website URL found in any column.');
  }

  const limit = pLimit(MAX_CONCURRENT_REQUESTS);
  const startTime = Date.now();

  // Process all rows
  const tasks = jsonData.map((row, index) =>
    limit(async () => {
      const rowNumber = index + 2; // +2 for header row and 0-based index
      const rawUrl = (row[websiteColumn] || '').trim();

      if (!rawUrl) {
        console.log(`⚠️ Row ${rowNumber}: No URL provided`);
        return { 
          ...row, 
          CDN: 'No Website Provided', 
          Security: 'No Website Provided',
          Traffic: 'No Website Provided'
        };
      }

      const domain = sanitizeDomain(rawUrl);
      if (!domain) {
        console.error(`❌ Row ${rowNumber}: Invalid URL: ${rawUrl}`);
        return { 
          ...row, 
          CDN: 'Invalid URL', 
          Security: 'Invalid URL',
          Traffic: 'Invalid URL'
        };
      }

      console.log(`🌐 Row ${rowNumber}: Analyzing domain: ${domain}`);
      
      try {
        const { cdn, security, traffic } = await analyzeDomain(domain, ipinfoToken);
        return { 
          ...row, 
          CDN: cdn,
          Security: security,
          Traffic: traffic
        };
      } catch (err) {
        console.error(`❌ Row ${rowNumber}: Analysis failed for ${domain}:`, err.message);
        return { 
          ...row, 
          CDN: 'Analysis Error', 
          Security: 'Analysis Error',
          Traffic: 'Analysis Error'
        };
      }
    })
  );

  const updatedData = await Promise.all(tasks);

  // Generate output filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputFilename = `analysis-results-${timestamp}.xlsx`;
  const outputPath = path.join(OUTPUT_DIR, outputFilename);

  // Save results
  try {
    const newSheet = xlsx.utils.json_to_sheet(updatedData);
    const newWorkbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(newWorkbook, newSheet, 'Results');
    xlsx.writeFile(newWorkbook, outputPath);
    
    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Analysis completed in ${elapsedTime}s`);
    console.log(`📊 Results saved to: ${outputPath}`);
    
    return outputPath;
  } catch (err) {
    console.error('❌ Failed to write results file:', err.message);
    throw new Error('Failed to save analysis results');
  }
}

module.exports = analyzeSpreadsheet;
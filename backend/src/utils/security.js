const { exec } = require('child_process');

function getSecurityInfo(domain) {
  return new Promise((resolve) => {
    const cleanDomain = domain.replace(/^https?:\/\//, '');
    const command = `waafw00f ${cleanDomain}`;

    exec(command, { timeout: 10000 }, (error, stdout, stderr) => {
      if (error) {
        console.error(`WaafW00f failed for ${domain}: ${error.message}`);
        return resolve('Unknown');
      }

      const lines = stdout.split('\n');
      const found = lines.filter(line =>
        line.includes('is behind') || line.includes('identified as')
      ).map(line => line.replace(/.*is behind|identified as/i, '').trim());

      resolve(found.length ? found.join(', ') : 'None');
    });
  });
}

module.exports = { getSecurityInfo };


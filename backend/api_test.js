const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const fs = require('fs');

async function test() {
  const url = 'https://artemis.cdnspace.ca/api/all';
  const log = [];
  log.push(`Testing fetch to: ${url}`);
  
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    });
    log.push(`Status: ${resp.status} ${resp.statusText}`);
    const data = await resp.json();
    log.push(`Data keys: ${Object.keys(data).join(', ')}`);
    log.push(`Telemetry speed: ${data.telemetry?.speedKmH}`);
  } catch (err) {
    log.push(`Error: ${err.message}`);
    log.push(`Stack: ${err.stack}`);
  }
  
  fs.writeFileSync('api_test_results.txt', log.join('\n'));
}

test();

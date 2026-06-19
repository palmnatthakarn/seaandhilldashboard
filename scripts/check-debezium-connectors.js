const http = require('http');

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://147.50.69.68:8083${path}`, (r) => {
      let d = '';
      r.on('data', (c) => { d += c; });
      r.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

async function main() {
  const connectors = await get('/connectors');
  console.log('\n=== Debezium Connectors ===');
  console.log(connectors);

  for (const name of connectors) {
    const status = await get(`/connectors/${name}/status`);
    const state = status.connector?.state;
    const taskState = status.tasks?.[0]?.state;
    console.log(`\n[${name}] connector=${state} task=${taskState}`);
  }
}

main().catch(console.error);

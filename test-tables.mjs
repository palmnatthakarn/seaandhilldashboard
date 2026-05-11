import { createClient } from '@clickhouse/client';
const ch = createClient({ url: 'http://103.13.30.32:8123', username: 'changsiam', password: 'n300sJzuR0ArXpbo', database: 'datachangsiam' });

// ดูตารางทั้งหมด
const r1 = await ch.query({ query: `SHOW TABLES`, format: 'JSONEachRow' });
const tables = await r1.json();
console.log('ALL TABLES:');
tables.forEach(t => console.log(' -', t.name));

// ค้นหาตารางที่เกี่ยวกับ inventory movement
const inventoryTables = tables.filter(t => 
  t.name.includes('inventory') || t.name.includes('stock') || t.name.includes('movement')
);
console.log('\nInventory/Stock tables:');
inventoryTables.forEach(t => console.log(' -', t.name));

// ดู columns ของ stock_transaction
const r2 = await ch.query({ query: `DESCRIBE TABLE stock_transaction`, format: 'JSONEachRow' });
const cols = await r2.json();
console.log('\nstock_transaction columns:');
cols.forEach(c => console.log(` - ${c.name}: ${c.type}`));

await ch.close();

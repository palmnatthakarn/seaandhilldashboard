const fs = require('fs');
const path = require('path');
const { createClient } = require('@clickhouse/client');

const DEFAULT_CONFIG_PATH = 'D:\\connect\\smlaiconnect-windows-v1.2.6 - B000 - 69 ver SAH\\connect.json';

function readConfig(configPath = process.env.SMLAI_CONNECT_CONFIG || DEFAULT_CONFIG_PATH) {
  const resolved = path.resolve(configPath);
  return {
    path: resolved,
    data: JSON.parse(fs.readFileSync(resolved, 'utf8')),
  };
}

function clickhouseUrl(clickhouse) {
  const host = String(clickhouse.host || '').replace(/^https?:\/\//, '');
  const protocol = clickhouse.secure ? 'https' : 'http';
  const port = clickhouse.http_port || 8123;
  return `${protocol}://${host}:${port}`;
}

function createClickHouse(config) {
  return createClient({
    url: clickhouseUrl(config.clickhouse),
    username: config.clickhouse.user,
    password: config.clickhouse.password,
    database: config.clickhouse.database,
    request_timeout: 300000,
  });
}

async function queryRows(ch, query, query_params = {}) {
  const result = await ch.query({
    query,
    query_params,
    format: 'JSONEachRow',
  });
  return result.json();
}

async function tableExists(ch, table) {
  const rows = await queryRows(ch, 'EXISTS TABLE {table:Identifier}', { table });
  return Number(rows[0]?.result || 0) === 1;
}

async function getCreateTable(ch, table) {
  const rows = await queryRows(ch, 'SHOW CREATE TABLE {table:Identifier}', { table });
  return rows[0]?.statement || rows[0]?.['CREATE TABLE'] || '';
}

async function getColumns(ch, table) {
  return queryRows(ch, 'DESCRIBE TABLE {table:Identifier}', { table });
}

function branchSyncExpr() {
  return `multiIf(
    position(_topic, 'branch_000.') > 0, 'b000',
    position(_topic, 'branch_001.') > 0, 'b001',
    position(_topic, 'branch_002.') > 0, 'b002',
    position(_topic, 'branch_003.') > 0, 'b003',
    position(_topic, 'branch_004.') > 0, 'b004',
    position(_topic, 'branch_005.') > 0, 'b005',
    ''
  )`;
}

function branchNameExpr() {
  return `multiIf(
    position(_topic, 'branch_000.') > 0, 'บริษัท ช้าง สยาม กัมปนี จำกัด',
    position(_topic, 'branch_001.') > 0, 'บริษัท ช้างสยามรวย จำกัด',
    position(_topic, 'branch_002.') > 0, 'บริษัท ช้าง ทรัพย์ ทวี จำกัด',
    position(_topic, 'branch_003.') > 0, 'บริษัท ชาวทะเลเฮฮา จำกัด',
    position(_topic, 'branch_004.') > 0, 'บริษัท ดีจิงจัง 5665 จำกัด',
    position(_topic, 'branch_005.') > 0, 'บริษัท ฮอมฮัก จำกัด',
    ''
  )`;
}

module.exports = {
  branchNameExpr,
  branchSyncExpr,
  createClickHouse,
  getColumns,
  getCreateTable,
  queryRows,
  readConfig,
  tableExists,
};

const { spawnSync } = require('child_process');

const APPLY = process.argv.includes('--apply');

const CONFIGS = [
  'D:\\connect\\smlaiconnect-windows-v1.2.6 - B000 - 69 ver SAH\\connect.json',
  'D:\\connect\\smlaiconnect-windows-v1.2.6 - B001 - 69 - SAH\\connect.json',
  'D:\\connect\\smlaiconnect-windows-v1.2.6 - B002 - 69 - SAH\\connect.json',
  'D:\\connect\\smlaiconnect-windows-v1.2.6 - B003 - 69 - SAH\\connect.json',
  'D:\\connect\\smlaiconnect-windows-v1.2.6 - B004 - 69 - SAH\\connect.json',
  'D:\\connect\\smlaiconnect-windows-v1.2.6 - B005\\connect.json',
];

console.log(APPLY ? 'APPLY ALL MODE' : 'DRY RUN ALL MODE - pass --apply to change ClickHouse');

for (const configPath of CONFIGS) {
  console.log('\n============================================================');
  console.log(configPath);
  console.log('============================================================');

  const args = ['scripts\\repair-cdc-b000.js', configPath];
  if (APPLY) args.push('--apply');

  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: false,
  });

  if (result.status !== 0) {
    console.error(`Failed: ${configPath}`);
    process.exitCode = result.status || 1;
    break;
  }
}

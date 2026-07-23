import { dispatchDailySummary } from '../src/lib/data/notifications';
import { runWithRequestContext } from '../src/lib/request-context';

async function main() {
  console.log('Triggering daily summary...');
  const result = await runWithRequestContext({ skipBranchAuth: true }, async () => dispatchDailySummary());
  console.log('Result:', JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});

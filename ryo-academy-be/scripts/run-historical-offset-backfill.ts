import { DatabaseService } from '../src/database/database.service.js';
import { HistoricalOffsetBackfillService } from '../src/admission/installment/historical-offset-backfill.service.js';
import { randomUUID } from 'node:crypto';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('FATAL: DATABASE_URL environment variable is required.');
    process.exit(1);
  }

  const db = new DatabaseService({ getOrThrow: () => databaseUrl } as any);
  await db.$connect();

  const maintenanceLockKey = 55432001;
  const migrationRunId = `run-${randomUUID()}`;

  console.log(`========================================================================`);
  console.log(`STARTING HISTORICAL OFFSET BACKFILL RUNNER [${migrationRunId}]`);
  console.log(`========================================================================`);

  try {
    // 1. Acquire global financial maintenance advisory lock
    console.log('1. Acquiring financial maintenance advisory lock...');
    await db.$executeRawUnsafe(`SELECT pg_advisory_lock(${maintenanceLockKey});`);
    console.log('   Advisory lock acquired successfully.');

    // 2. Instantiate backfill service and run
    console.log('2. Running historical offset backfill and interval validation across all schedules...');
    const backfillService = new HistoricalOffsetBackfillService(db);
    const summary = await backfillService.runBackfill(migrationRunId, databaseUrl);

    console.log('3. Backfill completed successfully!');
    console.log(`   - Schedules processed: ${summary.schedulesProcessed}`);
    console.log(`   - Installments updated: ${summary.installmentsBackfilled}`);
    console.log(`   - Exceptions encountered: ${summary.exceptionsEncountered}`);
    console.log(`========================================================================\n`);

  } catch (err: any) {
    console.error(`FATAL: Historical offset backfill failed: ${err.message ?? err}`);
    if (err.stack) console.error(err.stack);
    process.exitCode = 1;
  } finally {
    try {
      console.log('Releasing financial maintenance advisory lock...');
      await db.$executeRawUnsafe(`SELECT pg_advisory_unlock(${maintenanceLockKey});`);
      console.log('Advisory lock released.');
    } catch (lockErr) {
      console.error('Warning: Error releasing advisory lock:', lockErr);
    }
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error('Unhandled backfill runner exception:', err);
  process.exit(1);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Mandatory QA Database Identity Guard for Ryo Academy.
 * Validates environment isolation, connected PostgreSQL server attributes,
 * and cluster instance ownership before any test mutations occur.
 */
export async function assertQaDatabase(db: { $queryRaw: Function }): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_DATABASE_URL;
  const token = process.env.QA_HARNESS_INSTANCE_TOKEN;
  const expectedDataDir = process.env.QA_HARNESS_DATA_DIR;

  // 1. Mandatory Environment URL Checks
  assert.ok(dbUrl, 'DATABASE_URL is required and must not be empty.');
  assert.ok(directUrl, 'DIRECT_DATABASE_URL is required and must not be empty.');
  assert.ok(
    !dbUrl.includes('neon.tech'),
    'CRITICAL SAFETY VIOLATION: DATABASE_URL points to Neon or remote database.',
  );
  assert.ok(
    !directUrl.includes('neon.tech'),
    'CRITICAL SAFETY VIOLATION: DIRECT_DATABASE_URL points to Neon or remote database.',
  );

  const parsedDb = new URL(dbUrl);
  assert.ok(
    parsedDb.hostname === '127.0.0.1' || parsedDb.hostname === 'localhost',
    `DATABASE_URL hostname must be loopback (127.0.0.1), got: ${parsedDb.hostname}`,
  );
  assert.equal(parsedDb.port, '55432', `DATABASE_URL port must be 55432, got: ${parsedDb.port}`);
  assert.equal(
    parsedDb.pathname,
    '/ryo_qa',
    `DATABASE_URL database name must be /ryo_qa, got: ${parsedDb.pathname}`,
  );
  assert.equal(
    parsedDb.username,
    'ryo_qa_owner',
    `DATABASE_URL user must be ryo_qa_owner, got: ${parsedDb.username}`,
  );

  const parsedDirect = new URL(directUrl);
  assert.ok(
    parsedDirect.hostname === '127.0.0.1' || parsedDirect.hostname === 'localhost',
    `DIRECT_DATABASE_URL hostname must be loopback (127.0.0.1), got: ${parsedDirect.hostname}`,
  );
  assert.equal(
    parsedDirect.port,
    '55432',
    `DIRECT_DATABASE_URL port must be 55432, got: ${parsedDirect.port}`,
  );
  assert.equal(
    parsedDirect.pathname,
    '/ryo_qa',
    `DIRECT_DATABASE_URL database name must be /ryo_qa, got: ${parsedDirect.pathname}`,
  );
  assert.equal(
    parsedDirect.username,
    'ryo_qa_owner',
    `DIRECT_DATABASE_URL user must be ryo_qa_owner, got: ${parsedDirect.username}`,
  );

  // 2. Mandatory Ownership Token and Data Directory Environment Presence
  assert.ok(
    token && token.trim().length > 0,
    'QA_HARNESS_INSTANCE_TOKEN is required and must be non-empty.',
  );
  assert.ok(
    expectedDataDir && expectedDataDir.trim().length > 0,
    'QA_HARNESS_DATA_DIR is required and must be non-empty.',
  );

  const canonicalExpectedDataDir = fs.realpathSync(expectedDataDir.trim());

  // 3. Live Server Identity Query
  const rows = await db.$queryRaw<
    Array<{
      server_addr: string | null;
      server_port: number;
      current_db: string;
      current_usr: string;
      data_dir: string;
    }>
  >`
    SELECT 
      host(inet_server_addr())::text AS server_addr,
      inet_server_port()::int AS server_port,
      current_database()::text AS current_db,
      current_user::text AS current_usr,
      current_setting('data_directory')::text AS data_dir
  `;

  assert.ok(rows && rows.length > 0, 'Database identity query returned no rows.');
  const info = rows[0];

  // If connected via UNIX socket or localhost IPv4/IPv6, server_addr may be 127.0.0.1, ::1, or loopback
  if (info.server_addr !== null) {
    const cleanAddr = info.server_addr.split('/')[0];
    assert.ok(
      cleanAddr === '127.0.0.1' ||
        cleanAddr === '::1' ||
        cleanAddr === 'localhost',
      `Connected PostgreSQL server address is not loopback: ${info.server_addr}`,
    );
  }
  assert.equal(
    info.server_port,
    55432,
    `Connected PostgreSQL server port is not 55432: ${info.server_port}`,
  );
  assert.equal(
    info.current_db,
    'ryo_qa',
    `Connected database is not ryo_qa: ${info.current_db}`,
  );
  assert.equal(
    info.current_usr,
    'ryo_qa_owner',
    `Connected user is not ryo_qa_owner: ${info.current_usr}`,
  );

  // 4. Canonical Cluster Data Directory and Token Verification
  assert.ok(
    info.data_dir && fs.existsSync(info.data_dir),
    `Reported server data directory does not exist on disk: ${info.data_dir}`,
  );
  const canonicalServerDataDir = fs.realpathSync(info.data_dir);
  assert.equal(
    canonicalServerDataDir,
    canonicalExpectedDataDir,
    `Connected server data directory (${canonicalServerDataDir}) does not match current harness directory (${canonicalExpectedDataDir}).`,
  );

  const tokenFilePath = path.join(canonicalServerDataDir, 'HARNESS_INSTANCE_TOKEN');
  assert.ok(
    fs.existsSync(tokenFilePath),
    `HARNESS_INSTANCE_TOKEN file missing in cluster directory: ${tokenFilePath}`,
  );
  const actualToken = fs.readFileSync(tokenFilePath, 'utf8').trim();
  assert.equal(
    actualToken,
    token.trim(),
    'Cluster ownership token mismatch. Connected cluster belongs to another invocation.',
  );
}

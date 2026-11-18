#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, '..');
const testDir = path.join(backendDir, 'test');

const QA_PORT = 55432;
const QA_HOST = '127.0.0.1';
const QA_USER = 'ryo_qa_owner';
const QA_DB = 'ryo_qa';
const LOCK_FILE = '/tmp/ryo-qa-harness.lock';
const DEFAULT_TIMEOUT_MS = 180_000; // 3 minutes per suite

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function checkPortFree(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.once('connect', () => {
      socket.destroy();
      resolve(false); // Port is occupied
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(true); // Port did not answer within timeout
    });
    socket.once('error', (err) => {
      socket.destroy();
      resolve(true); // Connection refused -> port is free
    });
    socket.connect(port, host);
  });
}

function acquireLock() {
  try {
    const fd = fs.openSync(LOCK_FILE, 'wx');
    fs.writeFileSync(fd, `${process.pid}\n${new Date().toISOString()}\n`);
    fs.closeSync(fd);
    return true;
  } catch (err) {
    if (err.code === 'EEXIST') {
      try {
        const content = fs.readFileSync(LOCK_FILE, 'utf8');
        const lines = content.split('\n');
        const lockPid = parseInt(lines[0], 10);
        if (!isNaN(lockPid)) {
          try {
            process.kill(lockPid, 0); // Check if process is still alive
            console.error(`FATAL: Another QA harness instance is currently active (PID: ${lockPid}).`);
            process.exit(1);
          } catch (killErr) {
            // PID does not exist; lockfile is stale
            console.warn(`[QA Harness] Cleaning up stale lockfile from PID ${lockPid}.`);
            fs.unlinkSync(LOCK_FILE);
            return acquireLock();
          }
        }
      } catch (readErr) {
        // Fall through to error
      }
      console.error('FATAL: Could not acquire exclusive QA harness lock.');
      process.exit(1);
    }
    throw err;
  }
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const content = fs.readFileSync(LOCK_FILE, 'utf8');
      const lockPid = parseInt(content.split('\n')[0], 10);
      if (lockPid === process.pid) {
        fs.unlinkSync(LOCK_FILE);
      }
    }
  } catch (err) {
    // Ignore cleanup error
  }
}

async function main() {
  const selectedTarget = process.argv[2];
  const suiteTimeout = parseInt(process.env.QA_SUITE_TIMEOUT_MS || `${DEFAULT_TIMEOUT_MS}`, 10);

  // 1. Verify required PostgreSQL binaries
  const requiredBinaries = ['initdb', 'pg_ctl', 'createdb', 'pg_isready'];
  for (const bin of requiredBinaries) {
    try {
      execFileSync('which', [bin], { stdio: 'ignore' });
    } catch {
      console.error(`FATAL: Required PostgreSQL binary "${bin}" is not found in PATH.`);
      process.exit(1);
    }
  }

  // 2. Acquire exclusive harness lock
  acquireLock();

  // 3. Port occupancy safety check
  const portIsFree = await checkPortFree(QA_PORT, QA_HOST);
  if (!portIsFree) {
    releaseLock();
    console.error(
      `FATAL: Port ${QA_PORT} is already occupied by a listening service.\n` +
        `To prevent terminating unverified processes, the harness will not connect or kill it. Exiting.`,
    );
    process.exit(1);
  }

  // 4. Create ephemeral cluster directory & generate instance token
  const clusterDir = fs.mkdtempSync('/tmp/ryo-qa-pg-');
  const canonicalClusterDir = fs.realpathSync(clusterDir);
  const instanceToken = crypto.randomUUID();

  let clusterStarted = false;

  const teardownCluster = async () => {
    if (!clusterStarted) {
      if (fs.existsSync(canonicalClusterDir)) {
        fs.rmSync(canonicalClusterDir, { recursive: true, force: true });
      }
      releaseLock();
      return;
    }

    console.log('\n[QA Harness] Initiating guaranteed cluster teardown...');
    try {
      const pidFile = path.join(canonicalClusterDir, 'postmaster.pid');
      if (fs.existsSync(pidFile)) {
        const postmasterPid = parseInt(fs.readFileSync(pidFile, 'utf8').split('\n')[0], 10);
        if (!isNaN(postmasterPid)) {
          // Verify process cmdline points to this exact directory
          try {
            const cmdline = fs.readFileSync(`/proc/${postmasterPid}/cmdline`, 'utf8');
            if (cmdline.includes(canonicalClusterDir)) {
              execFileSync('pg_ctl', ['-D', canonicalClusterDir, '-m', 'fast', 'stop'], {
                stdio: 'ignore',
              });
            }
          } catch {
            // If fast stop failed, escalate to immediate
            try {
              execFileSync('pg_ctl', ['-D', canonicalClusterDir, '-m', 'immediate', 'stop'], {
                stdio: 'ignore',
              });
            } catch {}
          }
        }
      }
    } catch (err) {
      console.warn(`[QA Harness] Warning during pg_ctl stop: ${err?.message}`);
    }

    // Confirm port is dead
    const isStillUp = !(await checkPortFree(QA_PORT, QA_HOST));
    if (isStillUp) {
      console.warn(`[QA Harness] WARNING: Port ${QA_PORT} still responding after stop attempt.`);
    }

    // Clean up temporary directory
    try {
      if (fs.existsSync(canonicalClusterDir)) {
        fs.rmSync(canonicalClusterDir, { recursive: true, force: true });
        console.log(`[QA Harness] Removed ephemeral data directory: ${canonicalClusterDir}`);
      }
    } catch (err) {
      console.warn(`[QA Harness] Error removing cluster directory: ${err?.message}`);
    }

    releaseLock();
  };

  // Signal handlers for graceful exit
  process.on('SIGINT', async () => {
    console.log('\n[QA Harness] Received SIGINT. Halting...');
    await teardownCluster();
    process.exit(130);
  });
  process.on('SIGTERM', async () => {
    console.log('\n[QA Harness] Received SIGTERM. Halting...');
    await teardownCluster();
    process.exit(143);
  });

  try {
    // 5. Initialize cluster with initdb
    console.log(`[QA Harness] Initializing disposable cluster in ${canonicalClusterDir}...`);
    execFileSync(
      'initdb',
      ['-D', canonicalClusterDir, '-U', QA_USER, '-A', 'trust', '--auth=trust', '-E', 'UTF8', '--no-locale'],
      { stdio: 'inherit' },
    );

    // Write harness tokens into initialized cluster
    fs.writeFileSync(path.join(canonicalClusterDir, 'HARNESS_INSTANCE_TOKEN'), `${instanceToken}\n`);
    fs.writeFileSync(path.join(canonicalClusterDir, 'HARNESS_PID'), `${process.pid}\n`);

    // 6. Start PostgreSQL server
    console.log(`[QA Harness] Starting PostgreSQL on ${QA_HOST}:${QA_PORT}...`);
    execFileSync(
      'pg_ctl',
      [
        '-D',
        canonicalClusterDir,
        '-o',
        `-p ${QA_PORT} -h ${QA_HOST} -k ${canonicalClusterDir}`,
        '-l',
        path.join(canonicalClusterDir, 'server.log'),
        'start',
      ],
      { stdio: 'ignore' },
    );

    // 7. Wait for PostgreSQL ready
    let ready = false;
    for (let i = 0; i < 50; i++) {
      try {
        execFileSync('pg_isready', ['-h', QA_HOST, '-p', `${QA_PORT}`, '-U', QA_USER], {
          stdio: 'ignore',
        });
        ready = true;
        break;
      } catch {
        await delay(100);
      }
    }

    if (!ready) {
      throw new Error(`PostgreSQL failed to respond on ${QA_HOST}:${QA_PORT} after startup.`);
    }

    clusterStarted = true;

    // 8. Create database
    console.log(`[QA Harness] Creating disposable database "${QA_DB}"...`);
    execFileSync('createdb', ['-h', QA_HOST, '-p', `${QA_PORT}`, '-U', QA_USER, QA_DB], {
      stdio: 'ignore',
    });

    console.log(`[QA Harness] Disposable cluster active. Instance token: ${instanceToken}`);

    // 9. Construct strict child environment allowlist
    const qaDbUrl = `postgresql://${QA_USER}@${QA_HOST}:${QA_PORT}/${QA_DB}?schema=public`;
    const childEnv = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      USER: process.env.USER,
      NODE_ENV: 'test',
      NODE_OPTIONS: process.env.NODE_OPTIONS || '',
      LANG: process.env.LANG || 'en_US.UTF-8',
      DATABASE_URL: qaDbUrl,
      DIRECT_DATABASE_URL: qaDbUrl,
      PGHOST: QA_HOST,
      PGPORT: `${QA_PORT}`,
      PGDATABASE: QA_DB,
      PGUSER: QA_USER,
      QA_HARNESS_INSTANCE_TOKEN: instanceToken,
      QA_HARNESS_DATA_DIR: canonicalClusterDir,
    };

    // 10. Run Prisma Migrations
    console.log(`[QA Harness] Applying Prisma migrations to disposable database...`);
    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: backendDir,
      env: childEnv,
      stdio: 'inherit',
    });
    console.log(`[QA Harness] Schema migration complete.\n`);

    // 11. Determine suites to execute
    const allFiles = fs
      .readdirSync(testDir)
      .filter((f) => f.endsWith('.integration.ts'))
      .sort();

    let targetSuites = [];
    if (selectedTarget) {
      const match = allFiles.find(
        (f) => f === selectedTarget || f === path.basename(selectedTarget) || f.includes(selectedTarget),
      );
      if (!match) {
        throw new Error(`Specified test suite "${selectedTarget}" was not found in ${testDir}`);
      }
      targetSuites = [match];
    } else {
      targetSuites = allFiles;
    }

    console.log(`================================================================`);
    console.log(`RYO ACADEMY INTEGRATION TEST EXECUTION (${targetSuites.length} suites)`);
    console.log(`Target: ${qaDbUrl}`);
    console.log(`================================================================\n`);

    const results = [];
    const tsxBinary = path.join(backendDir, 'node_modules', '.bin', 'tsx');

    for (let idx = 0; idx < targetSuites.length; idx++) {
      const suiteFile = targetSuites[idx];
      const suitePath = path.join(testDir, suiteFile);
      const suiteNum = `[${idx + 1}/${targetSuites.length}]`;

      // Special preflight for http-jwt-qa: verify port 7676 is free
      if (suiteFile === 'http-jwt-qa.integration.ts') {
        const port7676Free = await checkPortFree(7676, '127.0.0.1');
        if (!port7676Free) {
          console.error(
            `\n${suiteNum} FAIL: ${suiteFile}\n` +
              `  -> Port 7676 is already in use by another process. Cannot execute HTTP server test.\n`,
          );
          results.push({ suite: suiteFile, status: 'FAILED', durationMs: 0, error: 'Port 7676 occupied' });
          continue;
        }
      }

      console.log(`----------------------------------------------------------------`);
      console.log(`${suiteNum} RUNNING: ${suiteFile}`);
      console.log(`----------------------------------------------------------------`);

      const startTime = Date.now();

      const runSuite = () =>
        new Promise((resolve) => {
          const child = spawn(tsxBinary, [suitePath], {
            cwd: backendDir,
            env: childEnv,
            stdio: 'inherit',
            detached: true, // Create process group so timeout can kill all children
          });

          let timedOut = false;
          const timer = setTimeout(() => {
            timedOut = true;
            console.error(`\n[QA Harness] TIMEOUT: Suite "${suiteFile}" exceeded ${suiteTimeout}ms.`);
            try {
              process.kill(-child.pid, 'SIGKILL');
            } catch {}
          }, suiteTimeout);

          child.on('close', (code, signal) => {
            clearTimeout(timer);
            const durationMs = Date.now() - startTime;
            if (timedOut) {
              resolve({ status: 'TIMEOUT', durationMs, code: 124 });
            } else if (code === 0) {
              resolve({ status: 'PASSED', durationMs, code: 0 });
            } else {
              resolve({ status: 'FAILED', durationMs, code: code ?? 1, signal });
            }
          });

          child.on('error', (err) => {
            clearTimeout(timer);
            resolve({ status: 'ERROR', durationMs: Date.now() - startTime, error: err.message });
          });
        });

      const outcome = await runSuite();
      results.push({ suite: suiteFile, ...outcome });

      if (outcome.status === 'PASSED') {
        console.log(`\n${suiteNum} PASS: ${suiteFile} (${(outcome.durationMs / 1000).toFixed(2)}s)\n`);
      } else {
        console.error(
          `\n${suiteNum} ${outcome.status}: ${suiteFile} (${(outcome.durationMs / 1000).toFixed(2)}s) [Exit Code: ${outcome.code}]\n`,
        );
        // Fail-fast if database crashed or target identity check failed
        const isDbStillUp = !(await checkPortFree(QA_PORT, QA_HOST));
        if (!isDbStillUp) {
          console.error(`\nFATAL: PostgreSQL cluster crashed or stopped during suite ${suiteFile}. Aborting run.`);
          break;
        }
      }
    }

    // 12. Print Summary Report
    const totalDuration = results.reduce((acc, r) => acc + r.durationMs, 0);
    const passedCount = results.filter((r) => r.status === 'PASSED').length;
    const failedCount = results.filter((r) => r.status !== 'PASSED').length;

    console.log(`\n================================================================`);
    console.log(`INTEGRATION TEST SUMMARY REPORT`);
    console.log(`================================================================`);
    console.log(`Total Suites : ${results.length}`);
    console.log(`Passed       : ${passedCount}`);
    console.log(`Failed       : ${failedCount}`);
    console.log(`Total Time   : ${(totalDuration / 1000).toFixed(2)}s`);
    console.log(`----------------------------------------------------------------`);
    for (const r of results) {
      const mark = r.status === 'PASSED' ? '✓ PASS' : '✗ FAIL';
      console.log(`  ${mark.padEnd(8)} ${(r.durationMs / 1000).toFixed(2).padStart(6)}s  ${r.suite}`);
    }
    console.log(`================================================================\n`);

    if (failedCount > 0) {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error(`\n[QA Harness] Unhandled error: ${err?.message}`);
    process.exitCode = 1;
  } finally {
    await teardownCluster();
  }
}

main();

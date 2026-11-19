import {checkVerificationReadiness} from '../src/db/verificationReadiness.js';
// Read-only check of application schema and private messaging protections.
import pool from '../src/db/pool.js';
import { checkDatabaseReadiness } from '../src/db/readiness.js';

try {
  const errors = await checkDatabaseReadiness(pool, { notifications: true });
  errors.push(...await checkVerificationReadiness(pool));
  if (errors.length) {
    console.error(`Database check failed:\n- ${errors.join('\n- ')}`);
    process.exitCode = 1;
  } else {
    console.info('Database check passed: application, notification and verification tables, constraints, indexes, guards, RLS and client-role restrictions.');
  }
} catch (error) {
  console.error(`Database check failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}

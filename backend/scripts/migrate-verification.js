import {parseArgs} from 'node:util';
import {readFile} from 'node:fs/promises';
import pool from '../src/db/pool.js';
import env from '../src/config/env.js';
import {checkDatabaseReadiness} from '../src/db/readiness.js';
import {checkVerificationReadiness} from '../src/db/verificationReadiness.js';
import {validateOperatorTarget,verifyConnectedTarget} from '../src/utils/operatorTarget.js';
let client;
try {
  const {values}=parseArgs({options:{apply:{type:'boolean'},'allow-hosted':{type:'boolean'},'expected-host':{type:'string'},'expected-database':{type:'string'},'expected-user':{type:'string'}}});
  validateOperatorTarget(values,env.database);
  client=await pool.connect();await client.query(values.apply?'BEGIN':'BEGIN READ ONLY');
  await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='30s'");
  await verifyConnectedTarget(client,env.database);
  if(values.apply) await client.query('SELECT pg_advisory_xact_lock(1297303373,0)');
  const prerequisites=await checkDatabaseReadiness(client,{notifications:true});
  if(prerequisites.length) throw new Error(prerequisites.join('; '));
  const existing=await client.query(`SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname LIKE 'skill_verification_%'
    UNION ALL SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'verification_%'
    UNION ALL SELECT 1 FROM pg_attribute WHERE attrelid='public.users'::regclass AND attname='role' AND NOT attisdropped
    UNION ALL SELECT 1 FROM pg_attribute WHERE attrelid='public.notifications'::regclass AND attname='verification_event_id' AND NOT attisdropped`);
  if(existing.rowCount) throw new Error('Verification objects already exist. Inspect readiness; refusing partial/repeat application.');
  if(values.apply) {
    for(const name of ['005_skill_verification.sql','006_verification_notifications.sql']) {
      const sql=await readFile(new URL('../db/migrations/'+name,import.meta.url),'utf8');
      if(!/^BEGIN;$/m.test(sql)||!/^COMMIT;\s*$/m.test(sql)) throw new Error('Unexpected migration transaction format');
      await client.query(sql.replace(/^BEGIN;\r?\n/m,'').replace(/^COMMIT;\s*$/m,''));
    }
    const errors=await checkVerificationReadiness(client);
    if(errors.length) throw new Error(errors.join('; '));
    await client.query('COMMIT');console.info('Migrations 005 and 006 committed; verification readiness passed.');
  } else {await client.query('ROLLBACK');console.info('Verification preflight passed. No changes made.');}
} catch(error) {if(client) await client.query('ROLLBACK').catch(()=>{});console.error('Verification migration failed: '+error.message);process.exitCode=1;}
finally {client?.release();await pool.end();}

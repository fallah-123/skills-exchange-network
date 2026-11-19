import {parseArgs} from 'node:util';
import pool from '../src/db/pool.js';
import env from '../src/config/env.js';
import {validateOperatorTarget,validateAccountSelection,verifyConnectedTarget} from '../src/utils/operatorTarget.js';
import {provisionAdministrator} from '../src/utils/provisionAdministrator.js';
let client;
try {
  const {values}=parseArgs({options:{apply:{type:'boolean'},'allow-hosted':{type:'boolean'},'expected-host':{type:'string'},'expected-database':{type:'string'},'expected-user':{type:'string'},'user-id':{type:'string'},'expected-email':{type:'string'},'confirm-user-id':{type:'string'}}});
  validateOperatorTarget(values,env.database);const id=validateAccountSelection(values);
  client=await pool.connect();await client.query(values.apply?'BEGIN':'BEGIN READ ONLY');
  await client.query("SET LOCAL lock_timeout='5s'");await verifyConnectedTarget(client,env.database);
  await provisionAdministrator(client,id,values['expected-email'],values.apply);
  if(values.apply) {
    await client.query('COMMIT');console.info('Administrator role granted only to user ID '+id+'. Existing sessions invalidated; fresh login required.');
  } else {await client.query('ROLLBACK');console.info('Account and target checks passed for user ID '+id+'. No role or session changes made.');}
} catch(error) {if(client) await client.query('ROLLBACK').catch(()=>{});console.error('Administrator provisioning failed: '+error.message);process.exitCode=1;}
finally {client?.release();await pool.end();}

// Creates a NEW local rehearsal database; never drops or resets a database.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import pg from 'pg';
import env from '../src/config/env.js';
import {checkDatabaseReadiness} from '../src/db/readiness.js';
import {checkVerificationReadiness} from '../src/db/verificationReadiness.js';
if(env.nodeEnv!=='test'||!['localhost','127.0.0.1','::1'].includes(env.database.host))
 throw new Error('Migration rehearsal requires NODE_ENV=test and a loopback database.');
const name='sdn_verification_rehearsal_'+Date.now()+'_test';
const options={host:env.database.host,port:env.database.port,user:env.database.user,password:env.database.password};
const maintenance=new pg.Client({...options,database:env.database.maintenanceName});let db;
try{
 await maintenance.connect();
 await maintenance.query('CREATE DATABASE "'+name+'"');
 db=new pg.Client({...options,database:name});await db.connect();
 // Exercise Supabase-like default grants when the isolated cluster has API fixture roles.
 const roles=(await db.query("SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')")).rows;
 for(const {rolname} of roles) {
   await db.query('ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO "'+rolname+'"');
   await db.query('ALTER DEFAULT PRIVILEGES GRANT ALL ON SEQUENCES TO "'+rolname+'"');
   await db.query('ALTER DEFAULT PRIVILEGES GRANT ALL ON FUNCTIONS TO "'+rolname+'"');
 }
 for(const file of ['001_initial_schema.sql','002_session_table.sql','003_private_messaging.sql','004_notifications.sql'])
   await db.query(await readFile(new URL('../db/migrations/'+file,import.meta.url),'utf8'));
 await db.query("INSERT INTO users(display_name,email,password_hash) VALUES('Migration Fixture A','migration-a@example.test','unusable-test-hash'),('Migration Fixture B','migration-b@example.test','unusable-test-hash')");
 await db.query("INSERT INTO developer_profiles(user_id) VALUES(1),(2)");
 await db.query("INSERT INTO skills(name) VALUES('SQL')");
 await db.query("INSERT INTO developer_skills(user_id,skill_id,skill_type) VALUES(1,1,'offered')");
 await db.query("INSERT INTO collaboration_requests(sender_id,recipient_id,status) VALUES(1,2,'accepted')");
 await db.query("INSERT INTO conversations(collaboration_request_id) VALUES(1)");
 await db.query("INSERT INTO messages(conversation_id,sender_id,client_message_id,body) VALUES(1,1,'3fef839b-f46d-4b19-b49f-caf98e569971','Existing fixture message')");
 await db.query("INSERT INTO notifications(recipient_id,actor_id,type,conversation_id,last_message_id) VALUES(2,1,'message',1,1)");
 await db.query("INSERT INTO user_sessions(sid,sess,expire) VALUES('rehearsal-fixture','{\"userId\":1}',CURRENT_TIMESTAMP+interval '1 day')");
 const tables=['users','developer_profiles','skills','developer_skills','collaboration_requests','conversations','messages','notifications','user_sessions'];
 async function snapshot(){
   const result={};
   for(const table of tables)result[table]=(await db.query(`SELECT (to_jsonb(t)-'role'-'verification_event_id') AS row FROM public.${table} t ORDER BY (to_jsonb(t)-'role'-'verification_event_id')::text`)).rows;
   return result;
 }
 const before=await snapshot();
 const childEnv={...process.env,DB_NAME_TEST:name};
 const args=['scripts/migrate-verification.js','--expected-host',options.host,'--expected-database',name,'--expected-user',options.user];
 const run=extra=>spawnSync(process.execPath,[...args,...extra],{env:childEnv,encoding:'utf8',timeout:60000,windowsHide:true});
 let result=run([]);assert.equal(result.status,0,result.stderr);assert.deepEqual(await snapshot(),before);
 result=run(['--apply']);assert.equal(result.status,0,result.stderr);
 assert.deepEqual(await snapshot(),before,'Existing application rows changed');
 assert.deepEqual(await checkDatabaseReadiness(db,{notifications:true}),[]);
 assert.deepEqual(await checkVerificationReadiness(db),[]);
 assert.equal((await db.query("SELECT count(*)::integer AS total FROM users WHERE role='admin'")).rows[0].total,0);
 result=run(['--apply']);assert.notEqual(result.status,0,'Repeat migration must fail');assert.deepEqual(await snapshot(),before);
 console.info('PASS guarded preflight, migration 005/006, repeat refusal, nine preserved tables, default developer roles and full readiness.');
 console.info('Retained isolated rehearsal database: '+name);
}finally{await db?.end();await maintenance.end();}

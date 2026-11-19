// Convenience launcher for the isolated runtime prepared on this computer.
// Credentials stay in the protected runtime file, never in shell arguments.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
const [command,...args]=process.argv.slice(2);
const stateFile=process.env.SDN_LOCAL_STATE || path.join(os.tmpdir(),'sdn-verification-local.json');
const state=JSON.parse(fs.readFileSync(stateFile,'utf8'));
const runtime=JSON.parse(fs.readFileSync(state.runtimeFile,'utf8'));
if(!Number.isInteger(runtime.port)||runtime.port<1024||runtime.port>65535||
  ![runtime.test,runtime.preview].every(name=>/^sdn_verification_[a-z0-9_]+_test$/.test(name))||runtime.test===runtime.preview)
  throw new Error('Invalid isolated local runtime.');
if(!runtime.sessionSecret){runtime.sessionSecret=randomBytes(48).toString('hex');fs.writeFileSync(state.runtimeFile,JSON.stringify(runtime));}
const preview=['preview','check','provision','seed-preview'].includes(command);
const env={...process.env,NODE_ENV:preview?'development':'test',PORT:preview?'4108':'4107',
  DB_HOST:'127.0.0.1',DB_PORT:String(runtime.port),DB_NAME:preview?runtime.preview:'postgres',DB_NAME_TEST:runtime.test,
  DB_USER:'postgres',DB_PASSWORD:runtime.password,DB_SSL_CA_FILE:'',SESSION_SECRET:runtime.sessionSecret};
const commands={preview:['src/server.js'],integration:['src/server.js'],test:['--import','./tests/setup/loadTestEnv.js','--test','--test-concurrency=1'],
  check:['scripts/check-db.js'],rehearsal:['scripts/check-verification-migration.js'],
  'seed-test':['scripts/seed-test-skills.js'],'seed-preview':['scripts/seed-test-skills.js']};
if(command==='seed-preview'){env.DB_NAME='postgres';env.DB_NAME_TEST=runtime.preview;}
if(command==='provision')commands.provision=['scripts/provision-admin.js','--expected-host','127.0.0.1','--expected-database',runtime.preview,'--expected-user','postgres',...args];
if(!commands[command])throw new Error('Use preview, integration, test, check, rehearsal, seed-test, seed-preview or provision.');
if(command!=='provision'&&args.length)throw new Error('Unexpected arguments.');
const child=spawn(process.execPath,commands[command],{cwd:new URL('..',import.meta.url),env,stdio:'inherit',windowsHide:true});
child.on('error',()=>{console.error('Local command failed to start.');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});

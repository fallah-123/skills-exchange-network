import test from 'node:test';
import assert from 'node:assert/strict';
import {validateOperatorTarget,validateAccountSelection,verifyConnectedTarget} from '../../src/utils/operatorTarget.js';
import {provisionAdministrator} from '../../src/utils/provisionAdministrator.js';
const database={host:'127.0.0.1',name:'isolated_test',user:'postgres'};
const target={'expected-host':database.host,'expected-database':database.name,'expected-user':database.user};
test('operator targeting refuses missing/mismatched configuration and unapproved hosted targets',()=>{
 assert.throws(()=>validateOperatorTarget({},database));
 assert.throws(()=>validateOperatorTarget({...target,'expected-database':'postgres'},database));
 assert.doesNotThrow(()=>validateOperatorTarget(target,database));
 const hosted={...database,host:'db.project.supabase.co'};
 assert.throws(()=>validateOperatorTarget({...target,'expected-host':hosted.host},hosted));
});
test('administrator apply requires exact explicit ID confirmation, not just an email',()=>{
 for(const values of [{},{'expected-email':'admin@example.com'},{'user-id':'1 OR 1=1','expected-email':'admin@example.com'},{'user-id':'1','expected-email':'admin@example.com',apply:true,'confirm-user-id':'2'}])
   assert.throws(()=>validateAccountSelection(values));
 assert.equal(validateAccountSelection({'user-id':'1','expected-email':'admin@example.com',apply:true,'confirm-user-id':'1'}),1);
});
test('actual connected identity is validated, including pooler role mapping',async()=>{
 await assert.rejects(verifyConnectedTarget({query:async()=>({rows:[{database:'wrong',role:'postgres'}]})},database));
 await verifyConnectedTarget({query:async()=>({rows:[{database:'isolated_test',role:'postgres'}]})},{...database,user:'postgres.project'});
});
test('provisioning dry-run never changes roles or sessions; apply scopes both writes to one ID',async()=>{
 const calls=[];
 const db={query:async(sql,args)=>{calls.push({sql,args});return sql.startsWith('SELECT')?{rows:[{id:9,email:'operator@example.test',role:'developer'}]}:{rowCount:1};}};
 await provisionAdministrator(db,9,'operator@example.test',false);
 assert.equal(calls.length,1);assert.ok(!calls[0].sql.includes('FOR UPDATE'));
 calls.length=0;await provisionAdministrator(db,9,'operator@example.test',true);
 assert.equal(calls.length,3);assert.ok(calls[0].sql.endsWith('FOR UPDATE'));
 assert.deepEqual(calls[1].args,[9]);assert.deepEqual(calls[2].args,['9']);
 assert.match(calls[2].sql,/DELETE FROM public.user_sessions WHERE/);
});
test('provisioning mismatched accounts fails before writing',async()=>{
 let calls=0;
 const db={query:async()=>{calls++;return {rows:[{id:9,email:'someone-else@example.test',role:'developer'}]};}};
 await assert.rejects(provisionAdministrator(db,9,'operator@example.test',true));assert.equal(calls,1);
});

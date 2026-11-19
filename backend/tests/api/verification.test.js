import test,{before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import argon2 from 'argon2';
import {setTimeout as delay} from 'node:timers/promises';
import {createApi} from '../helpers/api.js';
import {testPool,resetTestDatabase} from '../helpers/testDb.js';
import {checkVerificationReadiness} from '../../src/db/verificationReadiness.js';
let hash,owner,admin,outsider;
const contribution='I implemented the data flow, reusable components and tests in this project. Inspect the components and integration tests linked below.';
const evidence=[{url:'https://github.com/demo/project',description:'Review the component implementation and its tests.'}];
const rubric={accessible:true,relevant:true,contribution:true,substantial:true,credible:true};
before(async()=>{hash=await argon2.hash('local-verification-fixture');});
async function actor(id) {
 const {agent}=createApi();await agent.post('/api/auth/login').send({email:'verify'+id+'@example.test',password:'local-verification-fixture'}).expect(200);
 const token=(await agent.get('/api/verifications/csrf-token').expect(200)).body.data.csrfToken;
 return {agent,id,token};
}
beforeEach(async()=>{
 await resetTestDatabase();
 // Disposable test fixtures only. No preview or production administrator is created.
 await testPool.query("INSERT INTO users(display_name,email,password_hash,role) VALUES ('Applicant','verify1@example.test',$1,'developer'),('Review Fixture','verify2@example.test',$1,'admin'),('Other Developer','verify3@example.test',$1,'developer')",[hash]);
 await testPool.query('INSERT INTO developer_profiles(user_id) VALUES(1),(2),(3)');
 await testPool.query("INSERT INTO skills(name) VALUES('JavaScript'),('SQL')");
 await testPool.query("INSERT INTO developer_skills(user_id,skill_id,skill_type) VALUES(1,1,'offered'),(1,2,'wanted'),(2,1,'offered'),(3,1,'wanted')");
 owner=await actor(1);admin=await actor(2);outsider=await actor(3);
});
after(()=>testPool.end());
const post=(a,path,body)=>a.agent.post(path).set('X-CSRF-Token',a.token).send(body);
const submit=(a=owner,fields={})=>post(a,'/api/verifications',{skillId:1,contribution,evidence,...fields});
const review=(id,decision='approved',version=1,a=admin)=>post(a,'/api/admin/verifications/'+id+'/decision',{version,decision,feedback:'Evidence inspected against the review criteria.',rubric});
const notices=(a=owner)=>a.agent.get('/api/notifications').set('X-Notification-Version','2');
test('default role and forged role fields never grant administrator rights',async()=>{
 const {agent}=createApi();
 const result=await agent.post('/api/auth/register').send({displayName:'Fresh Developer',email:'fresh@example.test',password:'local-password-123',role:'admin'}).expect(201);
 assert.equal(result.body.data.role,'developer');
 await owner.agent.get('/api/admin/verifications').expect(403);
 await createApi().agent.get('/api/admin/verifications').expect(401);
 assert.equal((await admin.agent.get('/api/auth/me').expect(200)).body.data.role,'admin');
});
test('submission enforces CSRF, offered ownership, private history and payload fields',async()=>{
 await owner.agent.post('/api/verifications').send({skillId:1,contribution,evidence}).expect(403);
 await submit(owner,{skillId:2}).expect(409);await submit(outsider).expect(409);
 await submit(owner,{userId:2}).expect(400);await submit(owner,{status:'approved'}).expect(400);
 const item=(await submit().expect(201)).body.data;
 assert.equal(item.status,'pending');assert.equal(item.history.length,1);assert.deepEqual(item.evidence.map(e=>e.url),evidence.map(e=>e.url));
 await outsider.agent.get('/api/verifications/'+item.id).expect(404);
 assert.equal((await owner.agent.get('/api/verifications/me').expect(200)).headers['cache-control'],'no-store');
 assert.equal((await notices()).body.data.length,0);
});
test('evidence rejects unsafe schemes, IP literals, credentials, duplicates and bad lengths',async()=>{
 for(const url of ['http://github.com/a','javascript:alert(1)','https://localhost/a','https://127.0.0.1/a','https://2130706433/a','https://[::1]/','https://10.0.0.1/','https://user:pass@github.com/a','https://host.internal/a','https://github.com:8443/a']) {
   await submit(owner,{evidence:[{url,description:'Evidence'}]}).expect(400);
 }
 await submit(owner,{evidence:[evidence[0],evidence[0]]}).expect(400);
 await submit(owner,{evidence:[]}).expect(400);await submit(owner,{contribution:'too short'}).expect(400);
 await submit(owner,{evidence:[{...evidence[0],description:''}]}).expect(400);
});
test('concurrent submissions produce exactly one active request',async()=>{
 const results=await Promise.all([submit(),submit(),submit()]);
 assert.deepEqual(results.map(r=>r.status).sort(),[201,409,409]);
 assert.equal((await testPool.query('SELECT count(*)::integer AS total FROM skill_verification_requests')).rows[0].total,1);
});
test('approval requires independent admin and complete rubric; badges are owner-specific',async()=>{
 const item=(await submit().expect(201)).body.data;
 await review(item.id,'approved',1,owner).expect(403);
 const own=(await submit(admin).expect(201)).body.data;await review(own.id).expect(403);
 await post(admin,'/api/admin/verifications/'+item.id+'/decision',{version:1,decision:'approved',feedback:'Okay',rubric:{}}).expect(400);
 await review(item.id).expect(200);
 assert.equal((await owner.agent.get('/api/skills/me')).body.data.offered[0].evidenceReviewed,true);
 assert.equal((await outsider.agent.get('/api/developers/1')).body.data.offeredSkills[0].evidenceReviewed,true);
 assert.equal((await owner.agent.get('/api/developers/2')).body.data.offeredSkills[0].evidenceReviewed,undefined);
 const match=(await outsider.agent.get('/api/matches')).body.data.find(m=>m.developer.id===1);
 assert.equal(match.theyOfferYouWant[0].evidenceReviewed,true);
 const publicData=JSON.stringify((await outsider.agent.get('/api/developers/1')).body);
 assert.ok(!publicData.includes(contribution)&&!publicData.includes(evidence[0].url));
});
test('rejection and withdrawal preserve attempts; resubmission creates new IDs',async()=>{
 const first=(await submit()).body.data;await review(first.id,'rejected').expect(200);
 const second=(await submit()).body.data;assert.notEqual(first.id,second.id);
 await post(owner,'/api/verifications/'+second.id+'/withdraw',{version:1}).expect(200);
 await review(second.id).expect(409);
 const third=(await submit()).body.data;assert.notEqual(second.id,third.id);
 const history=(await owner.agent.get('/api/verifications/me')).body.data;
 assert.deepEqual(history.map(r=>r.status),['pending','withdrawn','rejected']);
});
test('revocation preserves approval event and its notification remains readable',async()=>{
 const item=(await submit()).body.data;await review(item.id).expect(200);
 await post(admin,'/api/admin/verifications/'+item.id+'/revoke',{version:2,feedback:'Evidence attribution was disputed.'}).expect(200);
 await post(admin,'/api/admin/verifications/'+item.id+'/revoke',{version:2,feedback:'Again'}).expect(409);
 const detail=(await owner.agent.get('/api/verifications/'+item.id)).body.data;
 assert.deepEqual(detail.history.map(e=>e.action),['submitted','approved','revoked']);
 assert.equal((await owner.agent.get('/api/skills/me')).body.data.offered[0].evidenceReviewed,undefined);
 const all=(await notices()).body.data;assert.deepEqual(all.map(n=>n.type),['verification_revoked','verification_approved']);
 const approved=all.find(n=>n.type==='verification_approved');
 await post(owner,'/api/notifications/'+approved.id+'/read',{lastMessageId:null}).set('X-Notification-Version','2').expect(200);
});
test('removal retires pending/approved verification and re-addition never restores badge',async()=>{
 let item=(await submit()).body.data;
 await owner.agent.delete('/api/skills/me/offered/1').expect(200);
 assert.equal((await owner.agent.get('/api/verifications/'+item.id)).body.data.status,'withdrawn');
 await owner.agent.post('/api/skills/me/offered').send({skillId:1}).expect(201);
 item=(await submit()).body.data;await review(item.id).expect(200);
 await owner.agent.delete('/api/skills/me/offered/1').expect(200);
 const history=(await owner.agent.get('/api/verifications/'+item.id)).body.data.history;
 assert.deepEqual(history.map(e=>e.action),['submitted','approved','withdrawn']);
 await owner.agent.post('/api/skills/me/offered').send({skillId:1}).expect(201);
 assert.equal((await owner.agent.get('/api/skills/me')).body.data.offered[0].evidenceReviewed,undefined);
 await submit().expect(201);
});
test('concurrent reviews produce one decision, one notification and a stale conflict',async()=>{
 const item=(await submit()).body.data;
 const results=await Promise.all([review(item.id),review(item.id,'rejected')]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 assert.equal((await notices()).body.data.length,1);
 assert.equal((await owner.agent.get('/api/verifications/'+item.id)).body.data.history.length,2);
});
test('concurrent removal and approval cannot leave an approved removed skill',async()=>{
 const item=(await submit()).body.data;
 const results=await Promise.all([review(item.id),owner.agent.delete('/api/skills/me/offered/1')]);
 assert.ok([200,409].includes(results[0].status));assert.equal(results[1].status,200);
 assert.equal((await owner.agent.get('/api/verifications/'+item.id)).body.data.status,'withdrawn');
});
test('role demotion is checked during an active session and again inside the review transaction',async()=>{
 const item=(await submit()).body.data;
 const lock=await testPool.connect();
 try{
   await lock.query('BEGIN');await lock.query("UPDATE users SET role='developer' WHERE id=2");
   const decision=review(item.id).then(r=>r);
   await delay(100);await lock.query('COMMIT');
   assert.equal((await decision).status,403);
   await admin.agent.get('/api/admin/verifications').expect(403);
   assert.equal((await admin.agent.get('/api/auth/me')).body.data.role,'developer');
   assert.equal((await owner.agent.get('/api/verifications/'+item.id)).body.data.status,'pending');
 }finally{await lock.query('ROLLBACK');lock.release();}
});
test('review and event updates roll back when notification insertion fails',async()=>{
 const item=(await submit()).body.data;
 await testPool.query("ALTER TABLE notifications ADD CONSTRAINT notifications_test_failure CHECK (type NOT LIKE 'verification_%')");
 try{await review(item.id).expect(500);}finally{await testPool.query('ALTER TABLE notifications DROP CONSTRAINT notifications_test_failure');}
 const detail=(await owner.agent.get('/api/verifications/'+item.id)).body.data;
 assert.equal(detail.status,'pending');assert.equal(detail.history.length,1);assert.equal((await notices()).body.data.length,0);
});
test('evidence and review history cannot be edited or deleted; partial submissions roll back',async()=>{
 const item=(await submit()).body.data;
 for(const sql of [
   "UPDATE skill_verification_evidence SET description='altered'",
   'DELETE FROM skill_verification_evidence',
   "INSERT INTO skill_verification_evidence(request_id,position,url,description) VALUES("+item.id+",2,'https://github.com/new','new')",
   "UPDATE skill_verification_events SET note='altered'",
   'DELETE FROM skill_verification_events',
   "UPDATE skill_verification_requests SET status='approved',version=version+1,changed_by=1",
   'DELETE FROM skill_verification_requests'
 ]) await assert.rejects(testPool.query(sql),{code:'23514'});
 await assert.rejects(testPool.query("INSERT INTO skill_verification_requests(user_id,skill_id,contribution,changed_by) VALUES(2,1,$1,2)",[contribution]),{code:'23514'});
});
test('legacy notification lists/counts/bulk actions preserve hidden verification notifications',async()=>{
 const item=(await submit()).body.data;await review(item.id).expect(200);
 assert.equal((await owner.agent.get('/api/notifications')).body.data.length,0);
 assert.equal((await owner.agent.get('/api/notifications/unread-count')).body.data.unreadCount,0);
 const notice=(await notices()).body.data[0];
 await post(owner,'/api/notifications/'+notice.id+'/read',{lastMessageId:null}).expect(404);
 await post(owner,'/api/notifications/read-all',{}).expect(200);
 await owner.agent.delete('/api/notifications').set('X-CSRF-Token',owner.token).send({}).expect(200);
 assert.equal((await notices()).body.data[0].readAt,null);
 await outsider.agent.delete('/api/notifications/'+notice.id).set('X-CSRF-Token',outsider.token).set('X-Notification-Version','2').send({lastMessageId:null}).expect(404);
 await owner.agent.delete('/api/notifications/'+notice.id).set('X-CSRF-Token',owner.token).set('X-Notification-Version','2').send({lastMessageId:null}).expect(200);
 assert.equal((await notices()).body.data.length,0);
 assert.equal((await owner.agent.get('/api/verifications/'+item.id)).body.data.history.length,2);
});
test('verification database readiness passes for all new security objects',async()=>{
 assert.deepEqual(await checkVerificationReadiness(testPool),[]);
});

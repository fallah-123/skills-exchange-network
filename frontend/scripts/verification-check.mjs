// Real frontend API modules -> local Vite proxy -> Express -> disposable PostgreSQL.
// Run after the backend suite. Uses its test-only reviewer fixture; never grants roles.
import assert from 'node:assert/strict';
import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID} from 'node:crypto';
import {registerUser,loginUser,logoutUser} from '../src/api/auth.api.js';
import {listSkills,addSkill,removeSkill,getMySkills} from '../src/api/skills.api.js';
import {verificationRead,verificationWrite,resetVerificationSession} from '../src/api/verification.api.js';
import {listNotifications} from '../src/api/notifications.api.js';
import {notificationPath} from '../src/utils/notifications.js';

if(process.env.INTEGRATION_TARGET_IS_TEST_DB!=='yes')throw new Error('Explicit isolated test-target confirmation is required.');
const origin=new URL(process.env.INTEGRATION_ORIGIN||'http://127.0.0.1:5178');
if(origin.protocol!=='http:'||!['localhost','127.0.0.1'].includes(origin.hostname)||origin.username||origin.password)
  throw new Error('Only a local HTTP origin is allowed.');
const nativeFetch=globalThis.fetch,scope=new AsyncLocalStorage(),cookies=new Map();
globalThis.fetch=async(path,options={})=>{
  assert.ok(typeof path==='string'&&path.startsWith('/api/'));
  const actor=scope.getStore();assert.ok(actor);
  const headers=new Headers(options.headers);
  if(cookies.has(actor))headers.set('Cookie',cookies.get(actor));
  const result=await nativeFetch(new URL(path,origin),{...options,headers,signal:options.signal||AbortSignal.timeout(15000)});
  for(const cookie of result.headers.getSetCookie())cookies.set(actor,cookie.split(';')[0]);
  return result;
};
const as=(actor,action)=>{resetVerificationSession();return scope.run(actor,action);};
const contribution='I built the reusable components, database queries and integration tests. Review the linked source and tests for my implementation of this skill.';
const rubric={accessible:true,relevant:true,contribution:true,substantial:true,credible:true};
try{
  const reviewer=(await as('reviewer',()=>loginUser({email:'verify2@example.test',password:'local-verification-fixture'}))).data;
  assert.equal(reviewer.role,'admin','Run the backend suite first to prepare its isolated reviewer fixture.');
  const email='verification-integration-'+randomUUID()+'@example.test',password='Local-'+randomUUID()+'!';
  const owner=(await as('owner',()=>registerUser({displayName:'Local Verification Applicant',email,password}))).data;
  await as('owner',()=>loginUser({email,password}));
  const skill=(await as('owner',()=>listSkills())).data[0];assert.ok(skill);
  await as('owner',()=>addSkill('offered',skill.id));
  const submit=()=>as('owner',()=>verificationWrite('/api/verifications',owner.id,{skillId:skill.id,contribution,evidence:[{url:'https://github.com/example/review-demo',description:'Inspect the implementation and tests.'}]}));
  const read=id=>as('owner',()=>verificationRead('/api/verifications/'+id,owner.id));
  const decide=(item,decision)=>as('reviewer',()=>verificationWrite('/api/admin/verifications/'+item.id+'/'+(decision==='revoked'?'revoke':'decision'),reviewer.id,
    {version:item.version,feedback:'Local integration review feedback.',rubric,...(decision==='revoked'?{}:{decision})}));
  let item=(await submit()).data;assert.equal(item.status,'pending');
  const queue=await as('reviewer',()=>verificationRead('/api/admin/verifications',reviewer.id,{status:'pending',userId:owner.id}));
  assert.ok(queue.data.some(r=>r.id===item.id));
  await assert.rejects(as('owner',()=>verificationRead('/api/admin/verifications',owner.id)),e=>e.status===403);
  item=(await decide(item,'rejected')).data;assert.equal(item.status,'rejected');
  const firstId=item.id;item=(await submit()).data;assert.notEqual(item.id,firstId);
  item=(await decide(item,'approved')).data;
  assert.equal((await as('owner',()=>getMySkills())).data.offered.find(s=>s.id===skill.id).evidenceReviewed,true);
  assert.equal((await read(firstId)).data.status,'rejected');
  console.log('PASS submission, reviewer queue, developer authorization, rejection, resubmission and approved badge');
  item=(await decide(item,'revoked')).data;assert.equal(item.status,'revoked');
  assert.ok(!(await as('owner',()=>getMySkills())).data.offered.find(s=>s.id===skill.id).evidenceReviewed);
  const notices=(await as('owner',()=>listNotifications(owner.id))).data;
  for(const type of ['verification_approved','verification_rejected','verification_revoked']){
    const notice=notices.find(n=>n.type===type);assert.ok(notice);assert.ok(notificationPath(notice).startsWith('/verifications/'));
  }
  item=(await submit()).data;item=(await decide(item,'approved')).data;
  await as('owner',()=>removeSkill('offered',skill.id));
  assert.equal((await read(item.id)).data.status,'withdrawn');
  await as('owner',()=>addSkill('offered',skill.id));
  assert.ok(!(await as('owner',()=>getMySkills())).data.offered.find(s=>s.id===skill.id).evidenceReviewed);
  assert.equal((await read(item.id)).data.history.length,3);
  console.log('PASS revocation, all decision notifications, historical events and removal/re-add badge retirement');
  await as('owner',()=>logoutUser());
  await assert.rejects(read(item.id),e=>e.status===401);
  console.log('PASS logout prevents further private evidence access');
}finally{globalThis.fetch=nativeFetch;}

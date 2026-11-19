import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {validateSubmission,badgeVisible,canReview} from '../src/utils/verification.js';
import {notificationText,notificationPath} from '../src/utils/notifications.js';
import {verificationRead,verificationWrite,resetVerificationSession} from '../src/api/verification.api.js';
const fetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=fetch;resetVerificationSession();});
const fields={skillId:1,contribution:'I built the components and data layer in this project. The linked tests demonstrate the behavior I implemented.',evidence:[{url:'https://github.com/demo/project',description:'Inspect components and tests.'}]};
const response=(payload,status=200)=>new Response(JSON.stringify(payload),{status});
test('evidence form validates contribution, public URLs, descriptions and duplicates',()=>{
 assert.deepEqual(validateSubmission(fields),{});
 for(const url of ['http://github.com/a','https://127.0.0.1','https://[::1]/','https://user:password@github.com','https://2130706433','https://host.internal','javascript:alert(1)'])
  assert.ok(Object.keys(validateSubmission({...fields,evidence:[{url,description:'Evidence'}]})).length);
 assert.ok(validateSubmission({...fields,evidence:[...fields.evidence,...fields.evidence]}).evidence);
 assert.ok(validateSubmission({...fields,contribution:'short'}).contribution);
 assert.ok(validateSubmission({...fields,evidence:[]}).evidence);
});
test('badges require server approval metadata and self-review controls are unavailable',()=>{
 assert.equal(badgeVisible({evidenceReviewed:true}),true);assert.equal(badgeVisible({status:'pending'}),false);
 assert.equal(badgeVisible({evidenceReviewed:'true'}),false);
 assert.equal(canReview({id:1,role:'admin'},{userId:1}),false);
 assert.equal(canReview({id:2,role:'developer'},{userId:1}),false);
 assert.equal(canReview({id:2,role:'admin'},{userId:1}),true);
});
test('all verification notification outcomes navigate to the private submission',()=>{
 for(const type of ['verification_approved','verification_rejected','verification_revoked']){
  const item={type,actor:{displayName:'Reviewer'},verificationId:7};
  assert.equal(notificationPath(item),'/verifications/7');assert.ok(!notificationText(item).includes('collaboration'));
 }
});
test('verification writes use session credentials and CSRF, without retrying uncertain writes',async()=>{
 const calls=[];globalThis.fetch=async(url,options)=>{calls.push({url,options});return calls.length===1?response({data:{csrfToken:'token',userId:1}}):response({data:{id:7},meta:{userId:1}});};
 await verificationWrite('/api/verifications',1,fields);
 assert.equal(calls[1].options.credentials,'include');assert.equal(calls[1].options.headers['X-CSRF-Token'],'token');
 globalThis.fetch=async()=>{throw new Error('offline');};
 await assert.rejects(verificationWrite('/api/verifications',1,fields),{code:'NETWORK_ERROR'});
});
test('account changes prevent writing and discard private read results',async()=>{
 globalThis.fetch=async()=>response({data:{csrfToken:'token',userId:2}});
 await assert.rejects(verificationWrite('/api/verifications',1,fields),{code:'SESSION_CHANGED'});
 globalThis.fetch=async()=>response({data:{contribution:'other account'},meta:{userId:2}});
 await assert.rejects(verificationRead('/api/verifications/1',1),{code:'SESSION_CHANGED'});
});
test('logout cancels a pending evidence read before exposing its result',async()=>{
 let release;globalThis.fetch=()=>new Promise(resolve=>{release=resolve;});
 const pending=verificationRead('/api/verifications/1',1);resetVerificationSession();
 release(response({data:{contribution:'private'},meta:{userId:1}}));
 await assert.rejects(pending,{name:'AbortError'});
});

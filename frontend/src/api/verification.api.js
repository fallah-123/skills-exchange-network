import {ApiError,request} from './client.js';
let epoch=0;let token=null;
export function resetVerificationSession(){epoch++;token=null;}
function check(version,userId,responseId,signal){
 signal?.throwIfAborted();
 if(version!==epoch)throw new DOMException('Session changed.','AbortError');
 if(userId!==responseId){token=null;throw new ApiError({status:409,code:'SESSION_CHANGED',message:'Your account changed. Reload the application.'});}
}
export async function verificationRead(path,userId,query,signal){
 const version=epoch;const result=await request('GET',path,{query,signal});
 check(version,userId,result.meta?.userId,signal);return result;
}
export async function verificationWrite(path,userId,body,signal){
 const version=epoch;
 for(let attempt=0;attempt<2;attempt++){
   check(version,userId,userId,signal);
   if(!token||token.userId!==userId){
     const response=await request('GET','/api/verifications/csrf-token',{signal});
     check(version,userId,response.data.userId,signal);token=response.data;
   }
   try {
     const result=await request('POST',path,{body,signal,headers:{'X-CSRF-Token':token.csrfToken}});
     check(version,userId,result.meta?.userId,signal);return result;
   }catch(error){check(version,userId,userId,signal);if(error.code!=='CSRF_INVALID'||attempt===1)throw error;token=null;}
 }
}

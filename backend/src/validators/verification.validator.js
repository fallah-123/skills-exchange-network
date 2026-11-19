import { isIP } from 'node:net';
import { throwValidationErrors, isValidId, validatePositiveQuery } from './common.validator.js';
export const RUBRIC_KEYS = ['accessible','relevant','contribution','substantial','credible'];
const statuses = ['pending','approved','rejected','revoked','withdrawn'];
function shape(body, allowed, errors) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) { errors.body='Send a JSON object.'; return {}; }
  if (Object.keys(body).some(key => !allowed.includes(key))) errors.body='Unsupported field.';
  return body;
}
export function evidenceUrl(value) {
  if (typeof value !== 'string' || value.length > 1000 || /[\s\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g,'');
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null;
    // Evidence is opened manually, never fetched. Reject IP literals entirely,
    // single-label/local names and common private suffixes without DNS requests.
    if (isIP(host) || !host.includes('.') || /(^|\.)(localhost|local|internal|test|invalid|example|onion)$/.test(host)) return null;
    return url.href.length <= 1000 ? url.href : null;
  } catch { return null; }
}
export function submission(body) {
  const errors={}; body=shape(body,['skillId','contribution','evidence'],errors);
  if (!isValidId(body.skillId)) errors.skillId='Select an offered skill.';
  const contribution=typeof body.contribution==='string'?body.contribution.trim():'';
  if ([...contribution].length<50 || [...contribution].length>1500) errors.contribution='Explain your personal contribution in 50–1500 characters.';
  if (!Array.isArray(body.evidence) || body.evidence.length<1 || body.evidence.length>3) errors.evidence='Provide one to three evidence links.';
  const evidence=(Array.isArray(body.evidence)?body.evidence:[]).slice(0,3).map((entry,index)=>{
    entry=shape(entry,['url','description'],errors);
    const url=evidenceUrl(entry.url);
    const description=typeof entry.description==='string'?entry.description.trim():'';
    if (!url) errors['evidence'+index]='Use a public HTTPS URL without credentials or a private address.';
    if (!description || [...description].length>300) errors['description'+index]='Describe this evidence in 1–300 characters.';
    return {url,description};
  });
  if (new Set(evidence.map(e=>e.url)).size!==evidence.length) errors.evidence='Each evidence URL must be different.';
  if (Buffer.byteLength(JSON.stringify(body),'utf8')>9500) errors.body='Submission is too large. Shorten the evidence descriptions.';
  throwValidationErrors(errors); return {skillId:body.skillId,contribution,evidence};
}
export function action(body, mode) {
  const errors={};body=shape(body,mode==='withdraw'?['version']:['version','decision','feedback','rubric'],errors);
  if (!isValidId(body.version)) errors.version='Provide the displayed request version.';
  if (mode==='withdraw') { throwValidationErrors(errors);return {version:body.version}; }
  const decision=mode==='revoke'?'revoked':body.decision;
  if ((mode==='decision' && !['approved','rejected'].includes(decision)) ||
      (mode==='revoke' && body.decision!==undefined)) errors.decision='Choose a valid review decision.';
  const feedback=typeof body.feedback==='string'?body.feedback.trim():'';
  if (!feedback || [...feedback].length>1000) errors.feedback='Provide feedback in 1–1000 characters.';
  const rubric=body.rubric??{};
  if (!rubric || typeof rubric!=='object' || Array.isArray(rubric) || Object.entries(rubric).some(([k,v])=>!RUBRIC_KEYS.includes(k)||typeof v!=='boolean')) errors.rubric='Use the review checklist.';
  if (decision==='approved' && RUBRIC_KEYS.some(k=>rubric?.[k]!==true)) errors.rubric='Confirm every review criterion before approving.';
  throwValidationErrors(errors);return {version:body.version,decision,feedback,rubric};
}
export function query(input) {
  const errors={};
  if (Object.keys(input).some(k=>!['status','page','limit','skillId','userId'].includes(k))) errors.query='Unsupported query field.';
  if (input.status!==undefined && !statuses.includes(input.status)) errors.status='Choose a valid status.';
  for (const key of ['skillId','userId']) if (input[key]!==undefined && !/^[1-9]\d*$/.test(input[key])) errors[key]='Use a valid ID.';
  throwValidationErrors(errors);
  return {status:input.status,page:validatePositiveQuery(input.page,'page',1,100000),limit:validatePositiveQuery(input.limit,'limit',20,50),
    skillId:input.skillId?validatePositiveQuery(input.skillId,'skillId',1,2147483647):null,
    userId:input.userId?validatePositiveQuery(input.userId,'userId',1,2147483647):null};
}

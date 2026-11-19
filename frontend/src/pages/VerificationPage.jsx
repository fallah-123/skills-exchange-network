import {useEffect,useRef,useState} from 'react';
import {Link,useLocation,useNavigate,useParams,useSearchParams} from 'react-router-dom';
import {useAuth} from '../context/AuthContext.jsx';
import {getMySkills} from '../api/skills.api.js';
import {verificationRead,verificationWrite} from '../api/verification.api.js';
import {BADGE_EXPLANATION,REVIEW_CRITERIA,validateSubmission,canReview,contributionCharacterCount} from '../utils/verification.js';
import useApi from '../hooks/useApi.js';
import useDocumentTitle from '../hooks/useDocumentTitle.js';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import LoadingBlock from '../components/ui/LoadingBlock.jsx';
import './VerificationPage.css';
const labels={pending:'Pending review',approved:'Evidence Reviewed',rejected:'Rejected',revoked:'Revoked',withdrawn:'Withdrawn'};
export function VerificationStatus({status}){return <span className={'verification-status verification-status--'+status}>{labels[status]||'Unverified'}</span>;}
export default function VerificationPage(){
 const {user}=useAuth();
 return <VerificationContent key={user.id} user={user}/>;
}
function VerificationContent({user}){
 const {id}=useParams();const location=useLocation();const admin=location.pathname.startsWith('/admin/');
 const isNew=location.pathname==='/verifications/new';
 useDocumentTitle(admin?'Verification review':'Skill verification');
 if(isNew)return <SubmissionForm user={user}/>;
 if(id)return <SubmissionDetail key={id+':'+admin} id={id} user={user} admin={admin}/>;
 return <SubmissionList user={user} admin={admin}/>;
}
function SubmissionList({user,admin}){
 const [params,setParams]=useSearchParams();const status=params.has('status')?params.get('status'):(admin?'pending':'');
 const page=Math.max(1,Number(params.get('page'))||1);
 const base=admin?'/admin/verifications':'/verifications';
 const query={status:status||undefined,page,skillId:params.get('skillId')||undefined,userId:admin?(params.get('userId')||undefined):undefined};
 const result=useApi(signal=>verificationRead('/api'+base+(admin?'':'/me'),user.id,query,signal),[user.id,admin,status,page,query.skillId,query.userId]);
 return <div className="page-shell verification-page"><div className="verification-heading"><div><p className="eyebrow">{admin?'REVIEW WORKSPACE':'YOUR EVIDENCE'}</p><h1>{admin?'Skill verification reviews':'My skill verifications'}</h1></div>
 {!admin&&<Link className="button button--primary" to="/verifications/new">Request verification</Link>}</div>
 <p>{admin?'Review contributions consistently. Evidence review is not an independent proficiency assessment.':'Verification is optional. You can continue learning and collaborating while a request is pending.'}</p>
 <div className="verification-toolbar"><label htmlFor="verification-filter">Status</label><select id="verification-filter" value={status} onChange={e=>{const next=new URLSearchParams(params);next.set('status',e.target.value);next.delete('page');setParams(next);}}>
 <option value="">{admin?'All statuses':'All my submissions'}</option>{Object.entries(labels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><Button variant="secondary" onClick={result.reload}>Refresh</Button></div>
 {result.error?<ErrorState message={result.error.message} onRetry={result.reload}/>:result.isLoading?<LoadingBlock label="Loading verification submissions"/>:
 result.data?.length?<div className="verification-grid">{result.data.map(item=><Card key={item.id}><div className="verification-heading"><h2>{item.skillName}</h2><VerificationStatus status={item.status}/></div>
 {admin&&<p>{item.displayName} · Developer #{item.userId}</p>}<p>Submitted {new Date(item.createdAt).toLocaleString()}</p><Link to={base+'/'+item.id}>View evidence and history</Link></Card>)}</div>:
 <Card><h2>No submissions here</h2><p>{admin?'New requests will appear in this queue.':'Add an offered skill, then submit evidence when you are ready.'}</p></Card>}
 <div className="verification-toolbar"><Button variant="secondary" disabled={page<=1||result.isLoading} onClick={()=>{const next=new URLSearchParams(params);next.set('page',page-1);setParams(next);}}>Previous</Button><span>Page {page}</span>
 <Button variant="secondary" disabled={result.isLoading||page*20>=(result.meta?.total||0)} onClick={()=>{const next=new URLSearchParams(params);next.set('page',page+1);setParams(next);}}>Next</Button></div></div>;
}
function SubmissionForm({user}){
 const [params]=useSearchParams();const navigate=useNavigate();
 const skills=useApi(signal=>getMySkills(signal),[user.id]);
 const [fields,setFields]=useState({skillId:Number(params.get('skillId'))||0,contribution:'',evidence:[{url:'',description:''}]});
 const [errors,setErrors]=useState({});const [failure,setFailure]=useState('');const [busy,setBusy]=useState(false);const flight=useRef(null);
 useEffect(()=>()=>flight.current?.abort(),[]);
 function evidence(index,key,value){setFields(f=>({...f,evidence:f.evidence.map((e,i)=>i===index?{...e,[key]:value}:e)}));}
 async function submit(event){
   event.preventDefault();if(flight.current)return;
   const invalid=validateSubmission(fields);setErrors(invalid);if(Object.keys(invalid).length)return;
   const controller=new AbortController();flight.current=controller;setBusy(true);setFailure('');
   try{const result=await verificationWrite('/api/verifications',user.id,fields,controller.signal);navigate('/verifications/'+result.data.id,{replace:true});}
   catch(error){if(error.name!=='AbortError'){setFailure(error.message);if(error.details)setErrors(error.details);}}
   finally{flight.current=null;if(!controller.signal.aborted)setBusy(false);}
 }
 return <div className="page-shell verification-page"><Link to="/verifications">← My verification history</Link><h1>Request skill verification</h1><p>{BADGE_EXPLANATION}</p>
 {skills.error?<ErrorState message={skills.error.message} onRetry={skills.reload}/>:skills.isLoading?<LoadingBlock label="Loading offered skills"/>:
 !skills.data?.offered.length?<Card><p>Add a skill you offer before requesting verification.</p><Link to="/skills">Manage skills</Link></Card>:
 <form className="verification-form" onSubmit={submit} noValidate><Card><label htmlFor="verification-skill">Offered skill</label><select id="verification-skill" value={fields.skillId} disabled={busy} onChange={e=>setFields(f=>({...f,skillId:Number(e.target.value)}))}><option value={0}>Select a skill</option>{skills.data.offered.map(s=><option key={s.id} value={s.id} disabled={s.evidenceReviewed||s.verificationStatus==='pending'}>{s.name}{s.evidenceReviewed?' — Evidence Reviewed':''}</option>)}</select>
 {errors.skillId&&<p role="alert">{errors.skillId}</p>}
 <label htmlFor="verification-contribution">Your personal contribution</label><p id="contribution-help">Explain what the project does, what you implemented, how it demonstrates this skill, and where the reviewer should look. Use 50–1500 characters.</p>
 <textarea id="verification-contribution" aria-describedby="contribution-help contribution-count" rows={7} value={fields.contribution} disabled={busy} onChange={e=>setFields(f=>({...f,contribution:e.target.value}))}/>
 <p id="contribution-count" className="verification-character-count" role="status" aria-live="polite" aria-atomic="true">{contributionCharacterCount(fields.contribution)} / 1500 characters</p>
 {errors.contribution&&<p role="alert">{errors.contribution}</p>}</Card>
 {fields.evidence.map((item,index)=><Card key={index}><fieldset disabled={busy}><legend>Evidence {index+1}</legend>
 <label htmlFor={'evidence-url-'+index}>Public HTTPS link</label><input id={'evidence-url-'+index} type="url" value={item.url} onChange={e=>evidence(index,'url',e.target.value)} placeholder="https://github.com/owner/project"/>
 {errors['evidence'+index]&&<p role="alert">{errors['evidence'+index]}</p>}
 <label htmlFor={'evidence-description-'+index}>What should the reviewer inspect?</label><textarea id={'evidence-description-'+index} rows={3} value={item.description} onChange={e=>evidence(index,'description',e.target.value)}/>
 {errors['description'+index]&&<p role="alert">{errors['description'+index]}</p>}
 {fields.evidence.length>1&&<Button variant="secondary" onClick={()=>setFields(f=>({...f,evidence:f.evidence.filter((_,i)=>i!==index)}))}>Remove evidence {index+1}</Button>}</fieldset></Card>)}
 {fields.evidence.length<3&&<Button variant="secondary" disabled={busy} onClick={()=>setFields(f=>({...f,evidence:[...f.evidence,{url:'',description:''}]}))}>Add another link</Button>}
 <p>Submit only material you may share. Do not include passwords, access tokens, private documents, or confidential code. Submitted evidence cannot be edited; withdraw and submit a new attempt to correct it.</p>
 {(failure||errors.evidence||errors.body)&&<p role="alert" className="verification-error">{failure||errors.evidence||errors.body}</p>}
 <Button type="submit" disabled={busy}>{busy?'Submitting…':'Submit for review'}</Button></form>}</div>;
}
function SubmissionDetail({id,user,admin}){
 const base=admin?'/admin/verifications':'/verifications';
 const result=useApi(signal=>verificationRead('/api'+base+'/'+id,user.id,undefined,signal),[id,user.id,admin]);
 const [feedback,setFeedback]=useState('');const [rubric,setRubric]=useState({});const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const [confirmation,setConfirmation]=useState(null);const dialog=useRef(null);const returnFocus=useRef(null);const flight=useRef(null);
 useEffect(()=>()=>flight.current?.abort(),[]);
 useEffect(()=>{if(!confirmation)return;returnFocus.current=document.activeElement;dialog.current.showModal();return()=>{dialog.current?.close();returnFocus.current?.focus();};},[confirmation]);
 async function decide(action){
   if(flight.current)return;
   const controller=new AbortController();flight.current=controller;setBusy(true);setError('');setConfirmation(null);
   try{
     await verificationWrite('/api'+base+'/'+id+'/'+(admin?(action==='revoked'?'revoke':'decision'):'withdraw'),user.id,
      admin?{version:result.data.version,feedback,rubric,...(action==='revoked'?{}:{decision:action})}:{version:result.data.version},controller.signal);
     setFeedback('');setRubric({});result.reload();
   }catch(failure){if(failure.name!=='AbortError'){setError(failure.message);if([403,409].includes(failure.status))result.reload();}}
   finally{flight.current=null;if(!controller.signal.aborted)setBusy(false);}
 }
 if(result.isLoading)return <div className="page-shell"><LoadingBlock label="Loading evidence and review history"/></div>;
 if(result.error)return <div className="page-shell"><ErrorState message={result.error.message} onRetry={result.reload}/><Link to={base}>Return to submissions</Link></div>;
 const item=result.data;if(!item)return null;
 const allowed=admin&&canReview(user,item)&&['pending','approved'].includes(item.status);
 return <div className="page-shell verification-page"><Link to={base}>← {admin?'Review queue':'My submissions'}</Link><div className="verification-heading"><h1>{item.skillName}</h1><VerificationStatus status={item.status}/></div>
 <p>{item.displayName} · Submission #{item.id} · Version {item.version}</p><p>{BADGE_EXPLANATION}</p>
 <div className="verification-detail"><div><Card><h2>Developer contribution</h2><p className="verification-preserve">{item.contribution}</p></Card>
 <Card><h2>Evidence</h2><p>External links are supplied by the developer. Inspect them manually; do not enter platform credentials on an evidence site.</p>
 <ol className="verification-evidence">{item.evidence.map(e=><li key={e.position}><a href={e.url} target="_blank" rel="noopener noreferrer">{e.url}</a><p className="verification-preserve">{e.description}</p></li>)}</ol></Card>
 <Card><h2>Submission history</h2><ol>{item.history.map(event=><li key={event.id}><strong>{event.action==='submitted'?'Submitted':labels[event.action]}</strong> · {event.actorName} · <time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time>
 {event.note&&<p className="verification-preserve">{event.note}</p>}{event.action==='approved'&&<p>All five evidence-review criteria confirmed.</p>}</li>)}</ol>
 <Link to={base+'?status=&skillId='+item.skillId+(admin?'&userId='+item.userId:'')}>View all attempts for this skill</Link></Card></div><aside>
 {allowed&&<Card><h2>{item.status==='approved'?'Revoke verification':'Review this evidence'}</h2>
 {item.status==='pending'&&<fieldset disabled={busy}><legend>Evidence review checklist</legend>{REVIEW_CRITERIA.map(([key,label])=><label className="verification-check" key={key}><input type="checkbox" checked={rubric[key]===true} onChange={e=>setRubric(r=>({...r,[key]:e.target.checked}))}/>{label}</label>)}</fieldset>}
 <label htmlFor="review-feedback">{item.status==='approved'?'Reason for revocation':'Review feedback'}</label><textarea id="review-feedback" rows={5} value={feedback} maxLength={1000} disabled={busy} onChange={e=>setFeedback(e.target.value)}/>
 <p>Explain your decision. Feedback is visible to the applicant.</p><div className="verification-actions">{item.status==='pending'?<><Button disabled={busy||!feedback.trim()||REVIEW_CRITERIA.some(([k])=>!rubric[k])} onClick={()=>setConfirmation('approved')}>Approve evidence</Button>
 <Button variant="secondary" disabled={busy||!feedback.trim()} onClick={()=>setConfirmation('rejected')}>Reject with feedback</Button></>:<Button variant="danger" disabled={busy||!feedback.trim()} onClick={()=>setConfirmation('revoked')}>Revoke verification</Button>}</div></Card>}
 {admin&&item.userId===user.id&&<Card><p>You cannot review your own submission. An independent administrator is required.</p></Card>}
 {!admin&&item.status==='pending'&&<Card><h2>Need to change your evidence?</h2><p>Withdraw this submission, then create a new attempt. This history will remain available.</p><Button variant="secondary" disabled={busy} onClick={()=>setConfirmation('withdrawn')}>Withdraw submission</Button></Card>}
 {!admin&&['rejected','withdrawn','revoked'].includes(item.status)&&<Card><h2>Submit a new attempt</h2><p>Address the feedback and ensure this skill is still in your offered list.</p><Link to={'/verifications/new?skillId='+item.skillId}>Prepare new evidence</Link></Card>}
 {error&&<p role="alert" className="verification-error">{error}</p>}{busy&&<p role="status">Saving decision…</p>}</aside></div>
 {confirmation&&<dialog ref={dialog} className="verification-dialog" aria-labelledby="review-confirm-title" onCancel={e=>{e.preventDefault();setConfirmation(null);}}>
 <h2 id="review-confirm-title">{confirmation==='approved'?'Approve this evidence?':confirmation==='rejected'?'Reject this submission?':confirmation==='revoked'?'Revoke this verification?':'Withdraw this submission?'}</h2>
 <p>This action is recorded in the submission history.{confirmation==='approved'?' The badge confirms evidence review, not independently assessed proficiency.':''}</p>
 <div className="verification-actions"><Button variant="secondary" autoFocus onClick={()=>setConfirmation(null)}>Cancel</Button><Button onClick={()=>decide(confirmation)}>Confirm</Button></div></dialog>}</div>;
}

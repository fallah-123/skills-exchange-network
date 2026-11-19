export const BADGE_EXPLANATION='Supporting evidence for this skill was reviewed by Skill Developers Network. This does not independently certify proficiency or identity.';
export const REVIEW_CRITERIA=[
 ['accessible','Evidence is accessible'],['relevant','Evidence is relevant to this skill'],
 ['contribution','Personal contribution is identifiable'],['substantial','The work demonstrates meaningful technical use'],
 ['credible','Authorship claims are reasonably supported'],
];
// Match contribution validation: count Unicode code points after trimming outer whitespace.
export function contributionCharacterCount(value) {
 return [...value.trim()].length;
}
export function validateSubmission(fields) {
 const errors={};
 if(!Number.isInteger(fields.skillId)||fields.skillId<=0) errors.skillId='Choose an offered skill.';
 if(typeof fields.contribution!=='string'||contributionCharacterCount(fields.contribution)<50||contributionCharacterCount(fields.contribution)>1500)
   errors.contribution='Explain your contribution in 50–1500 characters.';
 const evidence=Array.isArray(fields.evidence)?fields.evidence:[];
 if(evidence.length<1||evidence.length>3) errors.evidence='Provide one to three links.';
 const seen=new Set();
 evidence.forEach((item,index)=>{
   try {
     const url=new URL(item.url);const host=url.hostname.toLowerCase();
     if(item.url.length>1000||/[\s\\]/.test(item.url)||url.protocol!=='https:'||url.username||url.password||
       (url.port&&url.port!=='443')||host.includes(':')||/^\d+\.\d+\.\d+\.\d+$/.test(host)||!host.includes('.')||
       /(^|\.)(localhost|local|internal|test|invalid|example|onion)$/.test(host)) throw new Error();
     if(seen.has(url.href)) errors.evidence='Each evidence URL must be different.';
     seen.add(url.href);
   }catch{errors['evidence'+index]='Use a public HTTPS URL without credentials or a private address.';}
   if(typeof item.description!=='string'||!item.description.trim()||[...item.description.trim()].length>300)
     errors['description'+index]='Describe this evidence in 1–300 characters.';
 });
 if(new TextEncoder().encode(JSON.stringify(fields)).length>9500) errors.body='Submission is too large. Shorten the descriptions.';
 return errors;
}
export function canReview(user,submission) {return user?.role==='admin'&&user.id!==submission.userId;}
export function badgeVisible(skill) {return skill?.evidenceReviewed===true;}

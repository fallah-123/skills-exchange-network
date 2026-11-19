import {BADGE_EXPLANATION,badgeVisible} from '../../utils/verification.js';
export default function VerificationBadge({skill}){
 return badgeVisible(skill)?<span className="verification-badge" title={BADGE_EXPLANATION}>✓ Evidence Reviewed<span className="sr-only">. {BADGE_EXPLANATION}</span></span>:null;
}

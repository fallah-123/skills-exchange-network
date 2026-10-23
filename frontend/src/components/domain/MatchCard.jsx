// Presents a recommendation's score, explanation, skill overlap, and request action.
import { Link } from 'react-router-dom';
import Badge from '../ui/Badge.jsx';
import Card from '../ui/Card.jsx';
import { formatExperienceLevel } from '../../utils/format.js';
import ConnectionAction from './ConnectionAction.jsx';
import ScoreBar from './ScoreBar.jsx';
import SkillChip from './SkillChip.jsx';
import { MATCH_TYPE } from '../../constants.js';
import './MatchCard.css';

const MATCH_TYPES = {
  [MATCH_TYPE.MUTUAL]: 'Mutual match',
  [MATCH_TYPE.THEY_OFFER]: 'They offer what you want',
  [MATCH_TYPE.YOU_OFFER]: 'You offer what they want'
};

function SkillGroup({ title, skills, category }) {
  return (
    <section className="match-card__skill-group">
      <h3>{title}</h3>
      {skills.length ? <div>{skills.map((skill) => <SkillChip key={skill.id} skill={skill} category={category} />)}</div> : <p>No shared skills in this direction.</p>}
    </section>
  );
}

/** Renders a full or compact skill-overlap recommendation card. */
export default function MatchCard({ match, onChanged, compact = false }) {
  const developer = match.developer;
  return (
    <Card className={`match-card${compact ? ' match-card--compact' : ''}`}>
      <div className="match-card__heading">
        <h2><Link to={`/developers/${developer.id}`}>{developer.displayName}</Link></h2>
        {developer.experienceLevel ? <Badge>{formatExperienceLevel(developer.experienceLevel)}</Badge> : null}
      </div>
      <Badge variant="wanted">{MATCH_TYPES[match.matchType] || match.matchType}</Badge>
      <ScoreBar score={match.score} />
      <p className="match-card__explanation">{match.explanation}</p>
      <div className="match-card__skills">
        <SkillGroup title="They offer, you want" skills={match.theyOfferYouWant} category="offered" />
        <SkillGroup title="You offer, they want" skills={match.youOfferTheyWant} category="wanted" />
      </div>
      <Link className="match-card__profile-link" to={`/developers/${developer.id}`}>View profile</Link>
      <ConnectionAction key={match.connection?.requestId || match.connection?.status || 'none'} developerId={developer.id} connection={match.connection} onChanged={onChanged} />
    </Card>
  );
}

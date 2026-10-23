// Summarizes a developer for searchable and recommended result grids.
import { Link } from 'react-router-dom';
import Badge from '../ui/Badge.jsx';
import Card from '../ui/Card.jsx';
import { formatExperienceLevel } from '../../utils/format.js';
import { DEVELOPER_CARD_SKILL_LIMIT, REQUEST_STATUS } from '../../constants.js';
import './DeveloperCard.css';

/** Renders a compact developer summary and its offered skills. */
export default function DeveloperCard({ developer }) {
  const skills = developer.offeredSkills || [];
  const connectionLabel = developer.connection?.status === REQUEST_STATUS.ACCEPTED
    ? 'Connected'
    : developer.connection?.direction === 'incoming' ? 'Request received' : 'Request pending';
  return (
    <Card className="developer-card">
      <div className="developer-card__heading">
        <h2><Link to={`/developers/${developer.id}`}>{developer.displayName}</Link></h2>
        {developer.experienceLevel ? <Badge>{formatExperienceLevel(developer.experienceLevel)}</Badge> : null}
      </div>
      {developer.connection ? <Badge variant={developer.connection.status === REQUEST_STATUS.ACCEPTED ? 'accepted' : 'pending'}>{connectionLabel}</Badge> : null}
      <p className="developer-card__bio">{developer.bio || 'No bio added yet.'}</p>
      <h3>Skills they offer</h3>
      {skills.length ? (
        <div className="developer-card__skills">
          {skills.slice(0, DEVELOPER_CARD_SKILL_LIMIT).map((skill) => <Badge key={skill.id} variant="offered">{skill.name}</Badge>)}
          {skills.length > DEVELOPER_CARD_SKILL_LIMIT ? <span className="developer-card__more">+{skills.length - DEVELOPER_CARD_SKILL_LIMIT} more</span> : null}
        </div>
      ) : <p className="developer-card__muted">No offered skills listed.</p>}
      <Link className="developer-card__link" to={`/developers/${developer.id}`}>View profile</Link>
    </Card>
  );
}

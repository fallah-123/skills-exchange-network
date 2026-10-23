// Displays a single developer profile with safely validated external URLs.
import { Link, useParams } from 'react-router-dom';
import { getDeveloper } from '../api/developers.api.js';
import { useAuth } from '../context/AuthContext.jsx';
import ConnectionAction from '../components/domain/ConnectionAction.jsx';
import SkillChip from '../components/domain/SkillChip.jsx';
import Badge from '../components/ui/Badge.jsx';
import Card from '../components/ui/Card.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import LoadingBlock from '../components/ui/LoadingBlock.jsx';
import useApi from '../hooks/useApi.js';
import useDocumentTitle from '../hooks/useDocumentTitle.js';
import { formatExperienceLevel } from '../utils/format.js';
import { MAX_ENTITY_ID } from '../constants.js';
import './DeveloperProfilePage.css';

function isPositiveIntegerId(value) {
  return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) <= MAX_ENTITY_ID;
}

function InvalidDeveloperProfile() {
  useDocumentTitle('Not found');
  return <div className="page-shell"><h1>Page not found</h1><p>This developer profile URL is invalid.</p><Link to="/">Go home</Link></div>;
}

function SafeProfileLink({ label, value }) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') return <p><strong>{label}:</strong> <a href={url.href} target="_blank" rel="noopener noreferrer">{value}</a></p>;
  } catch {
    return <p><strong>{label}:</strong> {value}</p>;
  }
  return <p><strong>{label}:</strong> {value}</p>;
}

function ValidDeveloperProfile({ id }) {
  const request = useApi((signal) => getDeveloper(id, signal), [id]);
  const { user } = useAuth();
  const developer = request.data;
  useDocumentTitle(developer?.displayName || 'Developer Profile');
  if (request.isLoading) return <div className="page-shell"><LoadingBlock label="Loading developer profile" /></div>;
  if (request.error?.status === 404) return <div className="page-shell"><h1>Developer not found</h1><p>This developer profile is no longer available.</p><Link to="/developers">Back to Discover</Link></div>;
  if (request.error) return <div className="page-shell"><h1>Developer profile</h1><ErrorState message={request.error.message} onRetry={request.reload} /></div>;
  if (!developer) return null;
  const ownProfile = Number(developer.id) === Number(user?.id);
  return (
    <div className="page-shell developer-profile">
      <Link to="/developers">← Discover developers</Link>
      <div className="developer-profile__title">
        <h1>{developer.displayName}</h1>
        {developer.experienceLevel ? <Badge>{formatExperienceLevel(developer.experienceLevel)}</Badge> : null}
      </div>
      <Card className="developer-profile__details">
        <h2>About</h2>
        <p>{developer.bio || 'No bio added yet.'}</p>
        {developer.interests ? <p><strong>Interests:</strong> {developer.interests}</p> : null}
        <SafeProfileLink label="GitHub" value={developer.githubUrl} />
        <SafeProfileLink label="Portfolio" value={developer.portfolioUrl} />
      </Card>
      <div className="developer-profile__skills">
        <section>
          <h2>Offers</h2>
          {developer.offeredSkills.length ? <div>{developer.offeredSkills.map((skill) => <SkillChip key={skill.id} skill={skill} category="offered" />)}</div> : <p>No offered skills listed.</p>}
        </section>
        <section>
          <h2>Wants</h2>
          {developer.wantedSkills.length ? <div>{developer.wantedSkills.map((skill) => <SkillChip key={skill.id} skill={skill} category="wanted" />)}</div> : <p>No wanted skills listed.</p>}
        </section>
      </div>
      <section className="developer-profile__connection">
        <h2>Collaboration</h2>
        {ownProfile ? <p>This is how other developers see you. <Link to="/profile">Edit your profile</Link></p> : <ConnectionAction key={developer.connection?.requestId || developer.connection?.status || 'none'} developerId={developer.id} connection={developer.connection} onChanged={request.reload} />}
      </section>
    </div>
  );
}

/** Validates the route id before rendering a component that calls the API. */
export default function DeveloperProfilePage() {
  const { id = '' } = useParams();
  if (!isPositiveIntegerId(id)) {
    return <InvalidDeveloperProfile />;
  }
  return <ValidDeveloperProfile id={id} />;
}

// Composes four independently loading dashboard summaries from live API data.
import { Link } from 'react-router-dom';
import { getMyProfile } from '../api/profile.api.js';
import { getMySkills } from '../api/skills.api.js';
import { getMatches } from '../api/matches.api.js';
import { listRequests } from '../api/requests.api.js';
import MatchCard from '../components/domain/MatchCard.jsx';
import SkillChip from '../components/domain/SkillChip.jsx';
import Card from '../components/ui/Card.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import LoadingBlock from '../components/ui/LoadingBlock.jsx';
import useApi from '../hooks/useApi.js';
import useDocumentTitle from '../hooks/useDocumentTitle.js';
import { DASHBOARD_MATCH_LIMIT, REQUEST_STATUS } from '../constants.js';
import './DashboardPage.css';

function Section({ title, children }) {
  return <section className="dashboard-page__section"><h2>{title}</h2>{children}</section>;
}

function ProfileSummary() {
  const request = useApi((signal) => getMyProfile(signal), []);
  if (request.isLoading) return <LoadingBlock label="Loading profile" />;
  if (request.error) return <ErrorState message={request.error.message} onRetry={request.reload} />;
  const profile = request.data;
  if (!profile) return null;
  if (!profile.isComplete) {
    const missing = [];
    if (!profile.bio) missing.push('bio');
    if (!profile.experienceLevel) missing.push('experience level');
    return <div className="dashboard-page__profile-incomplete"><p>Complete your profile. Add your {missing.join(' and ')}.</p><Link to="/profile">Complete profile</Link></div>;
  }
  return <p>{profile.displayName} · {profile.experienceLevel[0].toUpperCase() + profile.experienceLevel.slice(1)} developer</p>;
}

function SkillsSummary() {
  const request = useApi((signal) => getMySkills(signal), []);
  if (request.isLoading) return <LoadingBlock label="Loading your skills" />;
  if (request.error) return <ErrorState message={request.error.message} onRetry={request.reload} />;
  const skills = request.data;
  if (!skills) return null;
  if (!skills.offered.length && !skills.wanted.length) return <EmptyState title="No skills listed yet."><Link to="/skills">Add your skills</Link></EmptyState>;
  return (
    <div className="dashboard-page__skill-groups">
      <div><h3>Skills you offer</h3>{skills.offered.length ? skills.offered.map((skill) => <SkillChip key={skill.id} skill={skill} category="offered" />) : <p>None listed.</p>}</div>
      <div><h3>Skills you want</h3>{skills.wanted.length ? skills.wanted.map((skill) => <SkillChip key={skill.id} skill={skill} category="wanted" />) : <p>None listed.</p>}</div>
      <Link to="/skills">Manage skills</Link>
    </div>
  );
}

function MatchesSummary() {
  const request = useApi((signal) => getMatches(DASHBOARD_MATCH_LIMIT, signal), []);
  if (request.isLoading) return <LoadingBlock label="Loading top matches" />;
  if (request.error) return <ErrorState message={request.error.message} onRetry={request.reload} />;
  if (!request.data) return null;
  if (!request.data.length) {
    const suggestion = !request.meta?.hasWantedSkills && !request.meta?.hasOfferedSkills
      ? 'Add skills you offer and skills you want.'
      : !request.meta?.hasWantedSkills ? 'Add skills you want to learn.'
        : !request.meta?.hasOfferedSkills ? 'Add skills you offer.' : 'As more developers join, new matches will appear.';
    return <EmptyState title="No matching developers found."><p>{suggestion} <Link to="/skills">Manage skills</Link></p></EmptyState>;
  }
  return <div className="dashboard-page__matches">{request.data.slice(0, DASHBOARD_MATCH_LIMIT).map((match) => <MatchCard key={match.developer.id} match={match} compact onChanged={request.reload} />)}<Link to="/matches">See all matches</Link></div>;
}

function RequestActivity() {
  const incoming = useApi((signal) => listRequests('incoming', REQUEST_STATUS.PENDING, signal), []);
  const outgoing = useApi((signal) => listRequests('outgoing', REQUEST_STATUS.PENDING, signal), []);
  return (
    <div className="dashboard-page__activity">
      {[['Incoming', incoming], ['Outgoing', outgoing]].map(([label, request]) => (
        <div key={label}>
          <h3>{label} ({request.data?.length || 0})</h3>
          {request.isLoading ? <LoadingBlock label={`Loading ${label.toLowerCase()} requests`} /> : null}
          {request.error ? <ErrorState message={request.error.message} onRetry={request.reload} /> : null}
          {!request.isLoading && !request.error && !request.data?.length ? <p>No pending {label.toLowerCase()} requests.</p> : null}
          {request.data?.slice(0, 3).map((item) => <p key={item.id}><Link to={`/developers/${item.counterpart.id}`}>{item.counterpart.displayName}</Link></p>)}
        </div>
      ))}
      <Link to="/requests">View all requests</Link>
    </div>
  );
}

/** Renders independent profile, skill, match, and request dashboard sections. */
export default function DashboardPage() {
  useDocumentTitle('Dashboard');
  return (
    <div className="page-shell dashboard-page">
      <h1>Dashboard</h1>
      <div className="dashboard-page__grid">
        <Card><Section title="Profile"><ProfileSummary /></Section></Card>
        <Card><Section title="My skills"><SkillsSummary /></Section></Card>
        <Card><Section title="Top matches"><MatchesSummary /></Section></Card>
        <Card><Section title="Request activity"><RequestActivity /></Section></Card>
      </div>
    </div>
  );
}

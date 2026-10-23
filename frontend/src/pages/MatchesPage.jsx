// Lists skill-overlap recommendations and explains matching requirements.
import { Link } from 'react-router-dom';
import { getMatches } from '../api/matches.api.js';
import MatchCard from '../components/domain/MatchCard.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import LoadingBlock from '../components/ui/LoadingBlock.jsx';
import useApi from '../hooks/useApi.js';
import useDocumentTitle from '../hooks/useDocumentTitle.js';
import './MatchesPage.css';

function EmptyMatches({ meta }) {
  if (!meta?.hasWantedSkills && !meta?.hasOfferedSkills) {
    return <EmptyState title="Add the skills you offer and the skills you want to get recommendations."><Link to="/skills">Manage skills</Link></EmptyState>;
  }
  if (!meta?.hasWantedSkills) {
    return <EmptyState title="Add skills you want to learn to get recommendations."><Link to="/skills">Manage skills</Link></EmptyState>;
  }
  if (!meta?.hasOfferedSkills) {
    return <EmptyState title="Add skills you offer to get recommendations."><Link to="/skills">Manage skills</Link></EmptyState>;
  }
  return <EmptyState title="No matching developers found. As more developers join, new matches will appear." />;
}

/** Renders recommendations with the documented skill-overlap explanation. */
export default function MatchesPage() {
  const request = useApi((signal) => getMatches(undefined, signal), []);
  useDocumentTitle('Recommended Developers');
  return (
    <div className="page-shell matches-page">
      <h1>Recommended Developers</h1>
      <p className="matches-page__note">Match strength is the average of how much of what you want they offer and how much of what they want you offer. It is a simple skill-overlap score, not a prediction.</p>
      {request.isLoading ? <LoadingBlock label="Finding matches" /> : null}
      {request.error ? <ErrorState message={request.error.message} onRetry={request.reload} /> : null}
      {!request.isLoading && !request.error && request.data?.length === 0 ? <EmptyMatches meta={request.meta} /> : null}
      {!request.isLoading && !request.error && request.data?.length ? (
        <div className="matches-page__grid">
          {request.data.map((match) => <MatchCard key={match.developer.id} match={match} onChanged={request.reload} />)}
        </div>
      ) : null}
    </div>
  );
}

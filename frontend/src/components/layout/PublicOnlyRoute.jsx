// Redirects authenticated users away from account-creation and login pages.
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import LoadingBlock from '../ui/LoadingBlock.jsx';
import './PublicOnlyRoute.css';

/** Shows public-only content to signed-out users. */
export default function PublicOnlyRoute({ children }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="public-only-route__loading"><LoadingBlock label="Checking your session" /></div>;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

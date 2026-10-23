// Restricts nested routes to users with a valid server session.
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import LoadingBlock from '../ui/LoadingBlock.jsx';
import './ProtectedRoute.css';

/** Shows protected content only after the session check confirms a user. */
export default function ProtectedRoute({ children }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <div className="protected-route__loading"><LoadingBlock label="Checking your session" /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

// Shows a friendly not-found message for routes outside the application map.
import { Link } from 'react-router-dom';
import useDocumentTitle from '../hooks/useDocumentTitle.js';

/** Renders the public not-found page. */
export default function NotFoundPage() {
  useDocumentTitle('Not found');
  return <div className="page-shell"><h1>Page not found</h1><p>We couldn't find that page.</p><Link to="/">Go home</Link></div>;
}

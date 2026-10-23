// Presents the product purpose and a concise three-step introduction.
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import useDocumentTitle from '../hooks/useDocumentTitle.js';
import LoadingBlock from '../components/ui/LoadingBlock.jsx';
import './LandingPage.css';

/** Renders the public landing page without mock content or statistics. */
export default function LandingPage() {
  const { user, isLoading } = useAuth();
  useDocumentTitle();
  if (isLoading) return <div className="page-shell"><LoadingBlock label="Checking your session" /></div>;
  return (
    <div className="page-shell landing-page">
      <section className="landing-page__hero">
        <p className="landing-page__eyebrow">Skills Exchange Network</p>
        <h1>Find your next skill-exchange collaborator</h1>
        <p>Developers list the skills they offer and the skills they want to learn. The network suggests collaborators whose skills complement yours.</p>
        {user ? (
          <Link className="button button--primary" to="/dashboard">Go to dashboard</Link>
        ) : (
          <div className="landing-page__actions">
            <Link className="button button--primary" to="/register">Create account</Link>
            <Link className="button button--secondary" to="/login">Log in</Link>
          </div>
        )}
      </section>
      <section className="landing-page__steps" aria-labelledby="how-it-works">
        <h2 id="how-it-works">How it works</h2>
        <ol>
          <li><strong>List your skills</strong><span>Share what you can contribute and what you want to learn.</span></li>
          <li><strong>See explained matches</strong><span>Review recommendations based on overlapping skills.</span></li>
          <li><strong>Send a collaboration request</strong><span>Ask another developer to work together.</span></li>
        </ol>
      </section>
    </div>
  );
}

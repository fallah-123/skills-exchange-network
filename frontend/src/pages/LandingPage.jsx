// Presents the product purpose and a concise three-step introduction.
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import useDocumentTitle from '../hooks/useDocumentTitle.js';
import LoadingBlock from '../components/ui/LoadingBlock.jsx';
import Icon from '../components/ui/Icon.jsx';
import './LandingPage.css';

/** Renders the public landing page without mock content or statistics. */
export default function LandingPage() {
  const { user, isLoading } = useAuth();
  useDocumentTitle();
  if (isLoading) return <div className="page-shell"><LoadingBlock label="Checking your session" /></div>;
  return (
    <div className="page-shell landing-page">
      <section className="landing-page__hero">
        <div className="landing-page__copy">
        <p className="landing-page__eyebrow">THE DEVELOPER COLLABORATION NETWORK</p>
        <h1>Share your skills.<br /><em>Build something</em><br />together.</h1>
        <p>Developers list the skills they offer and the skills they want to learn. The network suggests collaborators whose skills complement yours.</p>
        {user ? (
          <Link className="button button--primary" to="/dashboard">Go to dashboard</Link>
        ) : (
          <div className="landing-page__actions">
            <Link className="button button--primary" to="/register">Create account <Icon name="arrow" /></Link>
            <Link className="button button--secondary" to="/login">Log in</Link>
          </div>
        )}
        </div>
        <div className="landing-page__visual" aria-hidden="true"><div className="landing-page__orbit"><img src="/brand/symbol.png" width="240" height="240" alt="" /></div><span className="landing-page__tag landing-page__tag--offer">Share what you know</span><span className="landing-page__tag landing-page__tag--learn">Learn something new</span><p>Different skills.<br /><strong>Shared possibilities.</strong></p></div>
      </section>
      <section className="landing-page__steps" aria-labelledby="how-it-works">
        <p className="eyebrow">A SIMPLE WAY TO GROW</p><h2 id="how-it-works">Good connections start here.</h2>
        <ol>
          <li><strong>List your skills</strong><span>Share what you can contribute and what you want to learn.</span></li>
          <li><strong>See explained matches</strong><span>Review recommendations based on overlapping skills.</span></li>
          <li><strong>Send a collaboration request</strong><span>Ask another developer to work together.</span></li>
        </ol>
      </section>
    </div>
  );
}

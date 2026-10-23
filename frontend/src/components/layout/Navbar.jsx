// Provides the responsive primary navigation and current-user actions.
import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import Button from '../ui/Button.jsx';
import './Navbar.css';

const links = [
  ['/dashboard', 'Dashboard'],
  ['/developers', 'Discover'],
  ['/matches', 'Matches'],
  ['/requests', 'Requests'],
  ['/skills', 'My Skills'],
  ['/profile', 'Profile']
];

/** Renders the responsive authenticated navigation. */
export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  async function handleLogout() {
    try {
      await logout();
      navigate('/login', { replace: true });
      showToast({ type: 'success', message: 'Logged out.' });
    } catch (error) {
      showToast({ type: 'error', message: error.message });
    }
  }
  const home = user ? '/dashboard' : '/';
  return (
    <header className="app-header">
      <div className="app-header__inner">
        <Link className="app-header__brand" to={home}>
          <span className="app-header__mark" aria-hidden="true">S</span>
          <span>Skills Exchange Network</span>
        </Link>
        {user ? (
          <>
            <Button variant="secondary" className="app-header__toggle" aria-expanded={menuOpen} aria-controls="primary-navigation" onClick={() => setMenuOpen((open) => !open)}>
              Menu
            </Button>
            <nav id="primary-navigation" className={`app-header__nav${menuOpen ? ' app-header__nav--open' : ''}`} aria-label="Primary navigation">
              <div className="app-header__links">
                {links.map(([to, label]) => <NavLink key={to} to={to} onClick={() => setMenuOpen(false)}>{label}</NavLink>)}
              </div>
              <div className="app-header__user">
                <span>{user.displayName}</span>
                <Button variant="secondary" onClick={handleLogout}>Log out</Button>
              </div>
            </nav>
          </>
        ) : null}
      </div>
    </header>
  );
}

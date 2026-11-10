// Provides the responsive primary navigation and current-user actions.
import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import Button from '../ui/Button.jsx';
import Brand from '../ui/Brand.jsx';
import Icon from '../ui/Icon.jsx';
import './Navbar.css';

const links = [
  ['/dashboard', 'Dashboard'],
  ['/developers', 'Discover'],
  ['/matches', 'Matches'],
  ['/requests', 'Requests'],
  ['/messages', 'Messages'],
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
        <div className={`app-header__top${menuOpen ? ' app-header__top--open' : ''}`}>
        <Link className="app-header__brand" to={home} aria-label="Skill Developers Network home">
          <Brand />
        </Link>
        {user ? (
          <>
            <Button variant="secondary" className="app-header__toggle" aria-expanded={menuOpen} aria-controls="primary-navigation" onClick={() => setMenuOpen((open) => !open)}>
              <Icon name="menu" /> Menu
            </Button>
              <div className="app-header__user">
                <span className="app-header__avatar" aria-hidden="true">{user.displayName.trim().slice(0, 1).toUpperCase()}</span>
                <span className="app-header__username">{user.displayName}</span>
                <Button variant="secondary" onClick={handleLogout}>Log out</Button>
              </div>
          </>
        ) : null}
        </div>
        {user && <nav id="primary-navigation" className={`app-header__nav${menuOpen ? ' app-header__nav--open' : ''}`} aria-label="Primary navigation">
          <div className="app-header__links">
            {links.map(([to, label], index) => <NavLink key={to} to={to} onClick={() => setMenuOpen(false)}><Icon name={['dashboard', 'discover', 'matches', 'requests', 'messages', 'skills', 'profile'][index]} />{label}</NavLink>)}
          </div>
        </nav>}
      </div>
    </header>
  );
}

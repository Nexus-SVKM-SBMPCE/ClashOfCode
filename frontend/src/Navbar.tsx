import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { demoMode } from './api';
import LiveSubmissionCounter from './LiveSubmissionCounter';
import Icon from './components/Icon';

export default function Navbar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [demo, setDemo] = useState(demoMode.enabled);

  const handleLogout = () => { signOut(); navigate('/login'); };

  const toggleDemo = () => {
    demoMode.enabled = !demoMode.enabled;
    setDemo(demoMode.enabled);
  };

  return (
    <header className="app-header">
      <NavLink to="/problems" className="wordmark">
        <img src="/clash-of-code-logo.png" alt="Clash of Code" className="navbar-logo" />
        <span className="wordmark-name">Clash of Code</span>
        <span className="wordmark-sub">Battle Arena</span>
      </NavLink>

      <nav className="header-nav" aria-label="Main">
        <NavLink to="/problems" className={({ isActive }) => (isActive ? 'active' : '')}>
          Quests
        </NavLink>
        <NavLink to="/leaderboard" className={({ isActive }) => (isActive ? 'active' : '')}>
          War Ranks
        </NavLink>
      </nav>

      <div className="header-right">
        {/* Batch countdown timer mounts here; the live counter sits right beside it */}
        <LiveSubmissionCounter />

        <button
          type="button"
          className={`btn-demo-toggle ${demo ? 'active' : ''}`}
          onClick={toggleDemo}
          title="Toggle client-only demo data simulation"
        >
          {demo ? 'Demo ON' : 'Demo OFF'}
        </button>

        {user && (
          <div className="identity">
            <span className="identity-avatar" aria-hidden="true">{user.display_name[0].toUpperCase()}</span>
            <span className="identity-name">{user.display_name}</span>
            {user.role === 'admin' && <span className="role-tag">Chief</span>}
            <button id="logout-btn" className="btn btn-ghost btn-icon" onClick={handleLogout} aria-label="Sign out" title="Sign out">
              <Icon name="logout" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

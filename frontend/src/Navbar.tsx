import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { demoMode } from './api';
import LiveSubmissionCounter from './LiveSubmissionCounter';
import Icon from './components/Icon';
import { balloonFor } from './lib/arena';

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
        <span className="wordmark-mark" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((i) => <span key={i} style={{ background: balloonFor(i % 5) }} />)}
        </span>
        <span className="wordmark-name">Code Clash</span>
        <span className="wordmark-sub">Local Arena</span>
      </NavLink>

      <nav className="header-nav" aria-label="Main">
        <NavLink to="/problems" className={({ isActive }) => (isActive ? 'active' : '')}>
          <Icon name="list" size={15} /> Problems
        </NavLink>
        <NavLink to="/leaderboard" className={({ isActive }) => (isActive ? 'active' : '')}>
          <Icon name="trophy" size={15} /> Leaderboard
        </NavLink>
      </nav>

      <div className="header-right">
        {/* Batch countdown timer mounts here; the live counter sits right beside it */}
        <LiveSubmissionCounter />

        <label className="switch" title="Offline Demo Mode — intercepts all API calls with mock data">
          <input id="demo-mode-toggle" type="checkbox" checked={demo} onChange={toggleDemo} />
          <span className="switch-track" aria-hidden="true" />
          <span className="switch-label">Demo</span>
          <span className="sr-only">Demo mode</span>
        </label>

        {user && (
          <div className="identity">
            <span className="identity-avatar" aria-hidden="true">{user.display_name[0].toUpperCase()}</span>
            <span className="identity-name">{user.display_name}</span>
            {user.role === 'admin' && <span className="role-tag">admin</span>}
            <button id="logout-btn" className="btn btn-ghost btn-icon" onClick={handleLogout} aria-label="Sign out" title="Sign out">
              <Icon name="logout" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

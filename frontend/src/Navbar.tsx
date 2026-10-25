import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { demoMode } from './api';

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
    <nav className="navbar">
      <NavLink to="/problems" className="navbar-brand">
        <span className="brand-icon">⚡</span>
        <span className="brand-text">Code<span className="brand-accent">Clash</span></span>
        <span className="brand-sub">Local Arena</span>
      </NavLink>

      <div className="navbar-links">
        <NavLink to="/problems" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          Problems
        </NavLink>
        <NavLink to="/leaderboard" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          Leaderboard
        </NavLink>
      </div>

      <div className="navbar-right">
        {/* Demo Mode Toggle */}
        <label className="demo-toggle" title="Offline Demo Mode — intercepts all API calls with mock data">
          <input
            id="demo-mode-toggle"
            type="checkbox"
            checked={demo}
            onChange={toggleDemo}
          />
          <span className="demo-track">
            <span className="demo-thumb" />
          </span>
          <span className="demo-label">{demo ? '🎬 Demo' : 'Demo'}</span>
        </label>

        {user && (
          <div className="navbar-user">
            <div className="user-avatar">{user.display_name[0].toUpperCase()}</div>
            <span className="user-display">{user.display_name}</span>
            {user.role === 'admin' && <span className="admin-badge">ADMIN</span>}
            <button id="logout-btn" className="btn-logout" onClick={handleLogout}>
              Sign Out
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}

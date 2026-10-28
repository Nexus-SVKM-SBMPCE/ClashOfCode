import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import Balloon from '../components/Balloon';
import Icon from '../components/Icon';
import { balloonFor, letterFor } from '../lib/arena';

const DEMO_ACCOUNTS = [
  { username: 'admin', password: 'admin123' },
  { username: 'contestant1', password: 'pass123' },
];

export default function LoginPage() {
  const { user, signIn } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn(username, password);
    } catch {
      setError('Invalid clan credentials');
    } finally {
      setLoading(false);
    }
  };

  // Signed in (fresh login or an existing session): go straight to the contest
  if (user) return <Navigate to="/problems" replace />;

  return (
    <div className="login">
      <div className="login-card">
        <div className="login-brand">
          {/* CoC Logo */}
          <img src="/coc-logo.jpg" alt="Clash of Code" className="login-logo" />

          <div className="login-balloons" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => <Balloon key={i} letter={letterFor(i)} color={balloonFor(i)} />)}
          </div>
          <h1 className="login-title">Clash of Code <span>⚔️ Battle Arena</span></h1>
          <p className="login-lede">Enter your clan credentials to join the war.</p>
        </div>

        <form onSubmit={submit} className="login-form">
          <div className="field">
            <label htmlFor="username-input">Clan Username</label>
            <input
              id="username-input"
              className="input"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              autoFocus
              placeholder="Enter your clan name..."
              aria-invalid={error ? true : undefined}
            />
          </div>
          <div className="field">
            <label htmlFor="password-input">War Password</label>
            <input
              id="password-input"
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              placeholder="Enter your secret..."
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'login-error' : undefined}
            />
          </div>
          {error && (
            <p id="login-error" className="form-error" role="alert">
              <Icon name="alert" size={14} /> {error}. Ask the war generals if you're unsure.
            </p>
          )}
          <button id="login-btn" type="submit" className="btn btn-primary btn-lg" disabled={loading}>
            {loading ? <><span className="spinner" /> Entering Battle…</> : '⚔️ Enter the Arena'}
          </button>
        </form>

        <div className="login-hint">
          <span>Demo clans:</span>
          {DEMO_ACCOUNTS.map((a) => (
            <button key={a.username} type="button" onClick={() => { setUsername(a.username); setPassword(a.password); setError(''); }}>
              {a.username} / {a.password}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

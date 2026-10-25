import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { type User, login as apiLogin, getMe } from './api';

interface AuthCtx {
  user: User | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthCtx>({} as AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      getMe()
        .then((r) => setUser(r.data))
        .catch(() => { localStorage.removeItem('token'); })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const signIn = async (username: string, password: string) => {
    const res = await apiLogin(username, password);
    localStorage.setItem('token', res.data.access_token);
    setUser(res.data.user);
  };

  const signOut = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('demo-user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

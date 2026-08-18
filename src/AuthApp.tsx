import React, { FormEvent, useEffect, useState } from 'react';
import {
  Loader2,
  LockKeyhole,
  LogIn,
  LogOut,
  Music
} from 'lucide-react';
import App from './App';

type AuthState = 'CHECKING' | 'AUTHENTICATED' | 'ANONYMOUS';

export default function AuthApp() {
  const [state, setState] = useState<AuthState>('CHECKING');
  const [email, setEmail] = useState('admin@sonara.ai');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  useEffect(() => {
    fetch('/api/auth/session', {
      credentials: 'same-origin',
      cache: 'no-store'
    })
      .then(res => {
        setState(res.ok ? 'AUTHENTICATED' : 'ANONYMOUS');
      })
      .catch(() => {
        setState('ANONYMOUS');
      });
  }, []);

  const login = async (event: FormEvent) => {
    event.preventDefault();

    setWorking(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email,
          password
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || 'Login failed.'
        );
      }

      setPassword('');
      setState('AUTHENTICATED');
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setWorking(false);
    }
  };

  const logout = async () => {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin'
    });

    setState('ANONYMOUS');
  };

  if (state === 'CHECKING') {
    return (
      <div className="min-h-screen bg-[#070b12] text-white flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
      </div>
    );
  }

  if (state === 'AUTHENTICATED') {
    return (
      <>
        <App />

        <button
          type="button"
          onClick={() => void logout()}
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/95 px-4 py-2 text-xs font-bold text-slate-300 shadow-xl hover:border-red-500 hover:text-red-300"
        >
          <LogOut className="h-4 w-4" />
          LOGOUT
        </button>
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#070b12] text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/90 p-8 shadow-2xl">

        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600">
            <Music className="h-8 w-8" />
          </div>

          <h1 className="text-2xl font-black tracking-wide">
            SONARA ENTERPRISE
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            Secure Studio Access
          </p>
        </div>

        <form onSubmit={login} className="space-y-5">

          <label className="block text-xs font-semibold text-slate-400">
            EMAIL
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="username"
              required
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-purple-500"
            />
          </label>

          <label className="block text-xs font-semibold text-slate-400">
            PASSWORD
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-purple-500"
            />
          </label>

          {error && (
            <div className="rounded-xl border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={working}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-5 py-4 font-black disabled:opacity-50"
          >
            {working ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <LogIn className="h-5 w-5" />
            )}

            ENTER SONARA
          </button>

          <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500">
            <LockKeyhole className="h-3.5 w-3.5" />
            HttpOnly secure session
          </div>

        </form>
      </div>
    </div>
  );
}

import React, { useMemo, useState } from 'react';
import { LockKeyhole, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const AUTH_STORAGE_KEY = 'terminal-trade-authenticated';

const LOGIN_USERNAME = import.meta.env.VITE_LOGIN_USERNAME ;
const LOGIN_PASSWORD = import.meta.env.VITE_LOGIN_PASSWORD ;

type LoginGateProps = {
  children: React.ReactNode;
};

export default function LoginGate({ children }: LoginGateProps) {
  const [authenticated, setAuthenticated] = useState(
    () => window.localStorage.getItem(AUTH_STORAGE_KEY) === 'true',
  );
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const canSubmit = useMemo(
    () => username.trim().length > 0 && password.length > 0,
    [password, username],
  );

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (username.trim() === LOGIN_USERNAME && password === LOGIN_PASSWORD) {
      window.localStorage.setItem(AUTH_STORAGE_KEY, 'true');
      setAuthenticated(true);
      setError('');
      return;
    }

    setError('Invalid account or password');
  };

  if (authenticated) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-background px-4 text-foreground">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[360px] rounded-md border border-border bg-card p-5 shadow-xl"
        data-testid="login-gate"
      >
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-secondary text-primary">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-6">Terminal Trade</h1>
            <p className="text-xs text-muted-foreground">Account required</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="login-username">Account</Label>
            <Input
              id="login-username"
              autoComplete="username"
              value={username}
              onChange={(event) => {
                setUsername(event.target.value);
                setError('');
              }}
              data-testid="input-login-username"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="login-password">Password</Label>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setError('');
              }}
              data-testid="input-login-password"
            />
          </div>

          <div className="min-h-5 text-sm text-destructive" aria-live="polite">
            {error}
          </div>

          <Button type="submit" className="w-full" disabled={!canSubmit} data-testid="btn-login">
            <LogIn className="h-4 w-4" />
            Login
          </Button>
        </div>
      </form>
    </div>
  );
}

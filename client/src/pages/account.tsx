import { useState } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { BrandMark } from '@/components/brand-mark';
import { useAuth, useStats, useRoundHistory } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft,
  LogIn,
  UserPlus2,
  LogOut,
  TrendingUp,
  TrendingDown,
  Scale,
  Loader2,
  History,
} from 'lucide-react';

function AuthPanel() {
  const { login, signup } = useAuth();
  const { toast } = useToast();

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [signupUsername, setSignupUsername] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');

  const handleLogin = async () => {
    if (!loginEmail.trim() || !loginPassword) return;
    try {
      await login.mutateAsync({ email: loginEmail.trim(), password: loginPassword });
      toast({ title: 'Signed in', description: 'Welcome back.' });
    } catch (error) {
      toast({
        title: 'Sign in failed',
        description: error instanceof Error ? error.message : 'Invalid email or password',
        variant: 'destructive',
      });
    }
  };

  const handleSignup = async () => {
    if (!signupUsername.trim() || !signupEmail.trim() || !signupPassword) return;
    try {
      await signup.mutateAsync({
        username: signupUsername.trim(),
        email: signupEmail.trim(),
        password: signupPassword,
      });
      toast({ title: 'Account created', description: 'You are signed in.' });
    } catch (error) {
      toast({
        title: 'Could not create account',
        description: error instanceof Error ? error.message : 'Please check your details',
        variant: 'destructive',
      });
    }
  };

  return (
    <motion.div
      className="grid gap-5 md:grid-cols-2"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
    >
      {/* Sign in */}
      <div className="glass-card border border-white/25 rounded-2xl shadow-2xl p-6 sm:p-8 flex flex-col justify-between h-full gap-4 text-foreground">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-display font-extrabold text-primary">
            <LogIn className="h-5 w-5 text-victory-gold" />
            Sign in
          </h2>
          <p className="text-xs text-muted-foreground mt-1">Track your chip totals across every table.</p>
        </div>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            handleLogin();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="login-email" className="text-primary font-mono text-[10px] font-bold uppercase tracking-widest">
              Email
            </Label>
            <Input
              id="login-email"
              type="email"
              placeholder="you@example.com"
              value={loginEmail}
              onChange={(event) => setLoginEmail(event.target.value)}
              autoComplete="email"
              className="bg-card border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-primary focus-visible:border-primary font-mono rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="login-password" className="text-primary font-mono text-[10px] font-bold uppercase tracking-widest">
              Password
            </Label>
            <Input
              id="login-password"
              type="password"
              placeholder="••••••••"
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
              autoComplete="current-password"
              className="bg-card border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-primary focus-visible:border-primary font-mono rounded-xl"
            />
          </div>
          <button
            type="submit"
            disabled={!loginEmail.trim() || !loginPassword || login.isPending}
            data-testid="button-login"
            className="w-full chunky-button bg-action-emerald hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed text-white font-display font-bold py-3.5 rounded-xl shadow-[0_4px_0_0_#064e3b] transition-all flex items-center justify-center gap-2"
          >
            {login.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
            Sign in
          </button>
        </form>
      </div>

      {/* Create account */}
      <div className="glass-card border border-white/25 rounded-2xl shadow-2xl p-6 sm:p-8 flex flex-col justify-between h-full gap-4 text-foreground">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-display font-extrabold text-primary">
            <UserPlus2 className="h-5 w-5 text-victory-gold" />
            Create account
          </h2>
          <p className="text-xs text-muted-foreground mt-1">Username, email, and a password — that's it.</p>
        </div>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            handleSignup();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="signup-username" className="text-primary font-mono text-[10px] font-bold uppercase tracking-widest">
              Username
            </Label>
            <Input
              id="signup-username"
              placeholder="3-20 characters, letters/numbers/_"
              value={signupUsername}
              onChange={(event) => setSignupUsername(event.target.value)}
              autoComplete="username"
              className="bg-card border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-primary focus-visible:border-primary font-mono rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="signup-email" className="text-primary font-mono text-[10px] font-bold uppercase tracking-widest">
              Email
            </Label>
            <Input
              id="signup-email"
              type="email"
              placeholder="you@example.com"
              value={signupEmail}
              onChange={(event) => setSignupEmail(event.target.value)}
              autoComplete="email"
              className="bg-card border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-primary focus-visible:border-primary font-mono rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="signup-password" className="text-primary font-mono text-[10px] font-bold uppercase tracking-widest">
              Password
            </Label>
            <Input
              id="signup-password"
              type="password"
              placeholder="At least 8 characters"
              value={signupPassword}
              onChange={(event) => setSignupPassword(event.target.value)}
              autoComplete="new-password"
              className="bg-card border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-primary focus-visible:border-primary font-mono rounded-xl"
            />
          </div>
          <button
            type="submit"
            disabled={!signupUsername.trim() || !signupEmail.trim() || !signupPassword || signup.isPending}
            data-testid="button-signup"
            className="w-full chunky-button bg-action-emerald hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed text-white font-display font-bold py-3.5 rounded-xl shadow-[0_4px_0_0_#064e3b] transition-all flex items-center justify-center gap-2"
          >
            {signup.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <UserPlus2 className="h-5 w-5" />}
            Create account
          </button>
        </form>
      </div>
    </motion.div>
  );
}

function formatChips(value: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMinutes = Math.round(diffMs / 60000);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  if (diffMinutes < 60) return rtf.format(-diffMinutes, 'minute');
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return rtf.format(-diffHours, 'hour');
  const diffDays = Math.round(diffHours / 24);
  return rtf.format(-diffDays, 'day');
}

function StatTile({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="rounded-2xl bg-muted/40 p-6 border border-border flex flex-col items-center gap-2.5 text-center">
      <div className={`flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-widest ${accent}`}>
        {icon}
        {label}
      </div>
      <div className="font-display text-4xl sm:text-5xl font-bold text-foreground tabular-nums">{formatChips(value)}</div>
    </div>
  );
}

function RoundRow({
  roomCode,
  roundNumber,
  payout,
  createdAt,
}: {
  roomCode: string;
  roundNumber: number;
  payout: number;
  createdAt: string;
}) {
  const isWin = payout > 0;
  const isLoss = payout < 0;
  const accent = isWin ? 'text-action-emerald' : isLoss ? 'text-destructive' : 'text-muted-foreground';
  const sign = isWin ? '+' : '';

  return (
    <div className="flex items-center justify-between gap-4 py-3 px-1">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`rounded-lg h-9 w-9 flex items-center justify-center shrink-0 font-display font-bold text-sm ${isWin ? 'bg-action-emerald/15' : isLoss ? 'bg-destructive/15' : 'bg-muted'} ${accent}`}>
          {isWin ? '+' : isLoss ? '-' : '='}
        </div>
        <div className="min-w-0">
          <div className="font-mono text-sm font-semibold text-foreground truncate">{roomCode}</div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Round {roundNumber}</div>
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className={`font-display text-lg font-bold tabular-nums ${accent}`}>
          {sign}{formatChips(payout)}
        </div>
        <div className="text-[10px] text-muted-foreground">{formatRelativeTime(createdAt)}</div>
      </div>
    </div>
  );
}

function ProfilePanel({ username }: { username: string }) {
  const { logout } = useAuth();
  const { toast } = useToast();
  const stats = useStats(true);
  const history = useRoundHistory(true);

  const handleLogout = async () => {
    await logout.mutateAsync();
    toast({ title: 'Signed out' });
  };

  return (
    <motion.div
      className="max-w-3xl"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
    >
      <div className="glass-card border border-white/25 rounded-2xl shadow-2xl p-6 sm:p-10 flex flex-col gap-8 text-foreground">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">Signed in as</div>
            <h2 className="text-3xl font-display font-extrabold text-primary">{username}</h2>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            disabled={logout.isPending}
            data-testid="button-logout"
            className="flex items-center gap-2 bg-foreground/5 border-foreground/20 text-foreground hover:bg-foreground/10 hover:text-foreground rounded-xl"
          >
            {logout.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            Sign out
          </Button>
        </div>

        <Separator />

        <div>
          <div className="text-xs font-mono font-bold uppercase tracking-widest text-victory-gold mb-4">
            Chips since account created
          </div>
          {stats.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading stats...
            </div>
          ) : stats.data ? (
            <div className="grid grid-cols-3 gap-4">
              <StatTile
                icon={<TrendingUp className="h-4 w-4" />}
                label="Won"
                value={stats.data.chipsWon}
                accent="text-action-emerald"
              />
              <StatTile
                icon={<TrendingDown className="h-4 w-4" />}
                label="Lost"
                value={stats.data.chipsLost}
                accent="text-destructive"
              />
              <StatTile
                icon={<Scale className="h-4 w-4" />}
                label="Net"
                value={stats.data.net}
                accent="text-victory-gold"
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Stats aren't available right now — try again shortly.</p>
          )}
        </div>

        <Separator />

        <div>
          <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-widest text-victory-gold mb-2">
            <History className="h-3.5 w-3.5" />
            Last 5 rounds
          </div>
          {history.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading history...
            </div>
          ) : history.data && history.data.rounds.length > 0 ? (
            <div className="divide-y divide-border">
              {history.data.rounds.map((round, index) => (
                <RoundRow
                  key={`${round.roomCode}-${round.roundNumber}-${index}`}
                  roomCode={round.roomCode}
                  roundNumber={round.roundNumber}
                  payout={round.payout}
                  createdAt={round.createdAt}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-2">No rounds played yet — finish a round while signed in to see it here.</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function Account() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();

  return (
    <div className="bg-felt-green felt-texture min-h-screen text-white select-none flex flex-col">
      <div className="mx-auto flex min-h-screen w-full max-w-[1480px] flex-col gap-8 px-6 py-6 sm:px-8 lg:px-10 xl:px-14">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
            <BrandMark className="h-16 w-16 p-1.5 sm:h-20 sm:w-20" imageClassName="h-full w-full" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="h-6 border-victory-gold/25 bg-victory-gold/20 text-victory-gold font-semibold uppercase tracking-wider text-[10px]">
                  Account
                </Badge>
              </div>
              <p className="mt-1.5 max-w-2xl text-xs sm:text-sm text-white/70">
                Optional — you can always play as a guest. Sign in to keep a running record of chips won and lost.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 self-end sm:self-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation('/')}
              data-testid="button-back-to-lobby"
              className="flex items-center gap-2 bg-white/5 border-white/20 text-white hover:bg-white/10 hover:text-white rounded-xl"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to lobby
            </Button>
          </div>
        </header>

        <main className="flex-1 flex flex-col items-center">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-white/60">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </div>
          ) : user ? (
            <ProfilePanel username={user.username} />
          ) : (
            <AuthPanel />
          )}
        </main>
      </div>
    </div>
  );
}

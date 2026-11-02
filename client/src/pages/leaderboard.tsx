import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BrandMark } from '@/components/brand-mark';
import { useLeaderboard, type LeaderboardEntry } from '@/hooks/use-leaderboard';
import { ArrowLeft, Trophy, Coins, Swords, Loader2 } from 'lucide-react';

function formatChips(value: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
    signDisplay: 'exceptZero',
  }).format(value);
}

const RANK_STYLES = [
  'bg-victory-gold/20 border-victory-gold/50 text-victory-gold',
  'bg-foreground/10 border-foreground/25 text-foreground',
  'bg-orange-400/15 border-orange-400/40 text-orange-300',
] as const;

function LeaderboardRow({
  rank,
  entry,
  primary,
}: {
  rank: number;
  entry: LeaderboardEntry;
  primary: 'net' | 'rounds';
}) {
  const rankStyle = RANK_STYLES[rank - 1] ?? 'bg-muted border-border text-muted-foreground';
  const primaryValue = primary === 'net' ? formatChips(entry.net) : entry.roundsWon;
  const primaryAccent = primary === 'net' ? (entry.net > 0 ? 'text-action-emerald' : entry.net < 0 ? 'text-destructive' : 'text-muted-foreground') : 'text-victory-gold';
  const secondaryLabel = primary === 'net' ? `${entry.roundsWon} round${entry.roundsWon === 1 ? '' : 's'} won` : `${formatChips(entry.net)} net`;

  return (
    <div className="flex items-center gap-4 py-4 px-1">
      <div className={`h-9 w-9 shrink-0 rounded-full border flex items-center justify-center font-display font-bold text-sm ${rankStyle}`}>
        {rank}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-mono text-sm font-semibold text-foreground truncate">{entry.username}</div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{secondaryLabel}</div>
      </div>
      <div className={`font-display text-2xl font-bold tabular-nums shrink-0 ${primaryAccent}`}>{primaryValue}</div>
    </div>
  );
}

function LeaderboardList({ by }: { by: 'net' | 'rounds' }) {
  const { data, isLoading, isError } = useLeaderboard(by);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading leaderboard...
      </div>
    );
  }

  if (isError) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Leaderboard isn't available right now — try again shortly.</p>;
  }

  const rows = data?.leaderboard ?? [];

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No games settled yet — play a round while signed in to appear here.</p>;
  }

  return (
    <div className="divide-y divide-border">
      {rows.map((entry, index) => (
        <LeaderboardRow key={entry.username} rank={index + 1} entry={entry} primary={by} />
      ))}
    </div>
  );
}

export default function Leaderboard() {
  const [, setLocation] = useLocation();

  return (
    <div className="bg-felt-green felt-texture min-h-screen text-white select-none flex flex-col">
      <div className="mx-auto flex min-h-screen w-full max-w-[1480px] flex-col gap-8 px-6 py-6 sm:px-8 lg:px-10 xl:px-14">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
            <BrandMark className="h-16 w-16 p-1.5 sm:h-20 sm:w-20" imageClassName="h-full w-full" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="h-6 border-victory-gold/25 bg-victory-gold/20 text-victory-gold font-semibold uppercase tracking-wider text-[10px]">
                  <Trophy className="h-3 w-3 mr-1" />
                  Leaderboard
                </Badge>
              </div>
              <p className="mt-1.5 max-w-2xl text-xs sm:text-sm text-white/70">
                Top accounts by net chips and by rounds won, across every table.
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
          <motion.div
            className="w-full max-w-2xl"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
          >
            <div className="glass-card border border-white/25 rounded-2xl shadow-2xl p-6 sm:p-10 text-foreground">
              <Tabs defaultValue="net" className="w-full">
                <TabsList className="grid w-full grid-cols-2 bg-muted/40 border border-border rounded-xl h-12 p-1">
                  <TabsTrigger
                    value="net"
                    data-testid="tab-net-points"
                    className="rounded-lg gap-2 data-[state=active]:bg-victory-gold/20 data-[state=active]:text-victory-gold text-muted-foreground"
                  >
                    <Coins className="h-4 w-4" />
                    Net points
                  </TabsTrigger>
                  <TabsTrigger
                    value="rounds"
                    data-testid="tab-rounds-won"
                    className="rounded-lg gap-2 data-[state=active]:bg-victory-gold/20 data-[state=active]:text-victory-gold text-muted-foreground"
                  >
                    <Swords className="h-4 w-4" />
                    Rounds won
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="net" className="mt-6">
                  <LeaderboardList by="net" />
                </TabsContent>
                <TabsContent value="rounds" className="mt-6">
                  <LeaderboardList by="rounds" />
                </TabsContent>
              </Tabs>
            </div>
          </motion.div>
        </main>
      </div>
    </div>
  );
}

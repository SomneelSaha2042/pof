import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { BrandMark } from '@/components/brand-mark';
import { useGameSocket } from '@/hooks/use-game-socket';
import {
  RotateCcw,
  Sparkles,
  PlusCircle,
  UserPlus,
  Layers,
  BookOpen,
  Coins,
  Crown,
} from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { cn } from '@/lib/utils';

const ANTE_OPTIONS = [5, 10, 20, 25, 50, 100];

export default function Home() {
  const [, setLocation] = useLocation();
  const [playerName, setPlayerName] = useState('');
  const [selectedAnte, setSelectedAnte] = useState(10);
  const [joinRoomCode, setJoinRoomCode] = useState('');
  const { createRoom, joinRoom, roomCode, clearRoom } = useGameSocket();

  useEffect(() => {
    if (!roomCode) {
      localStorage.removeItem('furious-five-room-code');
      localStorage.removeItem('furious-five-player-id');
    }
  }, [roomCode]);

  const handleReset = () => {
    clearRoom();
    localStorage.clear();
    setPlayerName('');
    setJoinRoomCode('');
  };

  useEffect(() => {
    if (roomCode) {
      const timer = setTimeout(() => {
        setLocation('/game');
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [roomCode, setLocation]);

  const handleCreateRoom = async () => {
    if (!playerName.trim()) return;

    const name = playerName.trim();
    localStorage.setItem('playerName', name);

    try {
      createRoom(name, selectedAnte);

      setTimeout(async () => {
        if (!localStorage.getItem('furious-five-room-code')) {
          try {
            const response = await fetch('/api/rooms', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ playerName: name, ante: selectedAnte }),
            });

            const data = await response.json();
            if (data.success) {
              localStorage.setItem('furious-five-room-code', data.roomCode);
              localStorage.setItem('furious-five-player-id', data.playerId);
              setLocation('/game');
            }
          } catch (error) {
            console.error('HTTP room creation error:', error);
          }
        }
      }, 2500);
    } catch (error) {
      console.error('Room creation error:', error);
    }
  };

  const handleJoinRoom = async () => {
    if (!playerName.trim() || !joinRoomCode.trim()) return;

    const name = playerName.trim();
    const code = joinRoomCode.trim().toUpperCase();

    try {
      joinRoom(code, name);

      setTimeout(async () => {
        const currentRoomCode = localStorage.getItem('furious-five-room-code');
        if (!currentRoomCode || currentRoomCode !== code) {
          try {
            const response = await fetch(`/api/rooms/${code}/join`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ playerName: name }),
            });

            const data = await response.json();
            if (data.success) {
              localStorage.setItem('furious-five-room-code', code);
              localStorage.setItem('furious-five-player-id', data.playerId);
              setLocation('/game');
            } else {
              alert(`Failed to join room: ${data.error}`);
            }
          } catch (error) {
            console.error('HTTP room join error:', error);
          }
        }
      }, 2500);
    } catch (error) {
      console.error('Room join error:', error);
    }
  };

  const previewCards = [
    { r: 1, s: 'S' }, // A of Spades
    { r: 3, s: 'H' }, // 3 of Hearts (Wild!)
    { r: 2, s: 'D' }, // 2 of Diamonds
    { r: 2, s: 'C' }, // 2 of Clubs
    { r: 13, s: 'H' }, // K of Hearts
  ] as const;

  return (
    <div className="bg-[#080c12] bg-[radial-gradient(ellipse_at_top,#102538_0%,#080c12_72%)] min-h-screen text-white select-none flex flex-col">
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col gap-8 px-6 py-6 sm:px-8 lg:px-10">
        {/* Header */}
        <header className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <BrandMark className="h-14 w-14 p-1.5 sm:h-16 sm:w-16" imageClassName="h-full w-full" />
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="font-display text-2xl sm:text-3xl font-black tracking-tight text-white">
                  POT OR FOLD
                </h1>
                <Badge className="h-6 border-emerald-400/30 bg-emerald-500/20 text-emerald-300 font-mono font-bold uppercase tracking-wider text-[10px]">
                  PLO5 + 2-Board Side Game
                </Badge>
              </div>
              <p className="mt-1 max-w-2xl text-xs sm:text-sm text-white/65">
                5 hole cards, 1 flop decision: <strong className="text-emerald-400">POT</strong> for the Omaha showdown, or <strong className="text-amber-300">FOLD</strong> into the high-voltage 1v1 2-Board Side Game.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-end sm:self-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              data-testid="button-reset-app"
              className="flex items-center gap-2 bg-white/5 border-white/15 text-white hover:bg-white/10 hover:text-white rounded-xl"
            >
              <RotateCcw className="h-4 w-4" />
              Reset Session
            </Button>
          </div>
        </header>

        {/* Main Content Grid */}
        <main className="grid flex-1 items-start gap-8 xl:grid-cols-[minmax(500px,0.9fr)_minmax(580px,1.1fr)]">
          <div className="flex flex-col gap-6">
            <motion.div
              className="grid gap-5 md:grid-cols-2"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
            >
              {/* Create Room Card */}
              <div className="glass-card border border-white/20 rounded-2xl shadow-2xl p-6 flex flex-col justify-between gap-5 text-foreground">
                <div>
                  <h2 className="flex items-center gap-2 text-xl font-display font-extrabold text-primary">
                    <PlusCircle className="h-5 w-5 text-victory-gold" />
                    Host a Table
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Set the initial ante and open a private PokerNow-style table.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="create-name"
                      className="text-primary font-mono text-[10px] font-bold uppercase tracking-widest"
                    >
                      Your Name
                    </Label>
                    <Input
                      id="create-name"
                      placeholder="Enter your name"
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value)}
                      data-testid="input-player-name"
                      className="bg-card border-border text-foreground font-mono rounded-xl"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-amber-300 font-mono text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5">
                      <Coins className="h-3.5 w-3.5" />
                      Initial Table Ante ({selectedAnte})
                    </Label>
                    <div className="grid grid-cols-6 gap-1.5">
                      {ANTE_OPTIONS.map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setSelectedAnte(val)}
                          className={cn(
                            'py-1.5 rounded-lg font-mono text-xs font-bold border transition-all',
                            selectedAnte === val
                              ? 'bg-amber-400 text-slate-950 border-amber-300'
                              : 'bg-white/5 text-white/75 border-white/10 hover:bg-white/10'
                          )}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>

                  {!roomCode ? (
                    <button
                      onClick={handleCreateRoom}
                      disabled={!playerName.trim()}
                      data-testid="button-create-room"
                      className="w-full chunky-button bg-action-emerald hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-display font-black py-3.5 rounded-xl shadow-[0_4px_0_0_#064e3b] transition-all flex items-center justify-center gap-2"
                    >
                      <PlusCircle className="h-5 w-5" />
                      Create POF Table
                    </button>
                  ) : (
                    <div className="space-y-2 rounded-xl border border-action-emerald/30 bg-action-emerald/10 p-4 text-center">
                      <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-action-emerald">
                        Table Created
                      </div>
                      <div className="font-display text-xl font-bold tracking-widest text-primary">
                        {roomCode}
                      </div>
                      <div className="flex items-center justify-center gap-2 text-xs text-primary/70">
                        <Sparkles className="h-3 w-3 text-victory-gold animate-spin" />
                        Taking seat...
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Join Room Card */}
              <div className="glass-card border border-white/20 rounded-2xl shadow-2xl p-6 flex flex-col justify-between gap-5 text-foreground">
                <div>
                  <h2 className="flex items-center gap-2 text-xl font-display font-extrabold text-primary">
                    <UserPlus className="h-5 w-5 text-victory-gold" />
                    Join a Table
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Enter a room code (`POF-XXXXXX`) to join your friends.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="join-name"
                      className="text-primary font-mono text-[10px] font-bold uppercase tracking-widest"
                    >
                      Your Name
                    </Label>
                    <Input
                      id="join-name"
                      placeholder="Enter your name"
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value)}
                      data-testid="input-join-name"
                      className="bg-card border-border text-foreground font-mono rounded-xl"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="room-code"
                      className="text-primary font-mono text-[10px] font-bold uppercase tracking-widest"
                    >
                      Room Code
                    </Label>
                    <Input
                      id="room-code"
                      placeholder="POF-XXXXXX"
                      value={joinRoomCode}
                      onChange={(e) => setJoinRoomCode(e.target.value.toUpperCase())}
                      data-testid="input-room-code"
                      className="bg-card border-border text-foreground font-mono rounded-xl tracking-widest"
                    />
                  </div>
                  <button
                    onClick={handleJoinRoom}
                    disabled={!playerName.trim() || !joinRoomCode.trim()}
                    data-testid="button-join-room"
                    className="w-full chunky-button bg-action-emerald hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-display font-black py-3.5 rounded-xl shadow-[0_4px_0_0_#064e3b] transition-all flex items-center justify-center gap-2"
                  >
                    <UserPlus className="h-5 w-5" />
                    Join Table
                  </button>
                </div>
              </div>
            </motion.div>

            {/* Side Game Payouts Quick Bar */}
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-amber-300 font-bold">
                <Crown className="h-4 w-4" />
                Side Game 1v1 Payout Multipliers (Multiple of Ante)
              </div>
              <Separator className="my-3.5 bg-white/10" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                  <div className="font-mono text-lg font-black text-emerald-400">2x</div>
                  <div className="font-display text-xs font-bold text-white mt-0.5">Normal Win</div>
                  <div className="text-[10px] text-white/55">Win both 2-card boards</div>
                </div>
                <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3">
                  <div className="font-mono text-lg font-black text-emerald-300">4x</div>
                  <div className="font-display text-xs font-bold text-white mt-0.5">Popo</div>
                  <div className="text-[10px] text-white/65">Two Pairs (e.g. AA + 22)</div>
                </div>
                <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3">
                  <div className="font-mono text-lg font-black text-amber-300">5x</div>
                  <div className="font-display text-xs font-bold text-white mt-0.5">King Kong</div>
                  <div className="text-[10px] text-white/65">10 • J • Q • K</div>
                </div>
                <div className="rounded-xl border border-purple-400/40 bg-purple-500/15 p-3">
                  <div className="font-mono text-lg font-black text-purple-300">7x</div>
                  <div className="font-display text-xs font-bold text-white mt-0.5">Quads</div>
                  <div className="text-[10px] text-white/65">Four of a Kind</div>
                </div>
              </div>
            </section>
          </div>

          {/* Right Column: PokerNow Felt Preview & Full Rules */}
          <aside className="flex flex-col gap-5">
            <div className="rounded-[36px] border-[10px] border-[#1c232e] bg-[radial-gradient(ellipse_at_center,#157347_0%,#0b482c_65%,#062a19_100%)] p-6 shadow-2xl relative overflow-hidden">
              <div className="flex items-center justify-between text-[10px] font-mono font-bold uppercase tracking-widest text-emerald-200/70 mb-4">
                <span className="flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-amber-300" />
                  Interactive Card Preview (A-3-2-2-K → Aces & Deuces Popo!)
                </span>
                <span>4-Color Deck</span>
              </div>

              <div className="rounded-2xl border border-white/15 bg-black/25 p-5 shadow-inner">
                <div className="mb-5 flex justify-center gap-2.5 sm:gap-3">
                  {previewCards.map((card, index) => (
                    <Card
                      key={index}
                      card={card}
                      size="md"
                      fourColor
                      showWildBadge
                      className="hover:-translate-y-2 transition-transform"
                    />
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-2.5 text-center text-xs">
                  <div className="rounded-xl bg-black/35 p-3 border border-white/10">
                    <div className="font-bold text-amber-300 uppercase text-[10px] font-mono">
                      1. Ante & Flop
                    </div>
                    <div className="text-white/70 text-[11px] mt-1">
                      5 hole cards + 3 flop cards dealt
                    </div>
                  </div>
                  <div className="rounded-xl bg-black/35 p-3 border border-white/10">
                    <div className="font-bold text-emerald-400 uppercase text-[10px] font-mono">
                      2. Pot (PLO5)
                    </div>
                    <div className="text-white/70 text-[11px] mt-1">
                      Match pot → 2 hole + 3 board showdown
                    </div>
                  </div>
                  <div className="rounded-xl bg-black/35 p-3 border border-white/10">
                    <div className="font-bold text-purple-300 uppercase text-[10px] font-mono">
                      3. Fold (Side Game)
                    </div>
                    <div className="text-white/70 text-[11px] mt-1">
                      Make two 2-card hands 1v1 vs folders
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Rules Accordion */}
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <h2 className="flex items-center gap-2 text-base font-bold text-amber-300">
                <BookOpen className="h-5 w-5" />
                Complete Game Guide
              </h2>
              <Accordion type="single" collapsible defaultValue="main" className="mt-2">
                <AccordionItem value="main" className="border-white/10">
                  <AccordionTrigger className="text-left text-sm font-semibold text-white/90 hover:no-underline hover:text-amber-300">
                    Main Game: Pot or Fold (PLO5 Rules)
                  </AccordionTrigger>
                  <AccordionContent className="text-white/70 text-xs leading-relaxed space-y-1.5 pt-1">
                    <p>• Every player posts the set <strong>Ante</strong> and receives <strong>5 hole cards</strong>.</p>
                    <p>• The Flop (3 community cards) is dealt. Starting from the <strong>Button</strong>, each player decides to either <strong>POT</strong> (match the initial pot) or <strong>FOLD</strong>.</p>
                    <p>• Players who POT go to showdown: Turn and River are dealt, and the best 5-card poker hand made with <strong>exactly 2 hole cards + 3 community cards</strong> wins the Main Pot.</p>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="side" className="border-b-0">
                  <AccordionTrigger className="text-left text-sm font-semibold text-white/90 hover:no-underline hover:text-amber-300">
                    Side Game: 2-Board Hierarchy & 3-Joker
                  </AccordionTrigger>
                  <AccordionContent className="text-white/70 text-xs leading-relaxed space-y-1.5 pt-1">
                    <p>• Every player who folds plays 1v1 against every other folding player using 4 of their 5 cards to make <strong>two 2-card hands</strong>.</p>
                    <p>• <strong>Rank 3 is a Wild Joker</strong> and can act as any card (e.g., <code className="text-emerald-300">A-3-2-2-4</code> makes <code className="text-emerald-300">AA</code> & <code className="text-emerald-300">22</code> Popo!).</p>
                    <p>• 2-Card Board Strength: <strong>Pairs (AA &gt; KK &gt; ... &gt; 22) &gt; 82 Special &gt; Baccarat (9 down to 0)</strong>.</p>
                    <p>• Special Hands: <strong>Quads (7x) &gt; King Kong 10-J-Q-K (5x) &gt; Popo Two Pairs (4x)</strong> auto-win against lower tiers. Equal tiers compare boards (must win both boards to win, otherwise Push!).</p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </section>
          </aside>
        </main>
      </div>
    </div>
  );
}

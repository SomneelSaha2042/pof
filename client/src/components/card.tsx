import { cn } from '@/lib/utils';
import type { Card as CardType } from '@shared/game-types';

interface CardProps {
  card?: CardType | null;
  selected?: boolean;
  highlighted?: boolean;
  dimmed?: boolean;
  faceDown?: boolean;
  fourColor?: boolean;
  showWildBadge?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  onClick?: () => void;
  className?: string;
}

export function Card({
  card,
  selected = false,
  highlighted = false,
  dimmed = false,
  faceDown = false,
  fourColor = true,
  showWildBadge = false,
  size = 'md',
  onClick,
  className,
}: CardProps) {
  const getSuitSymbol = (suit: CardType['s']) => {
    switch (suit) {
      case 'C':
        return '\u2663';
      case 'D':
        return '\u2666';
      case 'H':
        return '\u2665';
      case 'S':
        return '\u2660';
      default:
        return '?';
    }
  };

  const getRankString = (rank: CardType['r']) => {
    if (rank === 1) return 'A';
    if (rank === 11) return 'J';
    if (rank === 12) return 'Q';
    if (rank === 13) return 'K';
    return rank.toString();
  };

  const sizeClasses = {
    xs: 'h-11 w-8 rounded-[5px]',
    sm: 'h-14 w-10 rounded-md',
    md: 'h-[4.85rem] w-[3.45rem] rounded-lg',
    lg: 'h-[6.1rem] w-[4.35rem] rounded-xl',
    xl: 'h-[7.2rem] w-[5.15rem] rounded-xl',
  };

  const cornerRankClasses = {
    xs: 'text-[10px]',
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
    xl: 'text-lg',
  };

  const centerSuitClasses = {
    xs: 'text-sm',
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-3xl',
    xl: 'text-4xl',
  };

  if (faceDown || !card) {
    return (
      <div
        className={cn(
          'relative overflow-hidden border border-white/25 bg-[#162336] shadow-[0_6px_16px_rgba(0,0,0,0.55)] select-none shrink-0',
          sizeClasses[size],
          onClick && 'cursor-pointer',
          className
        )}
        onClick={onClick}
      >
        <div className="absolute inset-[3px] rounded-[4px] border border-emerald-400/30 bg-gradient-to-br from-[#1b2e47] via-[#122033] to-[#0c1624]" />
        <div className="absolute inset-[5px] rounded-[3px] opacity-60 bg-[radial-gradient(#00e699_1px,transparent_1px)] [background-size:6px_6px]" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-4 w-4 rounded-full border border-emerald-400/40 bg-emerald-500/15 flex items-center justify-center">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400/60" />
          </div>
        </div>
      </div>
    );
  }

  // PokerNow 4-color deck palette vs classic 2-color palette
  const getSuitColorClasses = (suit: CardType['s']) => {
    if (fourColor) {
      switch (suit) {
        case 'H':
          return 'text-[#d92626]'; // Crimson Red
        case 'D':
          return 'text-[#1d63dc]'; // Royal Blue
        case 'C':
          return 'text-[#15803d]'; // Casino Club Green
        case 'S':
          return 'text-[#18181b]'; // Deep Charcoal Black
      }
    }
    return suit === 'D' || suit === 'H' ? 'text-[#d92626]' : 'text-[#18181b]';
  };

  const suitColor = getSuitColorClasses(card.s);
  const isWildThree = showWildBadge && card.r === 3;

  return (
    <div
      className={cn(
        'relative flex flex-col justify-between bg-gradient-to-b from-white via-[#fcfcfd] to-[#f3f4f6] border border-zinc-300 shadow-[0_8px_18px_-4px_rgba(0,0,0,0.65)] transition-all duration-150 select-none shrink-0',
        sizeClasses[size],
        onClick && 'cursor-pointer',
        selected &&
          'border-emerald-400 ring-2 ring-emerald-400 shadow-[0_0_22px_rgba(0,230,153,0.65)] -translate-y-2.5 z-10',
        highlighted &&
          !selected &&
          'border-amber-400 ring-2 ring-amber-400 shadow-[0_0_22px_rgba(246,197,66,0.75)] -translate-y-1.5 z-10',
        isWildThree &&
          !selected &&
          !highlighted &&
          'border-purple-400 ring-2 ring-purple-400/70',
        dimmed && 'opacity-45 saturate-50 scale-[0.97]',
        !selected && !highlighted && onClick && 'hover:-translate-y-1.5 hover:shadow-xl',
        className
      )}
      onClick={onClick}
      data-testid={`card-${getRankString(card.r)}${card.s}`}
    >
      {/* Top-left corner index */}
      <div className={cn('flex flex-col items-center leading-none pt-1 pl-1.5 self-start', suitColor)}>
        <span className={cn('font-extrabold tracking-tighter font-mono', cornerRankClasses[size])}>
          {getRankString(card.r)}
        </span>
        {size !== 'xs' && (
          <span className="text-[10px] leading-none -mt-0.5">{getSuitSymbol(card.s)}</span>
        )}
      </div>

      {/* Center large suit pip */}
      <div className={cn('flex items-center justify-center my-auto leading-none', centerSuitClasses[size], suitColor)}>
        {getSuitSymbol(card.s)}
      </div>

      {/* Bottom-right corner rank/pip for md+ cards */}
      {size !== 'xs' && size !== 'sm' && (
        <div
          className={cn(
            'flex flex-col items-center leading-none pb-1 pr-1.5 self-end rotate-180 opacity-85',
            suitColor
          )}
        >
          <span className={cn('font-extrabold tracking-tighter font-mono', cornerRankClasses[size])}>
            {getRankString(card.r)}
          </span>
        </div>
      )}

      {/* Wild 3 Joker Badge in Side Game */}
      {isWildThree && (
        <div className="absolute -top-2 -right-1.5 rounded-full bg-gradient-to-r from-amber-400 to-purple-600 px-1.5 py-0.5 text-[8px] font-mono font-black uppercase tracking-wider text-white shadow-md">
          WILD
        </div>
      )}
    </div>
  );
}

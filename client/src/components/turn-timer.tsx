import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Clock } from 'lucide-react';

interface TurnTimerProps {
  isActive: boolean;
  duration?: number; // in seconds
  onTimeout?: () => void;
}

export function TurnTimer({ isActive, duration = 30, onTimeout }: TurnTimerProps) {
  const [timeLeft, setTimeLeft] = useState(duration);

  useEffect(() => {
    if (!isActive) {
      setTimeLeft(duration);
      return;
    }

    setTimeLeft(duration);

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          onTimeout?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isActive, duration, onTimeout]);

  const urgency = timeLeft <= Math.max(5, duration * 0.25);
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const offset = useMemo(
    () => ((duration - timeLeft) / duration) * circumference,
    [circumference, duration, timeLeft]
  );

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          key="turn-timer"
          data-testid="turn-timer"
          initial={{ opacity: 0, y: 24, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          className={cn(
            'fixed bottom-6 left-6 z-[60] bg-card rounded-3xl p-4 shadow-2xl border border-border flex items-center gap-4 transition-transform hover:scale-105 text-foreground',
            urgency && 'border-loss-crimson/50'
          )}
        >
          {/* Circular Progress Container */}
          <div className="relative w-16 h-16 flex items-center justify-center">
            <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
              <circle
                cx="32"
                cy="32"
                r={radius}
                stroke="#edeeef" // surface-container-high
                strokeWidth="4"
                fill="transparent"
              />
              <motion.circle
                cx="32"
                cy="32"
                r={radius}
                stroke={urgency ? 'var(--loss-crimson)' : 'var(--action-emerald)'}
                strokeWidth="4"
                fill="transparent"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                strokeLinecap="round"
                transition={{ duration: 0.2 }}
              />
            </svg>
            <span 
              className={cn(
                "absolute font-mono text-xl font-bold",
                urgency ? "text-loss-crimson" : "text-primary"
              )} 
              data-testid="timer-seconds"
            >
              {timeLeft}
            </span>
          </div>

          {/* Details Column */}
          <div>
            <div className={cn(
              "flex items-center gap-2 font-bold text-sm",
              urgency ? "text-loss-crimson animate-pulse" : "text-action-emerald"
            )}>
              <Clock className="h-4 w-4 animate-pulse text-victory-gold" />
              <span>Your turn</span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              {urgency ? 'Make a play before time runs out!' : 'Drop a combo or draw to continue.'}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

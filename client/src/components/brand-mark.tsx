import { cn } from '@/lib/utils';

interface BrandMarkProps {
  className?: string;
  imageClassName?: string;
}

export function BrandMark({ className, imageClassName }: BrandMarkProps) {
  return (
    <div
      className={cn(
        'bg-surface-cream rounded-xl shadow-md flex items-center justify-center',
        className,
      )}
    >
      <img
        src="/icons/F5.png"
        alt="Furious Five"
        className={cn('block object-contain', imageClassName)}
      />
    </div>
  );
}

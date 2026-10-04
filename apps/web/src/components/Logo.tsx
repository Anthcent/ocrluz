import clsx from 'clsx';

export function Mascot({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="18" fill="#18191D" />
      <path d="M17 16h22l8 8v24H17z" fill="#fff" />
      <path d="M39 16v9h8" fill="#A38EF9" />
      <path d="M24 31h16M24 37h16M24 43h10" stroke="#18191D" strokeWidth="3" strokeLinecap="round" />
      <circle cx="46" cy="47" r="8" fill="#A4F5A6" />
    </svg>
  );
}

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <div className={clsx('flex items-center text-eel', compact ? 'gap-1.5' : 'gap-2', className)}>
      <Mascot className={compact ? 'size-8' : 'size-9'} />
      <span className={clsx('font-bold tracking-[-0.04em] text-current', compact ? 'text-[1.375rem]' : 'text-2xl')}>ocryon</span>
    </div>
  );
}

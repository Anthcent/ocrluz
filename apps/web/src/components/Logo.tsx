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

export function Logo({ className }: { className?: string }) {
  return (
    <div className={clsx('flex items-center gap-2 text-eel', className)}>
      <Mascot className="size-9" />
      <span className="text-2xl font-bold tracking-[-0.04em] text-current">ocryon</span>
    </div>
  );
}

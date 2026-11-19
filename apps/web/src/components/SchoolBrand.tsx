import clsx from 'clsx';
import { SCHOOL_LOGO_ALT, SCHOOL_LOGO_SMALL_URL, SCHOOL_NAME } from '../lib/branding';

/**
 * School crest. `className` sets its height. The PNG is transparent, so on dark surfaces (`onDark`)
 * it sits on a white tile to stay readable.
 */
export function SchoolCrest({ className, onDark }: { className?: string; onDark?: boolean }) {
  const img = <img src={SCHOOL_LOGO_SMALL_URL} alt={SCHOOL_LOGO_ALT} width={279} height={360} className={clsx('w-auto object-contain', className)} />;
  if (!onDark) return img;
  return <span className="inline-flex w-fit rounded-[24px] bg-white p-3 shadow-[0_1px_2px_rgba(41,36,68,0.06)]">{img}</span>;
}

/** Crest with the school name next to it, for the sign-in screens. */
export function SchoolBrand({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' }) {
  return (
    <div className={clsx('flex items-center gap-3', className)}>
      <SchoolCrest className={size === 'sm' ? 'h-12' : 'h-16 sm:h-20'} />
      <p className={clsx('font-bold leading-tight tracking-[-0.015em] text-eel', size === 'sm' ? 'text-base' : 'text-lg sm:text-xl')}>{SCHOOL_NAME}</p>
    </div>
  );
}

import clsx from 'clsx';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

export type HeaderTone = 'violet' | 'mint' | 'amber' | 'ink' | 'neutral';

const TONES: Record<HeaderTone, string> = {
  violet: 'bg-macaw-light text-macaw-dark',
  mint: 'bg-feather-light text-feather-dark',
  amber: 'bg-bee-light text-bee-dark',
  ink: 'bg-eel text-white',
  neutral: 'bg-polar text-eel',
};

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Module icon, rendered inside a tinted tile. */
  icon?: ReactNode;
  tone?: HeaderTone;
  /** Overrides the tile colors (e.g. a folder's own color). */
  tileClassName?: string;
  /** Renders `icon` as-is, without the tinted tile (for icons that bring their own tile). */
  bareIcon?: boolean;
  /** Small context label above the title (document type, category). */
  eyebrow?: ReactNode;
  /** Back link or navigation row shown above the title. */
  back?: ReactNode;
  /** Page-level actions; they sit to the right on wide screens and wrap below on phones. */
  actions?: ReactNode;
  /** Chips or compact stats shown under the title row. */
  meta?: ReactNode;
  /** Extra content that belongs to the header surface (search field, progress). */
  children?: ReactNode;
  className?: string;
}

/**
 * Anchored header surface shared by every module page: a white band with a
 * tinted module tile, title, short subtitle and optional actions / meta.
 */
export function PageHeader({ title, subtitle, icon, tone = 'violet', tileClassName, bareIcon, eyebrow, back, actions, meta, children, className }: PageHeaderProps) {
  return (
    <header className={clsx('mb-5 animate-header-in rounded-[20px] bg-white p-4 shadow-surface sm:rounded-[24px] sm:p-5 lg:mb-6 lg:px-6', className)}>
      {back && <div className="-ml-1 -mt-1 mb-3 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 sm:mb-4">{back}</div>}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex min-w-0 flex-[1_1_16rem] items-center gap-3 sm:gap-4">
          {icon &&
            (bareIcon ? (
              <span className="shrink-0">{icon}</span>
            ) : (
              <span
                aria-hidden="true"
                className={clsx(
                  'flex size-11 shrink-0 items-center justify-center rounded-[14px] sm:size-12 sm:rounded-2xl [&>svg]:size-[22px] sm:[&>svg]:size-6',
                  tileClassName ?? TONES[tone],
                )}
              >
                {icon}
              </span>
            ))}
          <div className="min-w-0 flex-1">
            {eyebrow && <div className="mb-0.5 truncate text-xs font-semibold text-macaw-dark sm:text-sm">{eyebrow}</div>}
            <h1 className="break-words text-[1.375rem] font-bold leading-[1.15] text-eel sm:text-[1.75rem] lg:text-[2rem]">{title}</h1>
            {subtitle && <p className="mt-1 max-w-[65ch] text-sm leading-snug text-wolf sm:text-[0.9375rem]">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto sm:shrink-0 sm:justify-end">{actions}</div>}
      </div>

      {meta && <div className="mt-3 flex flex-wrap items-center gap-1.5 sm:mt-4 sm:gap-2">{meta}</div>}
      {children && <div className="mt-4 sm:mt-5">{children}</div>}
    </header>
  );
}

/** Pill-shaped back link for detail pages (44px target). */
export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex min-h-11 min-w-0 items-center gap-1.5 rounded-full px-2 text-sm font-bold text-wolf transition-colors duration-200 hover:bg-polar hover:text-eel"
    >
      <ArrowLeft className="size-4 shrink-0" aria-hidden />
      <span className="max-w-52 truncate">{children}</span>
    </Link>
  );
}

const CHIP_TONES = {
  neutral: 'bg-polar text-wolf',
  strong: 'bg-polar text-eel',
  violet: 'bg-macaw-light text-macaw-dark',
  mint: 'bg-feather-light text-feather-dark',
  amber: 'bg-bee-light text-bee-dark',
};

/** Compact sentence-case chip for the header meta row. */
export function HeaderChip({ children, tone = 'neutral', className }: { children: ReactNode; tone?: keyof typeof CHIP_TONES; className?: string }) {
  return (
    <span className={clsx('inline-flex min-h-7 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold sm:text-[0.8125rem]', CHIP_TONES[tone], className)}>{children}</span>
  );
}

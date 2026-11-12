import clsx from 'clsx';
import { BriefcaseBusiness } from 'lucide-react';
import { Link } from 'react-router';

/** Corner shortcut that opens a scan in the Word-style workspace. `compact` shows only the icon. */
export function WorkspaceLink({ scanId, compact, className }: { scanId: number; compact?: boolean; className?: string }) {
  return (
    <Link
      to={`/zona-de-trabajo/${scanId}`}
      aria-label="Zona de trabajo"
      title="Zona de trabajo"
      className={clsx(
        'absolute right-2.5 top-2.5 z-[1] inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-macaw-light text-xs font-bold text-macaw-dark shadow-[0_1px_2px_rgba(41,36,68,0.08)] transition-[transform,background-color,color] hover:bg-macaw hover:text-on-macaw active:scale-95',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-macaw/35',
        compact ? 'w-9' : 'px-3',
        className,
      )}
    >
      <BriefcaseBusiness className="size-4 shrink-0" aria-hidden />
      {!compact && 'Zona de trabajo'}
    </Link>
  );
}

import clsx from 'clsx';
import { FolderOpen, Tag } from 'lucide-react';
import { GROUP_STYLES } from '../lib/constants';
import { DocTypeIcon } from './DocTypeIcon';
import type { Group } from '../lib/types';

const SIZES = {
  sm: { box: 'w-20 h-16', title: 'text-[10px]', author: 'hidden', pad: 'p-2 pt-3', icon: 'size-8' },
  md: { box: 'w-36 h-28', title: 'text-sm', author: 'text-[10px]', pad: 'p-3 pt-4', icon: 'size-12' },
  lg: { box: 'w-36 h-28 sm:w-52 sm:h-40', title: 'text-lg sm:text-xl', author: 'text-xs sm:text-sm', pad: 'p-4 pt-5', icon: 'size-16' },
};

/** Miniatura de carpeta: pestaña de color, categoría, título y responsable. */
export function FolderCard({ group, size = 'md', className }: { group: Pick<Group, 'title' | 'author' | 'category' | 'color'>; size?: keyof typeof SIZES; className?: string }) {
  const style = GROUP_STYLES[group.color];
  const s = SIZES[size];
  return (
    <div className={clsx('shrink-0', className)}>
      <div className={clsx('relative', s.box)}>
        {/* Pestaña de la carpeta */}
        <div className={clsx('absolute left-2 top-0 h-2.5 w-1/3 rounded-t-md', style.bg)} />
        <div className="absolute inset-x-0 bottom-0 top-2 overflow-hidden rounded-xl bg-white text-eel shadow-[0_1px_2px_rgba(41,36,68,0.08)] ring-1 ring-black/[0.04]">
          <div className={clsx('h-1', style.bg)} />
          <FolderOpen className={clsx('absolute -bottom-2 -right-2 text-swan/70', s.icon)} />
          <div className={clsx('relative flex h-full flex-col', s.pad)}>
            {group.category && size !== 'sm' && (
              <span className={clsx('inline-flex w-fit max-w-full items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold', style.soft, style.text)}>
                <DocTypeIcon type={group.category} variant="inline" fallback={Tag} className="[&_svg]:size-3.5" />
                <span className="truncate">{group.category}</span>
              </span>
            )}
            <div className={clsx('mt-auto line-clamp-2 font-bold leading-tight text-eel', s.title)}>{group.title}</div>
            {group.author && <div className={clsx('mt-0.5 truncate pb-1 font-medium text-wolf', s.author)}>{group.author}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

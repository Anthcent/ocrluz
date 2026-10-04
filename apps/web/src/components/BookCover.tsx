import clsx from 'clsx';
import { BookOpen } from 'lucide-react';
import { categoryEmoji, GROUP_STYLES } from '../lib/constants';
import type { Group } from '../lib/types';

const SIZES = {
  sm: { box: 'w-20 h-28', title: 'text-[10px]', author: 'hidden', pad: 'p-2 pl-3.5', icon: 'size-8' },
  md: { box: 'w-32 h-44', title: 'text-sm', author: 'text-[10px]', pad: 'p-3 pl-5', icon: 'size-14' },
  lg: { box: 'w-32 h-44 sm:w-48 sm:h-64', title: 'text-lg sm:text-xl', author: 'text-xs sm:text-sm', pad: 'p-4 pl-7', icon: 'size-20' },
};

/** Portada editorial compacta con marcador de categoría. */
export function BookCover({ group, size = 'md', className }: { group: Pick<Group, 'title' | 'author' | 'category' | 'color'>; size?: keyof typeof SIZES; className?: string }) {
  const style = GROUP_STYLES[group.color];
  const s = SIZES[size];
  return (
    <div className={clsx('shrink-0', className)}>
      <div className={clsx('relative overflow-hidden rounded-xl bg-white text-eel shadow-[0_1px_2px_rgba(41,36,68,0.08)] ring-1 ring-black/[0.04]', s.box)}>
        <BookOpen className={clsx('absolute -bottom-2 -right-2 text-swan/70', s.icon)} />
        <div className={clsx('relative flex h-full flex-col', s.pad)}>
          {group.category && size !== 'sm' && (
            <span className={clsx('w-fit rounded-lg px-2 py-1 text-xs font-semibold', style.soft, style.text)}>
              <span aria-hidden>{categoryEmoji(group.category)}</span> {group.category}
            </span>
          )}
          <div className={clsx('mt-auto line-clamp-4 font-bold leading-tight text-eel', s.title)}>{group.title}</div>
          {group.author && <div className={clsx('mt-1 truncate font-medium text-wolf', s.author)}>{group.author}</div>}
        </div>
      </div>
    </div>
  );
}

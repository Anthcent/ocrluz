import { CircleAlert, CircleCheck, CircleDashed, Clock3, LoaderCircle, type LucideIcon } from 'lucide-react';
import type { PageStatus } from '../lib/pages-store';

/** Status vocabulary for sheets: every state has a label and an icon, never color alone. */
export const STATUS: Record<PageStatus, { label: string; icon: LucideIcon; pill: string; dot: string }> = {
  pending: { label: 'Por leer', icon: CircleDashed, pill: 'bg-white text-eel', dot: 'bg-hare' },
  queued: { label: 'En espera', icon: Clock3, pill: 'bg-bee-light text-bee-dark', dot: 'bg-bee' },
  scanning: { label: 'Leyendo', icon: LoaderCircle, pill: 'bg-macaw-light text-macaw-dark', dot: 'bg-macaw' },
  done: { label: 'Con texto', icon: CircleCheck, pill: 'bg-feather-light text-feather-dark', dot: 'bg-feather' },
  error: { label: 'Falló', icon: CircleAlert, pill: 'bg-cardinal-light text-cardinal-dark', dot: 'bg-cardinal' },
};

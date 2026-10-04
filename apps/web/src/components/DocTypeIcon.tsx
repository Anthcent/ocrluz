import clsx from 'clsx';
import {
  Baby,
  ClipboardList,
  Contact,
  File,
  FileChartColumn,
  FileSearch,
  IdCard,
  NotebookPen,
  ScrollText,
  Sheet,
  Stethoscope,
  Tag,
  Users,
  type LucideIcon,
} from 'lucide-react';

/**
 * Icons for the built-in document types. Keys match both the template keys
 * (lib/doc-templates.ts) and the preset category names (lib/constants.ts),
 * since folders store the category by name.
 */
const PRESET_ICONS: Record<string, LucideIcon> = {
  resumen_final: FileChartColumn,
  'Resumen final': FileChartColumn,
  revision: FileSearch,
  Revisión: FileSearch,
  materia_vista: NotebookPen,
  'Materia vista': NotebookPen,
  acta: ScrollText,
  Acta: ScrollText,
  cedula_estudiante: IdCard,
  'Cédula de estudiante': IdCard,
  cedula_representante: Contact,
  'Cédula de representante': Contact,
  informe_medico: Stethoscope,
  'Informe médico': Stethoscope,
  sabana_notas: Sheet,
  'Sábana de notas': Sheet,
  partida_nacimiento: Baby,
  'Partida de nacimiento': Baby,
  ficha_inscripcion: ClipboardList,
  'Ficha de inscripción': ClipboardList,
  nomina: Users,
  Nómina: Users,
  generico: File,
  'Documento general': File,
  Otro: Tag,
};

/** Lucide icon for a preset template key or category name, or null for custom types. */
export const presetIcon = (keyOrName: string | null | undefined): LucideIcon | null => (keyOrName ? (PRESET_ICONS[keyOrName] ?? null) : null);

const TILE_SIZE = {
  sm: 'size-8 rounded-lg [&_svg]:size-4 text-base',
  md: 'size-10 rounded-xl [&_svg]:size-5 text-xl',
  lg: 'size-12 rounded-xl [&_svg]:size-6 text-2xl',
  xl: 'size-14 rounded-2xl [&_svg]:size-7 text-3xl',
} as const;

const TONES = {
  soft: 'bg-macaw-light text-macaw-dark',
  white: 'bg-white text-macaw-dark',
  neutral: 'bg-polar text-wolf',
} as const;

interface DocTypeIconProps {
  /** Template key («acta», «custom-12») or category / template name. */
  type: string | null | undefined;
  /** Emoji chosen for a custom type; shown only when the type is not a preset. */
  emoji?: string | null;
  /** Icon used when the type is neither a preset nor has an emoji. */
  fallback?: LucideIcon;
  /** «tile»: icon inside a soft rounded tile. «inline»: bare icon that inherits the text color. */
  variant?: 'tile' | 'inline';
  size?: keyof typeof TILE_SIZE;
  /** Tile background: «soft» on white surfaces, «white» on tinted ones, «neutral» for an unset type. */
  tone?: keyof typeof TONES;
  className?: string;
}

/** Consistent visual for a document type or folder category. */
export function DocTypeIcon({ type, emoji, fallback = File, variant = 'tile', size = 'md', tone = 'soft', className }: DocTypeIconProps) {
  const preset = presetIcon(type);
  const Icon = preset ?? (emoji ? null : fallback);
  const glyph = Icon ? (
    <Icon strokeWidth={2} aria-hidden className={variant === 'inline' ? 'size-4 shrink-0' : undefined} />
  ) : (
    <span aria-hidden className="leading-none">
      {emoji}
    </span>
  );

  if (variant === 'inline') return <span className={clsx('inline-flex shrink-0 items-center', className)}>{glyph}</span>;
  return (
    <span className={clsx('flex shrink-0 items-center justify-center', TONES[tone], TILE_SIZE[size], className)} aria-hidden>
      {glyph}
    </span>
  );
}

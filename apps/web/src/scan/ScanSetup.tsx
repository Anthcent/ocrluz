import clsx from 'clsx';
import { Check, ChevronDown, Cpu, FileText, Files, FolderOpen, KeyRound, Plus, Search, Sparkles, Zap } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { LabeledProgress } from '../components/ActionTile';
import { GroupFields } from '../components/GroupFields';
import { Toggle } from '../components/ui';
import { ENGINES, GROUP_STYLES, LANGUAGES } from '../lib/constants';
import type { Engine, Group, GroupInput } from '../lib/types';
import { GroupPicker } from './GroupPicker';

export type Mode = 'individual' | 'group';
export const NEW_GROUP = 'new';

/**
 * Botón grande de un paso: muestra lo elegido y, al pulsarlo, abre sus opciones
 * a lo ancho, debajo de los dos pasos.
 */
export function StepHeader({
  step,
  title,
  shortTitle,
  summary,
  icon,
  open,
  onToggle,
  warning,
}: {
  step: number;
  title: string;
  /** Título corto para móvil, donde los dos pasos van lado a lado. */
  shortTitle: string;
  summary: ReactNode;
  icon: ReactNode;
  open: boolean;
  onToggle: () => void;
  warning?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={clsx(
        'flex min-h-20 w-full items-center gap-2 rounded-2xl p-2.5 text-left shadow-[0_1px_2px_rgba(41,36,68,0.06)] transition-[transform,background-color,box-shadow] duration-200 active:scale-[0.99] sm:gap-3 sm:p-4',
        open ? 'bg-macaw-light shadow-[0_0_0_2px_#a38ef9]' : 'bg-white hover:bg-[#f7f7f8]',
      )}
    >
      <span className="relative shrink-0">
        <span className="flex size-10 items-center justify-center rounded-xl bg-polar text-eel sm:size-12 sm:rounded-2xl [&>svg]:size-6 sm:[&>svg]:size-7">{icon}</span>
        <span className="absolute -left-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-eel text-[11px] font-bold text-white sm:size-6 sm:text-xs">
          {step}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] font-semibold text-wolf sm:text-xs">
          <span className="sm:hidden">{shortTitle}</span>
          <span className="hidden sm:inline">{title}</span>
        </span>
        {/* En móvil el resumen ocupa hasta dos líneas porque los pasos van lado a lado */}
        <span className={clsx('line-clamp-2 text-sm font-bold leading-tight sm:line-clamp-1 sm:text-lg', warning ? 'text-bee-dark' : 'text-eel')}>
          {summary}
        </span>
      </span>
      <span className={clsx('hidden text-sm font-semibold lg:block', open ? 'text-macaw-dark' : 'text-wolf')}>
        {open ? 'Listo' : 'Cambiar'}
      </span>
      <ChevronDown className={clsx('size-5 shrink-0 text-hare transition sm:size-6', open && 'rotate-180 text-macaw-dark')} />
    </button>
  );
}

/** Panel desplegado de un paso, a todo lo ancho. */
export function StepPanel({ children }: { children: ReactNode }) {
  return <div className="space-y-5 rounded-3xl bg-white p-4 shadow-[0_1px_2px_rgba(41,36,68,0.06)] sm:p-6">{children}</div>;
}

/** Opción grande seleccionable. */
export function ChoiceCard({
  selected,
  onSelect,
  icon,
  iconClass,
  title,
  description,
  badge,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: ReactNode;
  iconClass: string;
  title: string;
  description: string;
  badge?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={clsx(
        'relative flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-[transform,background-color,box-shadow] duration-200 active:scale-[0.99]',
        selected ? 'bg-macaw-light shadow-[0_0_0_2px_#a38ef9]' : 'bg-polar hover:bg-[#e5e7ea]',
      )}
    >
      <span className={clsx('flex size-12 shrink-0 items-center justify-center rounded-xl [&>svg]:size-7', iconClass)}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={clsx('block font-bold', selected ? 'text-macaw-dark' : 'text-eel')}>{title}</span>
        <span className="block text-sm leading-snug text-wolf">{description}</span>
        {badge && <span className="mt-1 block">{badge}</span>}
      </span>
      <span
        className={clsx(
          'flex size-7 shrink-0 items-center justify-center rounded-full',
          selected ? 'bg-eel text-white' : 'bg-white shadow-[inset_0_0_0_1px_#c9cdd2]',
        )}
      >
        {selected && <Check className="size-4" strokeWidth={3} />}
      </span>
    </button>
  );
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={clsx(
        'inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition-[transform,background-color,color] duration-200 active:scale-[0.98]',
        selected ? 'bg-eel text-white' : 'bg-white text-wolf hover:bg-[#f7f7f8] hover:text-eel',
      )}
    >
      {children}
    </button>
  );
}

export interface DestinationProps {
  mode: Mode;
  setMode: (m: Mode) => void;
  groups: Group[];
  groupId: string;
  setGroupId: (id: string) => void;
  newGroup: GroupInput;
  setNewGroup: (g: GroupInput) => void;
  /** Hojas en el escáner y números de página impresos detectados en su texto. */
  sheets: { count: number; labels: string[] };
}

export function destinationSummary({ mode, groups, groupId, newGroup }: DestinationProps) {
  if (mode === 'individual') return 'Documentos sueltos';
  if (groupId === NEW_GROUP) return newGroup.title ? `Carpeta nueva: ${newGroup.title}` : 'Carpeta nueva';
  return `Carpeta: ${groups.find((g) => String(g.id) === groupId)?.title ?? ''}`;
}

const QUICK_GROUPS = 4;

export function DestinationPanel(props: DestinationProps) {
  const { mode, groups, groupId, sheets } = props;
  const selectedGroup = groups.find((g) => String(g.id) === groupId);
  const isNew = groupId === NEW_GROUP;
  const saved = isNew ? 0 : (selectedGroup?.scanCount ?? 0);
  const totalPages = isNew ? props.newGroup.totalPages : (selectedGroup?.totalPages ?? null);
  const afterSave = saved + sheets.count;
  const [picking, setPicking] = useState(false);
  // Accesos rápidos: las carpetas más recientes y, si no está entre ellas, la elegida.
  const recent = groups.slice(0, QUICK_GROUPS);
  const quickGroups = selectedGroup && !recent.includes(selectedGroup) ? [selectedGroup, ...recent.slice(0, QUICK_GROUPS - 1)] : recent;

  return (
    <StepPanel>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <ChoiceCard
          selected={mode === 'individual'}
          onSelect={() => props.setMode('individual')}
          icon={<FileText />}
          iconClass="bg-beetle-light text-beetle-dark"
          title="Documentos sueltos"
          description="Cada foto se guarda como un documento independiente."
        />
        <ChoiceCard
          selected={mode === 'group'}
          onSelect={() => props.setMode('group')}
          icon={<FolderOpen />}
          iconClass="bg-feather-light text-feather-dark"
          title="Carpeta"
          description="Las fotos se guardan juntas y en orden, como un expediente."
        />
      </div>

      {mode === 'group' && (
        <div className="space-y-5 rounded-2xl bg-polar p-3 sm:p-5">
          <div>
            <div className="mb-2 text-sm font-bold">Elige la carpeta</div>
            <div className="-mx-1 flex flex-wrap gap-2 px-1" role="group" aria-label="Carpeta">
              <Chip selected={isNew} onClick={() => props.setGroupId(NEW_GROUP)}>
                <Plus className="size-4" /> Nueva
              </Chip>
              {quickGroups.map((g) => (
                <Chip key={g.id} selected={groupId === String(g.id)} onClick={() => props.setGroupId(String(g.id))}>
                  <span className={clsx('size-3 rounded-full', GROUP_STYLES[g.color].bg)} />
                  <span className="max-w-48 truncate">{g.title}</span>
                </Chip>
              ))}
            </div>
            {groups.length > 1 && (
              <button
                type="button"
                onClick={() => setPicking(true)}
                className="mt-3 flex min-h-11 w-full items-center gap-3 rounded-xl bg-macaw px-4 py-2.5 text-left font-bold text-eel transition-[transform,background-color] duration-200 hover:bg-[#b09eff] active:scale-[0.99]"
              >
                <Search className="size-5 shrink-0" strokeWidth={3} />
                <span className="flex-1">Buscar entre tus {groups.length} carpetas</span>
                <span className="hidden text-xs font-semibold text-eel/70 sm:inline">por nombre, responsable o texto</span>
              </button>
            )}
            <GroupPicker open={picking} onClose={() => setPicking(false)} groups={groups} selectedId={groupId} onSelect={props.setGroupId} />
          </div>

          {isNew ? (
            <div className="rounded-2xl bg-white p-3 sm:p-4">
              <GroupFields value={props.newGroup} onChange={props.setNewGroup} />
            </div>
          ) : (
            selectedGroup && (
              <p className="text-sm text-wolf">
                Las hojas se añadirán al final de «{selectedGroup.title}» ({selectedGroup.scanCount ?? 0} ya guardadas).
              </p>
            )
          )}

          {/* Hojas detectadas en el escáner y avance de la carpeta */}
          <div className="flex items-start gap-3 rounded-2xl bg-feather-light p-3 sm:p-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-feather-light text-feather-dark">
              <Files className="size-6" />
            </span>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="font-bold" data-testid="sheet-count">
                {sheets.count === 0 ? 'Aún no hay hojas' : `${sheets.count} ${sheets.count === 1 ? 'hoja detectada' : 'hojas detectadas'}`}
              </div>
              {sheets.labels.length > 0 && (
                <div className="text-sm text-wolf">
                  Números de página detectados: <span className="font-bold text-eel">{pageRange(sheets.labels)}</span>
                </div>
              )}
              {totalPages ? (
                <LabeledProgress value={(afterSave / totalPages) * 100} label={`${afterSave} de ${totalPages} hojas`} />
              ) : (
                sheets.count > 0 && !isNew && <div className="text-sm text-wolf">Al guardar, la carpeta tendrá {afterSave} hojas.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </StepPanel>
  );
}

/** «3, 4, 5, 9» → «3–5, 9» (solo números arábigos; los romanos se muestran tal cual). */
function pageRange(labels: string[]) {
  const numbers = labels.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (numbers.length !== labels.length) return labels.join(', ');
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i];
    while (sorted[i + 1] === sorted[i] + 1) i++;
    parts.push(start === sorted[i] ? String(start) : `${start}–${sorted[i]}`);
  }
  return parts.join(', ');
}

const ENGINE_ICON: Record<Engine, { icon: ReactNode; className: string }> = {
  ocrspace: { icon: <Zap />, className: 'bg-bee-light text-bee-dark' },
  gemini: { icon: <Sparkles />, className: 'bg-beetle-light text-beetle-dark' },
  tesseract: { icon: <Cpu />, className: 'bg-macaw-light text-macaw-dark' },
};

export interface EngineProps {
  engine: Engine;
  setEngine: (e: Engine) => void;
  language: string;
  setLanguage: (l: string) => void;
  autoScan: boolean;
  setAutoScan: (v: boolean) => void;
  keysReady: Record<Engine, boolean>;
}

export function engineSummary({ engine, language, autoScan, keysReady }: EngineProps) {
  if (!keysReady[engine]) return `${ENGINES[engine].label} · sin API key`;
  const lang = LANGUAGES.find((l) => l.code === language)?.label ?? language;
  return `${ENGINES[engine].label} · ${lang}${autoScan ? ' · automático' : ''}`;
}

export function EnginePanel(props: EngineProps) {
  return (
    <StepPanel>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {(Object.keys(ENGINES) as Engine[]).map((e) => (
          <ChoiceCard
            key={e}
            selected={props.engine === e}
            onSelect={() => props.setEngine(e)}
            icon={ENGINE_ICON[e].icon}
            iconClass={ENGINE_ICON[e].className}
            title={ENGINES[e].label}
            description={ENGINES[e].description}
            badge={
              props.keysReady[e] ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-feather-light px-2 py-1 text-xs font-semibold text-feather-dark">
                  <Check className="size-3.5" strokeWidth={3} /> {ENGINES[e].online ? 'Listo' : 'Sin internet'}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-bee-light px-2 py-1 text-xs font-semibold text-bee-dark">
                  <KeyRound className="size-3.5" /> Falta la API key
                </span>
              )
            }
          />
        ))}
      </div>
      {!props.keysReady[props.engine] && (
        <p className="rounded-2xl bg-bee-light p-3 text-sm font-semibold">
          Para usar {ENGINES[props.engine].label} necesitas su API key.{' '}
          <Link to="/ajustes" className="font-bold text-macaw-dark underline decoration-macaw/50 underline-offset-2">
            Configurarla
          </Link>{' '}
          o elige Tesseract, que funciona sin clave.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <div className="mb-2 text-sm font-bold">Idioma del texto</div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Idioma del texto">
            {LANGUAGES.map((l) => (
              <Chip key={l.code} selected={props.language === l.code} onClick={() => props.setLanguage(l.code)}>
                {l.label}
              </Chip>
            ))}
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-polar p-3 md:max-w-sm">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-bee-light text-bee-dark">
            <Zap className="size-5" fill="currentColor" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">Escaneo automático</span>
            <span className="block text-sm text-wolf">{props.autoScan ? 'Cada foto se escanea al tomarla.' : 'Tomas las fotos y escaneas cuando quieras.'}</span>
          </span>
          <Toggle checked={props.autoScan} onChange={props.setAutoScan} label="Escaneo automático" />
        </label>
      </div>
    </StepPanel>
  );
}

export const destinationIcon = (mode: Mode) => (mode === 'group' ? <FolderOpen /> : <FileText />);
export const engineIcon = (engine: Engine) => ENGINE_ICON[engine].icon;

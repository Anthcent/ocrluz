import clsx from 'clsx';
import { Check, ChevronDown, Cpu, FileText, FolderOpen, FolderPlus, KeyRound, Layers, Sparkles, Zap, type LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { LabeledProgress } from '../components/ActionTile';
import { GroupFields } from '../components/GroupFields';
import { Segmented, Select, Toggle } from '../components/ui';
import { ENGINES, GROUP_STYLES, LANGUAGES } from '../lib/constants';
import { PRESET_TEMPLATES } from '../lib/doc-templates';
import type { Engine, Group, GroupInput } from '../lib/types';
import { GroupPicker } from './GroupPicker';

export type Mode = 'individual' | 'group';
export const NEW_GROUP = 'new';

export interface DestinationState {
  mode: Mode;
  setMode: (m: Mode) => void;
  groups: Group[];
  groupId: string;
  setGroupId: (id: string) => void;
  newGroup: GroupInput;
  setNewGroup: (g: GroupInput) => void;
}

export interface EngineState {
  engine: Engine;
  setEngine: (e: Engine) => void;
  language: string;
  setLanguage: (l: string) => void;
  autoScan: boolean;
  setAutoScan: (v: boolean) => void;
  keysReady: Record<Engine, boolean>;
}

export interface BatchSettingsProps {
  destination: DestinationState;
  engine: EngineState;
  docType: string | null;
  onDocType: (key: string | null) => void;
  /** Sheets in the batch and printed page numbers found in their text. */
  sheets: { count: number; labels: string[] };
}

export const ENGINE_ICON: Record<Engine, LucideIcon> = { ocrspace: Zap, gemini: Sparkles, tesseract: Cpu };

/** One-line description of where the batch goes. */
export function destinationLabel({ mode, groups, groupId, newGroup }: DestinationState) {
  if (mode === 'individual') return 'Documentos sueltos';
  if (groupId === NEW_GROUP) return newGroup.title.trim() ? `Nueva: ${newGroup.title.trim()}` : 'Carpeta por crear';
  return groups.find((g) => String(g.id) === groupId)?.title ?? 'Carpeta';
}

/** One-line description of how the text is read. */
export function engineLabel({ engine, language, autoScan, keysReady }: EngineState) {
  if (!keysReady[engine]) return `${ENGINES[engine].label}, falta la clave`;
  const lang = LANGUAGES.find((l) => l.code === language)?.label ?? language;
  return `${ENGINES[engine].label} · ${lang}${autoScan ? ' · al capturar' : ''}`;
}

export const templateFor = (key: string | null) => PRESET_TEMPLATES.find((t) => t.key === key) ?? null;

/** All batch options: destination, document type and reading engine. */
export function BatchSettings({ destination, engine, docType, onDocType, sheets }: BatchSettingsProps) {
  return (
    <div className="divide-y divide-swan">
      <DestinationSection {...destination} sheets={sheets} />
      <Section title="Tipo de documento" hint="Opcional. Propone la categoría y el nombre de una carpeta nueva.">
        <ChevronSelect
          value={docType ?? ''}
          onChange={(e) => onDocType(e.target.value || null)}
          aria-label="Tipo de documento del lote"
          data-testid="doc-type"
        >
          <option value="">Sin especificar</option>
          {PRESET_TEMPLATES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.emoji} {t.name}
            </option>
          ))}
        </ChevronSelect>
      </Section>
      <EngineSection {...engine} />
    </div>
  );
}

function ChevronSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <Select {...props} className="min-h-11" />
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-wolf" aria-hidden />
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3 py-5 first:pt-0 last:pb-0">
      <div>
        <h3 className="text-base font-bold text-eel">{title}</h3>
        {hint && <p className="mt-0.5 text-sm text-wolf">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={clsx(
        'inline-flex min-h-11 max-w-full shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-semibold transition-[transform,background-color,color] duration-150 ease-out active:scale-[0.97]',
        selected ? 'bg-eel text-white' : 'bg-polar text-eel hover:bg-polar-hover',
      )}
    >
      {children}
    </button>
  );
}

const QUICK_GROUPS = 4;

function DestinationSection(props: DestinationState & { sheets: BatchSettingsProps['sheets'] }) {
  const { mode, groups, groupId, sheets } = props;
  const [picking, setPicking] = useState(false);
  const selectedGroup = groups.find((g) => String(g.id) === groupId);
  const isNew = groupId === NEW_GROUP;
  const saved = isNew ? 0 : (selectedGroup?.scanCount ?? 0);
  const totalPages = isNew ? props.newGroup.totalPages : (selectedGroup?.totalPages ?? null);
  const afterSave = saved + sheets.count;
  const recent = groups.slice(0, QUICK_GROUPS);
  const quickGroups = selectedGroup && !recent.includes(selectedGroup) ? [selectedGroup, ...recent.slice(0, QUICK_GROUPS - 1)] : recent;

  return (
    <Section title="Destino">
      <Segmented<Mode>
        value={mode}
        onChange={props.setMode}
        options={[
          { value: 'individual', label: 'Por separado', icon: <FileText className="size-4" /> },
          { value: 'group', label: 'En carpeta', icon: <FolderOpen className="size-4" /> },
        ]}
      />
      <p className="text-sm text-wolf">
        {mode === 'individual' ? 'Cada hoja se archiva como un documento suelto.' : 'Las hojas se archivan juntas y en este orden dentro de una carpeta.'}
      </p>

      {mode === 'group' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Carpeta de destino">
            <Chip selected={isNew} onClick={() => props.setGroupId(NEW_GROUP)}>
              <FolderPlus className="size-4" /> Crear carpeta
            </Chip>
            {quickGroups.map((g) => (
              <Chip key={g.id} selected={groupId === String(g.id)} onClick={() => props.setGroupId(String(g.id))}>
                <span className={clsx('size-2.5 shrink-0 rounded-full', GROUP_STYLES[g.color].bg)} aria-hidden />
                <span className="truncate">{g.title}</span>
              </Chip>
            ))}
          </div>
          {groups.length > 1 && (
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-full px-1 text-sm font-bold text-macaw-dark underline decoration-macaw/40 underline-offset-4 transition-colors hover:decoration-macaw-dark"
            >
              Explorar las {groups.length} carpetas
            </button>
          )}
          <GroupPicker open={picking} onClose={() => setPicking(false)} groups={groups} selectedId={groupId} onSelect={props.setGroupId} />

          {isNew ? (
            <GroupFields value={props.newGroup} onChange={props.setNewGroup} />
          ) : (
            selectedGroup && (
              <p className="text-sm text-wolf">
                Se colocarán después de las {selectedGroup.scanCount ?? 0} hojas que ya tiene «{selectedGroup.title}».
              </p>
            )
          )}

          <div className="flex items-start gap-3 rounded-xl bg-feather-light p-3">
            <Layers className="mt-0.5 size-5 shrink-0 text-feather-dark" aria-hidden />
            <div className="min-w-0 flex-1 space-y-1.5 text-sm">
              <div className="font-bold text-eel" data-testid="sheet-count">
                {sheets.count === 0 ? 'Todavía no hay hojas en el lote' : `${sheets.count} ${sheets.count === 1 ? 'hoja en el lote' : 'hojas en el lote'}`}
              </div>
              {sheets.labels.length > 0 && (
                <div className="text-wolf">
                  Numeración encontrada: <span className="font-bold text-eel">{pageRange(sheets.labels)}</span>
                </div>
              )}
              {totalPages ? (
                <LabeledProgress value={(afterSave / totalPages) * 100} label={`${afterSave} / ${totalPages} previstas`} />
              ) : (
                sheets.count > 0 && !isNew && <div className="text-wolf">Tras archivar, la carpeta sumará {afterSave} hojas.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}

/** «3, 4, 5, 9» → «3-5, 9» (solo números arábigos; los romanos se muestran tal cual). */
function pageRange(labels: string[]) {
  const numbers = labels.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (numbers.length !== labels.length) return labels.join(', ');
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i];
    while (sorted[i + 1] === sorted[i] + 1) i++;
    parts.push(start === sorted[i] ? String(start) : `${start}-${sorted[i]}`);
  }
  return parts.join(', ');
}

const ENGINE_COPY: Record<Engine, string> = {
  ocrspace: 'Servicio en línea, ágil para hojas impresas.',
  gemini: 'Inteligencia artificial de Google para hojas difíciles o manuscritas.',
  tesseract: 'Lee en este equipo; la foto no sale de aquí.',
};

function EngineSection(props: EngineState) {
  const missing = !props.keysReady[props.engine];
  return (
    <Section title="Lectura del texto">
      <div className="space-y-2" role="group" aria-label="Servicio de lectura">
        {(Object.keys(ENGINES) as Engine[]).map((e) => {
          const Icon = ENGINE_ICON[e];
          const selected = props.engine === e;
          const ready = props.keysReady[e];
          return (
            <button
              key={e}
              type="button"
              onClick={() => props.setEngine(e)}
              aria-pressed={selected}
              className={clsx(
                'flex min-h-14 w-full items-center gap-3 rounded-xl p-3 text-left transition-[transform,background-color,box-shadow] duration-150 ease-out active:scale-[0.99]',
                selected ? 'bg-macaw-light shadow-[inset_0_0_0_2px_var(--color-macaw)]' : 'bg-polar hover:bg-polar-hover',
              )}
            >
              <span className={clsx('flex size-9 shrink-0 items-center justify-center rounded-lg', selected ? 'bg-white text-macaw-dark' : 'bg-white text-eel')}>
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-bold text-eel">{ENGINES[e].label}</span>
                  {ready ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-feather-dark">
                      <Check className="size-3.5" strokeWidth={3} /> {ENGINES[e].online ? 'Disponible' : 'Funciona sin conexión'}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-bee-dark">
                      <KeyRound className="size-3.5" /> Necesita clave
                    </span>
                  )}
                </span>
                <span className="block text-sm leading-snug text-wolf">{ENGINE_COPY[e]}</span>
              </span>
            </button>
          );
        })}
      </div>
      {missing && (
        <p className="flex gap-2 rounded-xl bg-bee-light p-3 text-sm font-semibold text-eel" role="note">
          <KeyRound className="mt-0.5 size-4 shrink-0 text-bee-dark" aria-hidden />
          <span>
            {ENGINES[props.engine].label} no tiene clave configurada.{' '}
            <Link to="/ajustes" className="font-bold text-macaw-dark underline decoration-macaw/50 underline-offset-2">
              Añadir la clave en Ajustes
            </Link>{' '}
            o cambia a Tesseract, que no la necesita.
          </span>
        </p>
      )}

      <label className="block space-y-1.5">
        <span className="block text-sm font-bold text-eel">Idioma de las hojas</span>
        <ChevronSelect value={props.language} onChange={(e) => props.setLanguage(e.target.value)}>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </ChevronSelect>
      </label>

      <div className="flex items-center gap-3 rounded-xl bg-polar p-3">
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-eel">Leer al capturar</span>
          <span className="block text-sm text-wolf">{props.autoScan ? 'Cada hoja se lee en cuanto la añades.' : 'Añades todas y decides cuándo leerlas.'}</span>
        </span>
        <Toggle checked={props.autoScan} onChange={props.setAutoScan} label="Leer al capturar" />
      </div>
    </Section>
  );
}

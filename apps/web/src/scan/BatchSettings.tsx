import clsx from 'clsx';
import { ChevronDown, CircleCheck, Cpu, FileText, FolderOpen, KeyRound, Layers, Repeat, Sparkles, Zap, type LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { LabeledProgress } from '../components/ActionTile';
import { DocTypeIcon } from '../components/DocTypeIcon';
import { FolderCard } from '../components/FolderCard';
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

const sheetsWord = (n: number) => `${n} ${n === 1 ? 'hoja' : 'hojas'}`;

/**
 * All batch options, shared by the mobile sheet and the desktop panel:
 * document type first (it suggests the folder name), then destination, then reading.
 */
export function BatchSettings({ destination, engine, docType, onDocType, sheets }: BatchSettingsProps) {
  return (
    <div className="divide-y divide-swan">
      <DocTypeSection docType={docType} onDocType={onDocType} />
      <DestinationSection {...destination} docType={docType} sheets={sheets} />
      <EngineSection {...engine} />
    </div>
  );
}

function ChevronSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative min-w-0 flex-1">
      <Select {...props} className="min-h-11" />
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-wolf" aria-hidden />
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3.5 py-6 first:pt-0 last:pb-0">
      <div>
        <h3 className="text-base font-bold text-eel">{title}</h3>
        {hint && <p className="mt-0.5 text-sm text-wolf">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** Large selectable row: icon, title, one-line explanation and a check when selected. */
function OptionCard({
  selected,
  onClick,
  icon,
  title,
  badge,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  badge?: ReactNode;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={clsx(
        'flex min-h-14 w-full items-center gap-3 rounded-xl p-3 text-left transition-[transform,background-color,box-shadow] duration-150 ease-out active:scale-[0.99] motion-reduce:transition-none',
        selected ? 'bg-macaw-light shadow-[inset_0_0_0_2px_var(--color-macaw)]' : 'bg-polar hover:bg-polar-hover',
      )}
    >
      <span className={clsx('flex size-9 shrink-0 items-center justify-center rounded-lg bg-white [&_svg]:size-5', selected ? 'text-macaw-dark' : 'text-eel')} aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-bold text-eel">{title}</span>
          {badge}
        </span>
        <span className="block text-sm leading-snug text-wolf">{description}</span>
      </span>
      <CircleCheck
        className={clsx('size-5 shrink-0 transition-opacity duration-150', selected ? 'text-macaw-dark opacity-100' : 'opacity-0')}
        strokeWidth={2.25}
        aria-hidden
      />
    </button>
  );
}

function DocTypeSection({ docType, onDocType }: { docType: string | null; onDocType: (key: string | null) => void }) {
  const template = templateFor(docType);
  return (
    <Section title="Tipo de documento" hint="Opcional. Sugiere el nombre y la categoría de una carpeta nueva.">
      <div className="flex items-center gap-3">
        <DocTypeIcon type={template?.key} fallback={FileText} size="lg" tone={template ? 'soft' : 'neutral'} />
        <ChevronSelect value={docType ?? ''} onChange={(e) => onDocType(e.target.value || null)} aria-label="Tipo de documento del lote" data-testid="doc-type">
          <option value="">Sin especificar</option>
          {PRESET_TEMPLATES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.name}
            </option>
          ))}
        </ChevronSelect>
      </div>
    </Section>
  );
}

type Target = 'existing' | 'new';
const QUICK_GROUPS = 3;

function DestinationSection(props: DestinationState & { docType: string | null; sheets: BatchSettingsProps['sheets'] }) {
  const { mode, groups, groupId, setGroupId, newGroup, sheets } = props;
  const [picking, setPicking] = useState(false);
  const isNew = groupId === NEW_GROUP;
  const selectedGroup = isNew ? undefined : groups.find((g) => String(g.id) === groupId);
  // Remember the last existing folder so switching to "new" and back restores it.
  const [lastExisting, setLastExisting] = useState<string | null>(isNew ? null : groupId);
  if (!isNew && groupId !== lastExisting) setLastExisting(groupId);

  const target: Target = isNew ? 'new' : 'existing';
  const chooseTarget = (t: Target) => {
    if (t === 'new') setGroupId(NEW_GROUP);
    else {
      const fallback = lastExisting && groups.some((g) => String(g.id) === lastExisting) ? lastExisting : groups[0] && String(groups[0].id);
      if (fallback) setGroupId(fallback);
    }
  };

  return (
    <Section title="Dónde se guardan">
      <div className="space-y-2" role="group" aria-label="Forma de archivar">
        <OptionCard
          selected={mode === 'individual'}
          onClick={() => props.setMode('individual')}
          icon={<FileText />}
          title="Por separado"
          description="Cada hoja se guarda como un documento suelto."
        />
        <OptionCard
          selected={mode === 'group'}
          onClick={() => props.setMode('group')}
          icon={<FolderOpen />}
          title="En carpeta"
          description="Todas juntas y en este orden, dentro de una carpeta."
        />
      </div>

      {mode === 'group' && (
        <div className="space-y-4 pt-1">
          {groups.length > 0 ? (
            <Segmented<Target>
              value={target}
              onChange={chooseTarget}
              options={[
                { value: 'existing', label: 'Carpeta existente' },
                { value: 'new', label: 'Carpeta nueva' },
              ]}
            />
          ) : (
            <p className="text-sm text-wolf">Todavía no tienes carpetas. Crea la primera con estos datos.</p>
          )}

          {isNew ? (
            <NewFolderForm value={newGroup} onChange={props.setNewGroup} docType={props.docType} />
          ) : (
            <>
              {selectedGroup ? (
                <SelectedFolder group={selectedGroup} incoming={sheets.count} onChange={groups.length > 1 ? () => setPicking(true) : undefined} />
              ) : groups.length === 0 ? (
                <div className="h-28 animate-pulse rounded-xl bg-polar motion-reduce:animate-none" role="status" aria-label="Cargando carpeta" />
              ) : (
                <p className="rounded-xl bg-bee-light p-3 text-sm font-semibold text-eel">No encontramos esa carpeta. Elige otra o crea una nueva.</p>
              )}
              <RecentFolders groups={groups} selectedId={groupId} onSelect={setGroupId} />
            </>
          )}
          <GroupPicker open={picking} onClose={() => setPicking(false)} groups={groups} selectedId={groupId} onSelect={setGroupId} />
        </div>
      )}

      <DestinationSummary {...props} selectedGroup={selectedGroup} />
    </Section>
  );
}

/** The chosen existing folder, prominent, with a way to change it. */
function SelectedFolder({ group, incoming, onChange }: { group: Group; incoming: number; onChange?: () => void }) {
  const saved = group.scanCount ?? 0;
  const style = GROUP_STYLES[group.color];
  return (
    <div className="rounded-xl bg-polar p-3" data-testid="selected-folder">
      <div className="flex items-center gap-3">
        <FolderCard group={group} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 font-bold leading-tight text-eel">{group.title}</div>
          {group.author && <div className={clsx('truncate text-sm font-semibold', style.text)}>Responsable: {group.author}</div>}
          <div className="text-sm text-wolf">
            {sheetsWord(saved)}
            {group.totalPages ? ` de ${group.totalPages} previstas` : ' guardadas'}
          </div>
        </div>
      </div>
      {group.totalPages ? (
        <div className="mt-3">
          <LabeledProgress value={((saved + incoming) / group.totalPages) * 100} label={`${saved + incoming} / ${group.totalPages}`} />
          {incoming > 0 && <p className="mt-1 text-xs text-wolf">Incluye las {sheetsWord(incoming)} de este lote.</p>}
        </div>
      ) : null}
      {onChange && (
        <button
          type="button"
          onClick={onChange}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-bold text-eel transition-[transform,background-color] duration-150 hover:bg-snow active:scale-[0.98]"
        >
          <Repeat className="size-4" aria-hidden /> Cambiar carpeta
        </button>
      )}
    </div>
  );
}

/** Quick picks among the most recently updated folders. */
function RecentFolders({ groups, selectedId, onSelect }: { groups: Group[]; selectedId: string; onSelect: (id: string) => void }) {
  const recent = groups.filter((g) => String(g.id) !== selectedId).slice(0, QUICK_GROUPS);
  if (recent.length === 0) return null;
  return (
    <div>
      <div className="mb-2 text-sm font-bold text-eel">Recientes</div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Carpetas recientes">
        {recent.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => onSelect(String(g.id))}
            className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-full bg-polar px-3.5 text-sm font-semibold text-eel transition-[transform,background-color] duration-150 hover:bg-polar-hover active:scale-[0.97]"
          >
            <span className={clsx('size-2.5 shrink-0 rounded-full', GROUP_STYLES[g.color].bg)} aria-hidden />
            <span className="truncate">{g.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function NewFolderForm({ value, onChange, docType }: { value: GroupInput; onChange: (g: GroupInput) => void; docType: string | null }) {
  const template = templateFor(docType);
  const suggested = Boolean(template && value.title.startsWith(template.name));
  return (
    <div className="space-y-3">
      {suggested && template && (
        <p className="flex items-center gap-2 text-sm text-wolf">
          <DocTypeIcon type={template.key} variant="inline" className="text-macaw-dark" />
          Nombre sugerido por el tipo «{template.name}». Puedes cambiarlo.
        </p>
      )}
      <GroupFields value={value} onChange={onChange} />
    </div>
  );
}

/** Plain-language summary of where the sheets will end up. */
function DestinationSummary({
  mode,
  groupId,
  newGroup,
  sheets,
  selectedGroup,
}: DestinationState & { sheets: BatchSettingsProps['sheets']; selectedGroup: Group | undefined }) {
  const name = newGroup.title.trim();
  const where =
    mode === 'individual'
      ? 'Cada hoja aparecerá como documento suelto en el archivo.'
      : groupId === NEW_GROUP
        ? name
          ? `Se creará la carpeta «${name}» con estas hojas.`
          : 'Escribe un nombre para crear la carpeta.'
        : selectedGroup
          ? selectedGroup.scanCount
            ? `Las hojas se sumarán al final de «${selectedGroup.title}», después de sus ${sheetsWord(selectedGroup.scanCount)}.`
            : `Las hojas serán las primeras de «${selectedGroup.title}».`
          : 'Elige la carpeta de destino.';
  const needsName = mode === 'group' && groupId === NEW_GROUP && !name;

  return (
    <div className={clsx('flex items-start gap-3 rounded-xl p-3', needsName ? 'bg-bee-light' : 'bg-feather-light')}>
      <Layers className={clsx('mt-0.5 size-5 shrink-0', needsName ? 'text-bee-dark' : 'text-feather-dark')} aria-hidden />
      <div className="min-w-0 flex-1 space-y-1 text-sm">
        <div className="font-bold text-eel" data-testid="sheet-count">
          {sheets.count === 0 ? 'Todavía no hay hojas en el lote' : `${sheetsWord(sheets.count)} en el lote`}
        </div>
        <p className="text-eel">{where}</p>
        {sheets.labels.length > 0 && (
          <div className="text-wolf">
            Numeración encontrada: <span className="font-bold text-eel">{pageRange(sheets.labels)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** «3, 4, 5, 9» → «3-5, 9» (Arabic numerals only; Roman numerals are shown as they are). */
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
  const language = LANGUAGES.find((l) => l.code === props.language)?.label ?? props.language;
  return (
    <Section title="Lectura del texto">
      <div className="space-y-2" role="group" aria-label="Servicio de lectura">
        {(Object.keys(ENGINES) as Engine[]).map((e) => {
          const Icon = ENGINE_ICON[e];
          return (
            <OptionCard
              key={e}
              selected={props.engine === e}
              onClick={() => props.setEngine(e)}
              icon={<Icon />}
              title={ENGINES[e].label}
              description={ENGINE_COPY[e]}
              badge={
                props.keysReady[e] ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-feather-dark">{ENGINES[e].online ? 'Disponible' : 'Funciona sin conexión'}</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-bee-dark">
                    <KeyRound className="size-3.5" aria-hidden /> Necesita clave
                  </span>
                )
              }
            />
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

      <details className="group rounded-xl bg-polar">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-xl px-3 py-2 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-eel">Idioma y momento de lectura</span>
            <span className="block truncate text-sm text-wolf">
              {language} · {props.autoScan ? 'al capturar' : 'cuando tú decidas'}
            </span>
          </span>
          <ChevronDown className="size-5 shrink-0 text-wolf transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
        </summary>
        <div className="space-y-3 px-3 pb-3 pt-1">
          <label className="block space-y-1.5">
            <span className="block text-sm font-bold text-eel">Idioma de las hojas</span>
            <span className="flex">
              <ChevronSelect value={props.language} onChange={(e) => props.setLanguage(e.target.value)}>
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </ChevronSelect>
            </span>
          </label>
          <div className="flex items-center gap-3 rounded-xl bg-white p-3">
            <span className="min-w-0 flex-1">
              <span className="block font-bold text-eel">Leer al capturar</span>
              <span className="block text-sm text-wolf">{props.autoScan ? 'Cada hoja se lee en cuanto la añades.' : 'Añades todas y decides cuándo leerlas.'}</span>
            </span>
            <Toggle checked={props.autoScan} onChange={props.setAutoScan} label="Leer al capturar" />
          </div>
        </div>
      </details>
    </Section>
  );
}

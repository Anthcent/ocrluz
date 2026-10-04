import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { CATEGORY_PRESETS, categoryEmoji, GROUP_COLORS, GROUP_STYLES } from '../lib/constants';
import type { GroupInput } from '../lib/types';
import { Field, Input, Textarea } from './ui';

export const EMPTY_GROUP: GroupInput = { title: '', description: '', author: '', category: '', color: 'green', totalPages: null };

/**
 * Datos de una carpeta: nombre, responsable, categoría, hojas esperadas, color y (opcional) descripción.
 * Se usa al crear una carpeta desde el escáner y al editarla desde el archivo.
 */
export function GroupFields({
  value,
  onChange,
  withDescription,
  autoFocus,
}: {
  value: GroupInput;
  onChange: (v: GroupInput) => void;
  withDescription?: boolean;
  autoFocus?: boolean;
}) {
  const [custom, setCustom] = useState<string[]>([]);
  const set = <K extends keyof GroupInput>(key: K, v: GroupInput[K]) => onChange({ ...value, [key]: v });

  // Categorías que el usuario ya usó, además de las sugeridas.
  useEffect(() => {
    api.groups
      .categories()
      .then((r) => setCustom(r.categories.map((c) => c.category).filter((c) => !CATEGORY_PRESETS.some((p) => p.name === c))))
      .catch(() => {});
  }, []);

  const categories = [...CATEGORY_PRESETS.map((c) => c.name), ...custom];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Nombre">
          <Input
            value={value.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="Ej. Actas 2024-2025"
            maxLength={160}
            aria-label="Nombre de la carpeta"
            autoFocus={autoFocus}
          />
        </Field>
        <Field label="Responsable (opcional)">
          <Input value={value.author} onChange={(e) => set('author', e.target.value)} placeholder="Ej. Secretaría" maxLength={160} aria-label="Responsable" />
        </Field>
      </div>

      <div>
        <div className="mb-2 text-sm font-bold text-eel">Categoría</div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Categoría">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={value.category === c}
              onClick={() => set('category', value.category === c ? '' : c)}
              className={clsx(
                'inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold transition-[transform,background-color,color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98] motion-reduce:transition-none',
                value.category === c ? 'bg-eel text-white' : 'bg-polar text-wolf hover:text-eel',
              )}
            >
              <span aria-hidden>{categoryEmoji(c)}</span>
              {c}
            </button>
          ))}
        </div>
        <Input
          className="mt-2"
          value={categories.includes(value.category) ? '' : value.category}
          onChange={(e) => set('category', e.target.value)}
          placeholder="…u otra categoría"
          maxLength={60}
          aria-label="Otra categoría"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[200px_1fr] md:items-end">
        <Field label="Hojas esperadas (opcional)" hint="Para ver cuántas faltan por escanear.">
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={20000}
            value={value.totalPages ?? ''}
            onChange={(e) => set('totalPages', e.target.value ? Math.max(1, Math.min(20000, Number(e.target.value))) : null)}
            placeholder="Ej. 40"
            aria-label="Hojas esperadas"
          />
        </Field>
        <div>
          <div className="mb-2 text-sm font-bold text-eel">Color</div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Color">
            {GROUP_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                aria-pressed={value.color === c}
                onClick={() => set('color', c)}
                className={clsx(
                  'size-10 rounded-xl shadow-[inset_0_0_0_1px_rgba(24,25,29,0.08)] transition-transform duration-200 active:scale-95 motion-reduce:transition-none',
                  GROUP_STYLES[c].bg,
                  value.color === c && 'ring-3 ring-macaw/45 ring-offset-2',
                )}
              />
            ))}
          </div>
        </div>
      </div>

      {withDescription && (
        <Field label="Descripción (opcional)">
          <Textarea value={value.description} onChange={(e) => set('description', e.target.value)} rows={3} maxLength={2000} aria-label="Descripción" />
        </Field>
      )}
    </div>
  );
}

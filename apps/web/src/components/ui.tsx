import clsx from 'clsx';
import { LoaderCircle, X } from 'lucide-react';
import { forwardRef, useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'warning' | 'plain';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-eel text-white hover:bg-eel-hover',
  secondary: 'bg-macaw text-eel hover:bg-macaw-hover',
  danger: 'bg-cardinal text-white hover:bg-cardinal-dark',
  warning: 'bg-bee text-eel hover:bg-bee-hover',
  ghost: 'bg-white text-eel shadow-[inset_0_0_0_1px_#dde0e4] hover:bg-polar',
  plain: 'bg-transparent text-wolf hover:bg-white hover:text-eel',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, block, className, children, disabled, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex select-none items-center justify-center gap-2 rounded-full border-0 font-bold transition-[transform,background-color,color,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
        'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-macaw/35',
        size === 'sm' && 'h-9 px-4 text-sm',
        size === 'md' && 'h-11 px-5 text-sm',
        size === 'lg' && 'h-13 px-6 text-base',
        block && 'w-full',
        VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {loading ? <LoaderCircle className="size-5 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx(
        'inline-flex size-10 items-center justify-center rounded-full text-wolf transition-[transform,background-color,color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-polar hover:text-eel active:scale-95 disabled:opacity-40',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Card({ className, children, interactive }: { className?: string; children: ReactNode; interactive?: boolean }) {
  return (
    <div
      className={clsx(
        'rounded-2xl bg-white shadow-[0_1px_2px_rgba(41,36,68,0.06)]',
        interactive && 'transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(41,36,68,0.10)] active:translate-y-0',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-bold text-eel">{label}</span>
      {children}
      {error ? <span className="block text-sm font-semibold text-cardinal-dark">{error}</span> : hint && <span className="block text-sm text-wolf">{hint}</span>}
    </label>
  );
}

const inputClass =
  'w-full rounded-xl border border-transparent bg-polar px-4 py-3 text-base font-medium text-eel placeholder:text-wolf outline-none transition-[background-color,box-shadow] duration-200 focus:bg-white focus:shadow-[0_0_0_3px_rgba(163,142,249,0.35)]';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={clsx(inputClass, className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref,
) {
  return <textarea ref={ref} className={clsx(inputClass, 'leading-relaxed', className)} {...props} />;
});

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={clsx(inputClass, 'appearance-none bg-[length:1.25rem] pr-10', className)} {...props}>
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative h-8 w-14 shrink-0 rounded-full border-0 transition-colors duration-200',
        checked ? 'bg-eel' : 'bg-swan',
      )}
    >
      <span
        className={clsx(
          'absolute left-1 top-1 size-6 rounded-full bg-white shadow-sm transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
          checked && 'translate-x-6',
        )}
      />
    </button>
  );
}

/** Selector de opciones en forma de "pastillas" grandes, fácil de tocar en móvil. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; icon?: ReactNode }[];
}) {
  return (
    <div className="grid gap-1 rounded-2xl bg-polar p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={clsx(
            'flex items-center justify-center gap-2 rounded-xl border-0 px-3 py-2.5 text-sm font-bold transition-[transform,background-color,color,box-shadow] duration-200 active:scale-[0.98]',
            value === o.value ? 'bg-white text-eel shadow-sm' : 'bg-transparent text-wolf hover:text-eel',
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Badge({ children, tone = 'gray', className }: { children: ReactNode; tone?: 'gray' | 'green' | 'blue' | 'red' | 'yellow' | 'purple'; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
        tone === 'gray' && 'bg-polar text-wolf',
        tone === 'green' && 'bg-feather-light text-feather-dark',
        tone === 'blue' && 'bg-macaw-light text-macaw-dark',
        tone === 'red' && 'bg-cardinal-light text-cardinal-dark',
        tone === 'yellow' && 'bg-bee-light text-bee-dark',
        tone === 'purple' && 'bg-beetle-light text-beetle-dark',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={clsx('h-2.5 w-full overflow-hidden rounded-full bg-swan', className)}>
      <div
        className="h-full origin-left rounded-full bg-feather transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ transform: `scaleX(${Math.max(0, Math.min(100, value)) / 100})` }}
      />
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={clsx('animate-spin text-eel', className ?? 'size-8')} />;
}

export function PageLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner />
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-macaw-light text-macaw-dark">{icon}</div>
      <h3 className="text-xl font-bold text-eel">{title}</h3>
      {children && <p className="mt-2 max-w-sm text-wolf">{children}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-3xl font-bold leading-tight text-eel sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-wolf">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-eel/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={clsx('pb-safe max-h-[90vh] w-full overflow-y-auto rounded-t-[24px] bg-white p-6 shadow-[0_12px_32px_rgba(30,27,48,0.16)] sm:rounded-[24px]', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold">{title}</h2>
          <IconButton label="Cerrar" onClick={onClose}>
            <X className="size-5" />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}

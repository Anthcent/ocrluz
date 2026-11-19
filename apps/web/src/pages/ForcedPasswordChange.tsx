import { KeyRound, LogOut } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { errorMessage } from '../components/feedback';
import { SchoolBrand } from '../components/SchoolBrand';
import { Button, Field, Input } from '../components/ui';

/**
 * Shown instead of the whole app while the account has a temporary password set by an admin.
 * Outside the normal Layout: the server rejects every other call until the password is changed.
 */
export function ForcedPasswordChangePage() {
  const { user, changePassword, logout } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (next !== repeat) return setError('Las contraseñas nuevas no coinciden');
    if (next === current) return setError('La nueva contraseña debe ser distinta de la temporal');
    setSaving(true);
    try {
      await changePassword(current, next);
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-polar px-4 py-10 sm:px-8">
      <div className="w-full max-w-md rounded-[24px] bg-white p-6 shadow-[0_1px_2px_rgba(41,36,68,0.06)] sm:p-8">
        <SchoolBrand size="sm" className="mb-6 border-b border-swan pb-5" />
        <span aria-hidden="true" className="mb-6 flex size-12 items-center justify-center rounded-2xl bg-bee-light text-bee-dark">
          <KeyRound className="size-6" />
        </span>
        <h1 className="text-3xl font-bold leading-tight text-eel">Cambiar contraseña</h1>
        <p className="mt-2 text-wolf">
          Un administrador restableció la contraseña de <strong className="text-eel">{user?.email}</strong>. Para continuar, elige una contraseña nueva.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <Field label="Contraseña temporal">
            <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
          </Field>
          <Field label="Nueva contraseña" hint="Mínimo 8 caracteres.">
            <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={8} required />
          </Field>
          <Field label="Repite la nueva contraseña">
            <Input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" minLength={8} required />
          </Field>

          {error && (
            <p role="alert" className="rounded-xl bg-cardinal-light px-4 py-3 text-sm font-bold text-cardinal-dark">
              {error}
            </p>
          )}

          <Button type="submit" block size="lg" loading={saving}>
            Guardar y continuar
          </Button>
        </form>

        <p className="mt-6 border-t border-swan pt-4 text-center">
          <Button variant="plain" icon={<LogOut className="size-4" />} onClick={logout}>
            Cerrar sesión
          </Button>
        </p>
      </div>
    </main>
  );
}

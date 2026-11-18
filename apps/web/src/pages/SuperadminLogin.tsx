import { ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { errorMessage } from '../components/feedback';
import { Button, Field, Input } from '../components/ui';

const PIN_LENGTH = 12;

/** Uppercase letters and digits only, capped at the PIN length. */
const normalizePin = (value: string) =>
  value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, PIN_LENGTH);

/** Superadmin sign-in: username + password + 12-character PIN. Public route, outside the app layout. */
export function SuperadminLoginPage() {
  const { superadminLogin } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // Once the session exists, the app routes /superadmin to the admin panel (see App.tsx).
      await superadminLogin(username.trim(), password, pin);
    } catch (err) {
      setError(errorMessage(err));
      setPin('');
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-polar px-4 py-10 sm:px-8">
      <div className="w-full max-w-md rounded-[24px] bg-white p-6 shadow-[0_1px_2px_rgba(41,36,68,0.06)] sm:p-8">
        <div className="mb-8">
          <span aria-hidden="true" className="mb-5 flex size-11 items-center justify-center rounded-xl bg-eel text-white">
            <ShieldCheck className="size-5" />
          </span>
          <h1 className="text-3xl font-bold leading-tight text-eel">Acceso de superadministrador</h1>
          <p className="mt-2 max-w-sm text-wolf">Introduce tu usuario, tu contraseña y el PIN de 12 caracteres.</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <Field label="Usuario">
            <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} required />
          </Field>
          <Field label="Contraseña">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </Field>
          <Field label="PIN" hint={`${pin.length} de ${PIN_LENGTH} caracteres. Letras y números.`}>
            <Input
              value={pin}
              onChange={(e) => setPin(normalizePin(e.target.value))}
              maxLength={PIN_LENGTH}
              minLength={PIN_LENGTH}
              pattern="[A-Z0-9]{12}"
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              required
              className="font-mono uppercase tracking-[0.2em]"
            />
          </Field>

          {error && (
            <p role="alert" className="rounded-xl bg-cardinal-light px-4 py-3 text-sm font-bold text-cardinal-dark">
              {error}
            </p>
          )}

          <Button type="submit" block size="lg" loading={loading} disabled={pin.length !== PIN_LENGTH}>
            Entrar
          </Button>
        </form>

        <p className="mt-6 text-center">
          <Link to="/login" className="text-sm font-bold text-macaw-dark transition-colors hover:text-eel">
            Volver al inicio de sesión
          </Link>
        </p>
      </div>
    </main>
  );
}

import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { errorMessage } from '../components/feedback';
import { Button, Field, Input } from '../components/ui';

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const isLogin = mode === 'login';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isLogin) await login(email, password);
      else await register(name, email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-dvh bg-polar lg:grid-cols-[minmax(20rem,0.85fr)_minmax(28rem,1.15fr)]">
      <section className="hidden flex-col justify-between bg-eel p-10 text-white lg:flex xl:p-14">
        <Link to="/" className="text-2xl font-bold tracking-[-0.025em]">Ocryon</Link>
        <div className="max-w-md">
          <div className="mb-6 flex gap-2" aria-hidden="true">
            <span className="h-2 w-14 rounded-full bg-macaw" />
            <span className="h-2 w-9 rounded-full bg-feather" />
            <span className="h-2 w-6 rounded-full bg-bee" />
          </div>
          <p className="text-3xl font-bold leading-tight tracking-[-0.025em]">Tus páginas, ordenadas y listas para encontrar.</p>
          <p className="mt-4 max-w-sm text-base leading-relaxed text-white/65">Un espacio tranquilo para convertir documentos fotografiados en texto útil.</p>
        </div>
        <p className="text-sm text-white/45">Captura. Organiza. Lee.</p>
      </section>

      <main className="flex items-center justify-center px-4 py-10 sm:px-8 lg:py-16">
        <div className="w-full max-w-md rounded-[24px] bg-white p-6 shadow-[0_1px_2px_rgba(41,36,68,0.06)] sm:p-8">
          <Link to="/" className="mb-10 inline-flex items-center gap-2 text-lg font-bold text-eel lg:hidden">
            <span className="size-3 rounded-full bg-macaw" /> Ocryon
          </Link>
          <div className="mb-8">
            <h1 className="text-3xl font-bold leading-tight text-eel">{isLogin ? '¡Hola de nuevo!' : 'Crea tu cuenta'}</h1>
            <p className="mt-2 max-w-sm text-wolf">
              {isLogin ? 'Sigue convirtiendo tus libros en texto.' : 'Escanea libros con tu cámara en segundos.'}
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {!isLogin && (
              <Field label="Nombre">
                <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={2} placeholder="Tu nombre" />
              </Field>
            )}
            <Field label="Correo electrónico">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required placeholder="tucorreo@ejemplo.com" />
            </Field>
            <Field label="Contraseña" hint={!isLogin ? 'Mínimo 8 caracteres.' : undefined}>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                required
                minLength={isLogin ? 1 : 8}
                placeholder="••••••••"
              />
            </Field>

            {error && <p className="rounded-xl bg-cardinal-light px-4 py-3 text-sm font-bold text-cardinal-dark">{error}</p>}

            <Button type="submit" block size="lg" loading={loading}>
              {isLogin ? 'Entrar' : 'Crear cuenta'}
            </Button>
          </form>

          <p className="mt-6 text-center text-wolf">
            {isLogin ? '¿No tienes cuenta? ' : '¿Ya tienes cuenta? '}
            <Link to={isLogin ? '/registro' : '/login'} className="font-bold text-macaw-dark transition-colors hover:text-eel">
              {isLogin ? 'Regístrate' : 'Inicia sesión'}
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { FeedbackProvider } from './components/feedback';
import { Layout } from './components/Layout';
import { PageLoader } from './components/ui';
import { AuthPage } from './pages/Auth';
import { CatalogPage } from './pages/Catalog';
import { DocumentDetailPage } from './pages/DocumentDetail';
import { DocumentNewPage } from './pages/DocumentNew';
import { DocumentsPage } from './pages/Documents';
import { GroupDetailPage } from './pages/GroupDetail';
import { HomePage } from './pages/Home';
import { ScanDetailPage } from './pages/ScanDetail';
import { ScannerPage } from './pages/Scanner';
import { SearchPage } from './pages/Search';
import { SettingsPage } from './pages/Settings';
import { ScanSessionProvider } from './scan/ScanSession';
import { SettingsProvider, useSettings } from './settings/SettingsContext';

function SessionWithDefaults({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const { user } = useAuth();
  return (
    <ScanSessionProvider userId={user!.id} defaults={{ engine: settings.defaultEngine, language: settings.ocrLanguage, autoScan: settings.autoScan }}>
      {children}
    </ScanSessionProvider>
  );
}

/** Redirige las rutas antiguas del catálogo («/catalogo…») a «/archivo…», conservando el id y la consulta. */
function LegacyArchiveRedirect() {
  const { id } = useParams();
  const { search } = useLocation();
  const query = new URLSearchParams(search);
  // El antiguo «?libro=1» abría el visor.
  if (query.get('libro')) {
    query.delete('libro');
    query.set('visor', '1');
  }
  const qs = query.toString();
  return <Navigate to={`${id ? `/archivo/carpeta/${id}` : '/archivo'}${qs ? `?${qs}` : ''}`} replace />;
}

function PrivateApp() {
  return (
    <SettingsProvider>
      <SessionWithDefaults>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="escanear" element={<ScannerPage />} />
            <Route path="archivo" element={<CatalogPage />} />
            <Route path="archivo/carpeta/:id" element={<GroupDetailPage />} />
            <Route path="catalogo" element={<LegacyArchiveRedirect />} />
            <Route path="catalogo/grupo/:id" element={<LegacyArchiveRedirect />} />
            <Route path="escaneo/:id" element={<ScanDetailPage />} />
            <Route path="documentos" element={<DocumentsPage />} />
            <Route path="documentos/nuevo" element={<DocumentNewPage />} />
            <Route path="documentos/:id" element={<DocumentDetailPage />} />
            <Route path="buscar" element={<SearchPage />} />
            <Route path="ajustes" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </SessionWithDefaults>
    </SettingsProvider>
  );
}

function Root() {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/registro" element={<AuthPage mode="register" />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/registro" element={<Navigate to="/" replace />} />
      <Route path="/*" element={<PrivateApp />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <FeedbackProvider>
        <AuthProvider>
          <Root />
        </AuthProvider>
      </FeedbackProvider>
    </BrowserRouter>
  );
}

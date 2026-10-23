// Defines the route table and global application providers.
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import AppLayout from './components/layout/AppLayout.jsx';
import ProtectedRoute from './components/layout/ProtectedRoute.jsx';
import PublicOnlyRoute from './components/layout/PublicOnlyRoute.jsx';
import ToastContainer from './components/ui/ToastContainer.jsx';
import LandingPage from './pages/LandingPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import SkillsPage from './pages/SkillsPage.jsx';
import DiscoverPage from './pages/DiscoverPage.jsx';
import DeveloperProfilePage from './pages/DeveloperProfilePage.jsx';
import MatchesPage from './pages/MatchesPage.jsx';
import RequestsPage from './pages/RequestsPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

const pages = [
  { path: '/', title: 'Skills Exchange Network', element: <LandingPage /> },
  { path: '/register', title: 'Create account', element: <RegisterPage /> },
  { path: '/login', title: 'Log in', element: <LoginPage /> },
  { path: '/dashboard', title: 'Dashboard', element: <DashboardPage /> },
  { path: '/profile', title: 'My Profile', element: <ProfilePage /> },
  { path: '/skills', title: 'Manage Skills', element: <SkillsPage /> },
  { path: '/developers', title: 'Discover Developers', element: <DiscoverPage /> },
  { path: '/developers/:id', title: 'Developer Profile', element: <DeveloperProfilePage /> },
  { path: '/matches', title: 'Recommended Developers', element: <MatchesPage /> },
  { path: '/requests', title: 'Collaboration Requests', element: <RequestsPage /> }
];

function RoutePage({ path, element }) {
  const page = element;
  const access = path === '/register' || path === '/login'
    ? <PublicOnlyRoute>{page}</PublicOnlyRoute>
    : path !== '/' && path !== '*'
      ? <ProtectedRoute>{page}</ProtectedRoute>
      : page;
  return <AppLayout>{access}</AppLayout>;
}

/** Mounts providers and the route table inside the browser router. */
export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            {pages.map(({ path, element }) => (
              <Route key={path} path={path} element={<RoutePage path={path} element={element} />} />
            ))}
            <Route path="*" element={<AppLayout><NotFoundPage /></AppLayout>} />
          </Routes>
          <ToastContainer />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

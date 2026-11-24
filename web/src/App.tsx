import { Navigate, Route, Routes } from 'react-router';
import { CentersView } from './backoffice/views/CentersView';
import { LoginView } from './backoffice/views/LoginView';
import { PublicCenterView, PublicHome } from './public/PublicCenterView';

export function App() {
  return (
    <Routes>
      <Route path="/staff/login" element={<LoginView />} />
      <Route path="/staff/centers" element={<CentersView />} />
      {/* COM-9 will replace this placeholder with a session-aware guard. */}
      <Route path="/staff/*" element={<Navigate to="/staff/login" replace />} />
      <Route path="/:slug" element={<PublicCenterView />} />
      <Route path="*" element={<PublicHome />} />
    </Routes>
  );
}

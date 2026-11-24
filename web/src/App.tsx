import { Route, Routes } from 'react-router';
import { Staff } from './Staff';
import { PublicCenterView, PublicHome } from './public/PublicCenterView';

export function App() {
  return <Routes>
    <Route path="/staff/*" element={<Staff />} />
    <Route path="/:slug" element={<PublicCenterView />} />
    <Route path="*" element={<PublicHome />} />
  </Routes>;
}

import { Route, Routes } from 'react-router';
import { Staff } from './Staff';
import { PublicCenterView, PublicNotFound } from './public/PublicCenterView';
import { PublicHome } from './public/PublicHome';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicHome />} />
      <Route path="/staff/*" element={<Staff />} />
      <Route path="/:slug" element={<PublicCenterView />} />
      <Route path="*" element={<PublicNotFound />} />
    </Routes>
  );
}

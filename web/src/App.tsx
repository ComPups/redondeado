import { Route, Routes } from 'react-router';
import { lazy, Suspense } from 'react';
import { BrandLoader } from './shared/components/BrandLoader';
import { PublicCenterView, PublicNotFound } from './public/PublicCenterView';
import { PublicHome } from './public/PublicHome';

const Staff = lazy(() => import('./Staff').then(module => ({ default: module.Staff })));

export function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicHome />} />
      <Route path="/staff/*" element={<Suspense fallback={<BrandLoader />}><Staff /></Suspense>} />
      <Route path="/:slug" element={<PublicCenterView />} />
      <Route path="*" element={<PublicNotFound />} />
    </Routes>
  );
}

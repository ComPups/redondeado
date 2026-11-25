import './loading.css';

export function SkeletonLine({ wide = false }: { wide?: boolean }) {
  return <span aria-hidden="true" className={`skeleton-block skeleton-line${wide ? ' skeleton-wide' : ''}`} />;
}

export function LoadingSkeleton({ label, variant = 'list', rows = 3 }: {
  label: string; variant?: 'list' | 'cards' | 'calendar'; rows?: number;
}) {
  return <div className={`loading-skeleton loading-skeleton-${variant}`} role="status" aria-busy="true">
    <span className="loading-skeleton-label">{label}</span>
    <div aria-hidden="true" className="loading-skeleton-items">
      {Array.from({ length: variant === 'calendar' ? 35 : rows }, (_, index) =>
        <div key={index} className="loading-skeleton-item"><SkeletonLine wide />{variant !== 'calendar' && <><SkeletonLine /><SkeletonLine /></>}</div>)}
    </div>
  </div>;
}

export function CenterPageSkeleton() {
  return <main aria-busy="true">
    <div className="public-container center-hero" aria-hidden="true">
      <div className="center-hero-copy skeleton-hero-copy"><SkeletonLine wide /><SkeletonLine wide /><SkeletonLine /><span className="skeleton-block skeleton-button" /></div>
      <div className="center-hero-image skeleton-block skeleton-image" />
    </div>
    <section className="center-scheduling"><div className="public-container">
      <div aria-hidden="true" className="skeleton-catalog-controls"><SkeletonLine /><span className="skeleton-block skeleton-tabs" /><span className="skeleton-block skeleton-search" /></div>
      <LoadingSkeleton label="Cargando centro…" variant="cards" />
    </div></section>
  </main>;
}

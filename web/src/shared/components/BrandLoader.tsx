import { Brand } from "./Brand";
import "./brand-loader.css";

export function BrandLoader({
  label = "Preparando tu espacio de trabajo…",
}: {
  label?: string;
}) {
  return (
    <main
      className="brand-loader"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="brand-loader-content">
        <Brand />
        <span className="brand-loader-spinner" aria-hidden="true" />
        <p>{label}</p>
      </div>
    </main>
  );
}

export function ServiceActionButtons({ name, onEdit, onDelete, disabled = false }: { name: string; onEdit: () => void; onDelete: () => void; disabled?: boolean }) {
  return <div className="service-actions">
    <button type="button" className="service-icon" aria-label={`Editar ${name}`} disabled={disabled} onClick={onEdit}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 5H5v14h14v-8M12 15l1-4 6-6 3 3-6 6-4 1Z" /></svg></button>
    <button type="button" className="service-icon service-delete" aria-label={`Eliminar ${name}`} disabled={disabled} onClick={onDelete}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 10v7m4-7v7" /></svg></button>
  </div>;
}

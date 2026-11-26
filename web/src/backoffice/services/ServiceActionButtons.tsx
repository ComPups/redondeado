import { EditButton } from "../components/EditButton";

export function ServiceActionButtons({
  name,
  onEdit,
  onDelete,
  disabled = false,
}: {
  name: string;
  onEdit: () => void;
  onDelete: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="service-actions">
      <EditButton name={name} disabled={disabled} onClick={onEdit} />
      <button
        type="button"
        className="service-icon service-delete"
        aria-label={`Eliminar ${name}`}
        disabled={disabled}
        onClick={onDelete}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 10v7m4-7v7" />
        </svg>
      </button>
    </div>
  );
}

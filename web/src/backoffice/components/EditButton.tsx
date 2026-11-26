export function EditButton({
  name,
  onClick,
  disabled = false,
}: {
  name: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="service-icon"
      aria-label={`Editar ${name}`}
      disabled={disabled}
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M13 5H5v14h14v-8M12 15l1-4 6-6 3 3-6 6-4 1Z" />
      </svg>
    </button>
  );
}

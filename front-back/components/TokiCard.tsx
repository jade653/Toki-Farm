export default function TokiCard({
  title,
  subtitle,
  selected = false,
  onClick,
}: {
  title: string;
  subtitle?: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex aspect-square w-full flex-col items-center justify-center rounded-2xl border text-center shadow-sm transition
        ${
          selected
            ? "border-emerald-600 ring-4 ring-emerald-200"
            : "border-amber-200 hover:border-amber-300"
        }
      `}
    >
      {/* Image placeholder */}
      <div
        className={`mb-3 h-20 w-20 rounded-lg transition
          ${
            selected
              ? "bg-emerald-500"
              : "bg-amber-400/80 group-hover:bg-amber-400"
          }
        `}
      />
      <div className="text-sm font-semibold text-emerald-900">{title}</div>
      {subtitle && <div className="text-xs text-gray-600">{subtitle}</div>}
    </button>
  );
}

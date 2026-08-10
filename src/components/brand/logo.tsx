import { cn } from "@/lib/utils";

// SVG recreation of the BIGVIEW mark: three ascending mountain ribbons
// (red, orange, amber). Swap for the official asset by dropping it into
// /public and updating this component if pixel-perfect branding is needed.
export function BigviewMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 300 110"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <polygon
        fill="#F9A51A"
        points="163,105 230,12 297,105 269,105 230,51 191,105"
      />
      <polygon
        fill="#EF7622"
        points="85,105 150,25 215,105 187,105 150,60 113,105"
      />
      <polygon
        fill="#C62A32"
        points="20,105 70,50 120,105 92,105 70,81 48,105"
      />
    </svg>
  );
}

export function BigviewLogo({
  className,
  markClassName,
  textClassName,
}: {
  className?: string;
  markClassName?: string;
  textClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-end gap-1.5", className)}>
      <BigviewMark className={cn("h-6 w-auto shrink-0", markClassName)} />
      <span
        className={cn(
          "leading-none tracking-tight text-[#6D6E71]",
          textClassName
        )}
      >
        <span className="font-black">BIG</span>
        <span className="font-light">VIEW</span>
      </span>
    </span>
  );
}

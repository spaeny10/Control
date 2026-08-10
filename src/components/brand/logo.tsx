import { cn } from "@/lib/utils";

/* SVG recreation of the official BIGVIEW lockup: three ascending mountain
   ribbons (red, orange, amber) sitting above the "VIEW" half of the
   wordmark; "BIG" extra-bold, "VIEW" light, both in brand gray.
   Drop the official vector into /public and swap here if pixel-perfect
   branding is ever needed. */

export function BigviewMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 300 100"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* amber — rightmost, longest run */}
      <polygon
        fill="#FCB316"
        points="140,100 208,10 300,100 262,100 208,48 172,100"
      />
      {/* orange — center */}
      <polygon
        fill="#F07322"
        points="62,100 130,20 216,100 180,100 130,56 96,100"
      />
      {/* red — front left, smallest */}
      <polygon
        fill="#C4272F"
        points="8,100 58,40 118,100 88,100 58,70 36,100"
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
    // Text size classes go on the container so the mark's em-height scales
    // with the wordmark automatically.
    <span
      className={cn(
        "inline-flex flex-col items-stretch leading-none tracking-tight text-[#55565A]",
        textClassName,
        className
      )}
    >
      {/* Mountains ride above the VIEW half, right-aligned like the lockup */}
      <span className="flex justify-end pr-[0.04em]">
        <BigviewMark className={cn("h-[0.62em] w-auto", markClassName)} />
      </span>
      <span className="-mt-[0.06em]">
        <span className="font-extrabold">BIG</span>
        <span className="font-light">VIEW</span>
      </span>
    </span>
  );
}

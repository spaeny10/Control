"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

// Minimal pointer-events signature canvas. Exposes the drawing as a PNG data
// URL through onChange (empty string when cleared).
export function SignaturePad({
  onChange,
}: {
  onChange: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Match the backing store to the displayed size for crisp strokes.
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(2, 2);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111";
  }, []);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        className="h-32 w-full cursor-crosshair touch-none rounded-md border bg-white"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          const ctx = e.currentTarget.getContext("2d")!;
          const { x, y } = pos(e);
          ctx.beginPath();
          ctx.moveTo(x, y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = e.currentTarget.getContext("2d")!;
          const { x, y } = pos(e);
          ctx.lineTo(x, y);
          ctx.stroke();
        }}
        onPointerUp={(e) => {
          drawing.current = false;
          setHasInk(true);
          onChange(e.currentTarget.toDataURL("image/png"));
        }}
      />
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Sign above (finger or mouse)
        </p>
        {hasInk && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              const canvas = canvasRef.current!;
              const ctx = canvas.getContext("2d")!;
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              setHasInk(false);
              onChange("");
            }}
          >
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}

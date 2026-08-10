/* Thumbnails + signature summary for a deployment's condition docs.
   Server component — receives only ids/metadata, never photo bytes. */
import { formatDateTime } from "@/lib/format";

export type DocsPhoto = { id: string; phase: string; createdAt: Date };
export type DocsSignature = {
  id: string;
  phase: string;
  signedBy: string;
  createdAt: Date;
};

export function DeploymentDocsList({
  photos,
  signatures,
}: {
  photos: DocsPhoto[];
  signatures: DocsSignature[];
}) {
  if (photos.length === 0 && signatures.length === 0) return null;

  return (
    <div className="mt-2 space-y-2">
      {(["DELIVERY", "RETURN"] as const).map((phase) => {
        const phasePhotos = photos.filter((p) => p.phase === phase);
        const phaseSigs = signatures.filter((s) => s.phase === phase);
        if (phasePhotos.length === 0 && phaseSigs.length === 0) return null;
        return (
          <div key={phase}>
            <p className="text-xs font-medium text-muted-foreground">
              {phase === "DELIVERY" ? "Delivery" : "Return"} docs
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {phasePhotos.map((p) => (
                <a
                  key={p.id}
                  href={`/api/photos/${p.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={formatDateTime(p.createdAt)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/photos/${p.id}`}
                    alt={`Condition photo, ${phase.toLowerCase()}`}
                    className="h-14 w-14 rounded-md border object-cover"
                    loading="lazy"
                  />
                </a>
              ))}
              {phaseSigs.map((s) => (
                <a
                  key={s.id}
                  href={`/api/signatures/${s.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-14 items-center rounded-md border bg-white px-2"
                  title={`Signed by ${s.signedBy}, ${formatDateTime(s.createdAt)}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/signatures/${s.id}`}
                    alt={`Signature by ${s.signedBy}`}
                    className="h-10 w-auto"
                    loading="lazy"
                  />
                </a>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

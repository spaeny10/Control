"use client";

import { useState, useTransition } from "react";
import { saveDeploymentDocs } from "@/lib/actions/deployment-docs-actions";
import { SignaturePad } from "@/components/fleet/signature-pad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Camera } from "lucide-react";

// Downscale an image file to <=1600px JPEG so DB rows stay small and mobile
// uploads stay fast.
async function resizeImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const maxDim = 1600;
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.82)
  );
}

export function DeploymentDocsDialog({
  deploymentId,
  unitNumber,
  defaultPhase,
}: {
  deploymentId: string;
  unitNumber: string;
  defaultPhase: "DELIVERY" | "RETURN";
}) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"DELIVERY" | "RETURN">(defaultPhase);
  const [files, setFiles] = useState<File[]>([]);
  const [signature, setSignature] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      const payload = new FormData();
      payload.set("signedBy", String(formData.get("signedBy") ?? ""));
      payload.set("signature", signature);
      for (const file of files) {
        const resized = await resizeImage(file);
        payload.append(
          "photos",
          new File([resized], file.name.replace(/\.\w+$/, ".jpg"), {
            type: "image/jpeg",
          })
        );
      }
      const result = await saveDeploymentDocs(deploymentId, phase, payload);
      if (result.ok) {
        toast.success("Documentation saved");
        setOpen(false);
        setFiles([]);
        setSignature("");
      } else {
        toast.error(result.error ?? "Failed to save documentation");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1">
          <Camera className="h-3.5 w-3.5" /> Docs
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Condition documentation — {unitNumber}</DialogTitle>
          <DialogDescription>
            Photos and a signature protect you in damage disputes.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Phase</Label>
            <Select
              value={phase}
              onValueChange={(v) => setPhase(v as typeof phase)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DELIVERY">Delivery / drop-off</SelectItem>
                <SelectItem value="RETURN">Return / pickup</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="photos">Condition photos</Label>
            <Input
              id="photos"
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              onChange={(e) => setFiles([...(e.target.files ?? [])])}
            />
            {files.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {files.length} photo{files.length === 1 ? "" : "s"} selected —
                resized before upload
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Customer signature (optional)</Label>
            <SignaturePad onChange={setSignature} />
          </div>
          {signature && (
            <div className="space-y-2">
              <Label htmlFor="signedBy">Signed by *</Label>
              <Input
                id="signedBy"
                name="signedBy"
                placeholder="Customer name"
                required
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || (files.length === 0 && !signature)}
            >
              {isPending ? "Saving..." : "Save documentation"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

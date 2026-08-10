"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "./company-actions";
import type { DeploymentPhase } from "@prisma/client";

const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const MAX_PHOTOS = 8;

export async function saveDeploymentDocs(
  deploymentId: string,
  phase: DeploymentPhase,
  formData: FormData
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const deployment = await prisma.trailerDeployment.findUnique({
    where: { id: deploymentId },
    include: { trailer: { select: { unitNumber: true } } },
  });
  if (!deployment) return { ok: false, error: "Deployment not found" };

  const signedBy = String(formData.get("signedBy") ?? "").trim();
  const signatureDataUrl = String(formData.get("signature") ?? "");
  const photos = formData
    .getAll("photos")
    .filter((f): f is File => f instanceof File && f.size > 0);

  if (photos.length === 0 && !signatureDataUrl) {
    return { ok: false, error: "Add at least one photo or a signature" };
  }
  if (photos.length > MAX_PHOTOS) {
    return { ok: false, error: `Max ${MAX_PHOTOS} photos at a time` };
  }
  if (signatureDataUrl && !signedBy) {
    return { ok: false, error: "Name is required with a signature" };
  }

  for (const photo of photos) {
    if (photo.size > MAX_PHOTO_BYTES) {
      return { ok: false, error: `${photo.name} is over 4MB` };
    }
    if (!photo.type.startsWith("image/")) {
      return { ok: false, error: `${photo.name} is not an image` };
    }
  }

  // Store photos
  for (const photo of photos) {
    const buffer = Buffer.from(await photo.arrayBuffer());
    await prisma.deploymentPhoto.create({
      data: {
        deploymentId,
        phase,
        data: buffer,
        mimeType: photo.type || "image/jpeg",
      },
    });
  }

  // Store signature (canvas PNG data URL)
  if (signatureDataUrl.startsWith("data:image/png;base64,")) {
    const buffer = Buffer.from(
      signatureDataUrl.replace("data:image/png;base64,", ""),
      "base64"
    );
    if (buffer.length > MAX_PHOTO_BYTES) {
      return { ok: false, error: "Signature image too large" };
    }
    await prisma.deploymentSignature.create({
      data: { deploymentId, phase, data: buffer, signedBy },
    });
    await prisma.trailerDeployment.update({
      where: { id: deploymentId },
      data:
        phase === "DELIVERY"
          ? { deliverySignedBy: signedBy, deliverySignedAt: new Date() }
          : { returnSignedBy: signedBy, returnSignedAt: new Date() },
    });
  }

  await prisma.message.create({
    data: {
      channel: "SYSTEM",
      body: `${phase === "DELIVERY" ? "Delivery" : "Return"} documentation added for ${
        deployment.trailer.unitNumber
      }: ${photos.length} photo${photos.length === 1 ? "" : "s"}${
        signatureDataUrl ? `, signed by ${signedBy}` : ""
      }`,
      authorId: session.user.id,
      subscriptionId: deployment.subscriptionId,
    },
  });

  revalidatePath(`/subscriptions/${deployment.subscriptionId}`);
  revalidatePath(`/fleet/${deployment.trailerId}`);
  return { ok: true };
}

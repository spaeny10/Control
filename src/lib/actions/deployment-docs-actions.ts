"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "./company-actions";
import type { DeploymentPhase } from "@prisma/client";
import { uploadDeploymentFile } from "@/lib/google/drive";

const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const MAX_PHOTOS = 8;

/** Group Drive uploads by project (falling back to company) so ops can browse. */
async function driveFolderName(deploymentId: string): Promise<string> {
  const deployment = await prisma.trailerDeployment.findUnique({
    where: { id: deploymentId },
    select: {
      subscription: {
        select: {
          company: { select: { name: true } },
          project: { select: { name: true } },
        },
      },
    },
  });
  const project = deployment?.subscription?.project?.name;
  const company = deployment?.subscription?.company.name;
  return (project ?? company ?? "Unassigned").replace(/[\\/:*?"<>|]/g, "-");
}

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

  // Drive when it's configured, Postgres otherwise. If a Drive upload fails
  // we still keep the bytes locally — never lose a photo over an API error.
  const folderName = await driveFolderName(deploymentId);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const unit = deployment.trailer.unitNumber;

  // Store photos
  let index = 0;
  for (const photo of photos) {
    index++;
    const buffer = Buffer.from(await photo.arrayBuffer());
    const mimeType = photo.type || "image/jpeg";
    const driveFileId = await uploadDeploymentFile({
      folderName,
      fileName: `${unit}-${phase.toLowerCase()}-${stamp}-${index}.jpg`,
      mimeType,
      body: buffer,
    });
    await prisma.deploymentPhoto.create({
      data: {
        deploymentId,
        phase,
        driveFileId,
        data: driveFileId ? null : buffer,
        mimeType,
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
    const driveFileId = await uploadDeploymentFile({
      folderName,
      fileName: `${unit}-${phase.toLowerCase()}-${stamp}-signature.png`,
      mimeType: "image/png",
      body: buffer,
    });
    await prisma.deploymentSignature.create({
      data: {
        deploymentId,
        phase,
        driveFileId,
        data: driveFileId ? null : buffer,
        signedBy,
      },
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

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { downloadDriveFile } from "@/lib/google/drive";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const photo = await prisma.deploymentPhoto.findUnique({ where: { id } });
  if (!photo) notFound();

  // Dual-read: newer uploads live in Drive, older ones are bytes in Postgres.
  const bytes = photo.driveFileId
    ? await downloadDriveFile(photo.driveFileId)
    : photo.data
      ? Buffer.from(photo.data)
      : null;

  if (!bytes) {
    return new Response("Image unavailable", { status: 502 });
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": photo.mimeType,
      "Cache-Control": "private, max-age=86400",
    },
  });
}

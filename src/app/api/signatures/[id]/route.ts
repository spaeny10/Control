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
  const signature = await prisma.deploymentSignature.findUnique({
    where: { id },
  });
  if (!signature) notFound();

  // Dual-read: newer uploads live in Drive, older ones are bytes in Postgres.
  const bytes = signature.driveFileId
    ? await downloadDriveFile(signature.driveFileId)
    : signature.data
      ? Buffer.from(signature.data)
      : null;

  if (!bytes) {
    return new Response("Signature unavailable", { status: 502 });
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=86400",
    },
  });
}

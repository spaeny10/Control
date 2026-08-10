"use server";

import { createId } from "@paralleldrive/cuid2";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// Returns the company's portal URL, generating the token on first use.
export async function getPortalLink(
  companyId: string
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const company = await prisma.company.findUnique({
    where: { id: companyId },
  });
  if (!company) return { ok: false, error: "Company not found" };

  let token = company.portalToken;
  if (!token) {
    token = createId();
    await prisma.company.update({
      where: { id: companyId },
      data: { portalToken: token },
    });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return { ok: true, url: `${baseUrl}/portal/${token}` };
}

import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  // Protect everything except auth endpoints, provider webhooks, the public
  // quote page, and static assets.
  matcher: [
    "/((?!api/auth|api/webhooks|_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|jpg|jpeg|ico|webp)).*)",
  ],
};

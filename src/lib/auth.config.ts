import type { NextAuthConfig } from "next-auth";

// Edge-safe config (no Prisma) shared by middleware and the full auth setup.
export const authConfig = {
  session: { strategy: "jwt" },
  // error → /login so provider failures we don't control (OAuthCallbackError,
  // Configuration, …) land on our styled page rather than Auth.js's default.
  pages: { signIn: "/login", error: "/login" },
  // Providers live in auth.ts (Node) rather than here: this config is also
  // loaded by proxy.ts on every matched request, and it has no need for the
  // OAuth machinery or a Prisma client.
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isPublic =
        nextUrl.pathname.startsWith("/login") ||
        nextUrl.pathname.startsWith("/q/") ||
        nextUrl.pathname.startsWith("/portal/") ||
        // The offline fallback must render without a session, otherwise a
        // logged-out-while-offline user gets a redirect loop.
        nextUrl.pathname === "/offline";
      if (isPublic) return true;
      return isLoggedIn;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "ADMIN" | "MEMBER";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

import type { NextAuthConfig } from "next-auth";

// Edge-safe config (no Prisma) shared by middleware and the full auth setup.
export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
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

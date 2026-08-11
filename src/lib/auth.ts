import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";
import { emailVariants, isWorkspaceEmail, PRIMARY_DOMAIN } from "@/lib/google/identity";

/* Deliberately NO Auth.js adapter and no Account/Session tables.

   With an adapter, Auth.js would auto-create a User for anyone who completes
   the Google callback — exactly the orphan-account outcome the signIn() gate
   below exists to prevent. Instead we link by verified email to a
   pre-provisioned User row. */

const googleConfigured =
  !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET;

/** Exported so the login page can hide the Google button when unconfigured. */
export function isGoogleSsoEnabled() {
  return googleConfigured;
}

type GoogleClaims = {
  email?: string;
  email_verified?: boolean;
  hd?: string;
};

/** Find our own User row for a Workspace address (either domain). */
async function findWorkspaceUser(email: string) {
  return prisma.user.findFirst({
    where: { email: { in: emailVariants(email) } },
    select: { id: true, name: true, role: true, isActive: true, email: true },
  });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    ...(googleConfigured
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET,
            // `hd` is only an account-picker hint; the real check is the
            // signed hd claim verified in signIn() below.
            authorization: {
              params: { hd: PRIMARY_DOMAIN, prompt: "select_account" },
            },
          }),
        ]
      : []),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "")
          .toLowerCase()
          .trim();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.isActive) return null;
        // SSO-only accounts have no local password and must never pass here.
        if (!user.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    // MUST spread: declaring `callbacks` here replaces the whole object and
    // would silently drop authorized() and session() from this instance.
    ...authConfig.callbacks,

    async signIn({ account, profile, user }) {
      // Credentials were already validated in authorize().
      if (account?.provider !== "google") return true;

      const claims = profile as GoogleClaims | undefined;
      const email = (claims?.email ?? user.email ?? "").toLowerCase().trim();

      // Returning a string redirects with a usable message; returning false
      // would dump the user on Auth.js's unstyled error page instead.
      if (!email || claims?.email_verified !== true) {
        return "/login?error=GoogleUnverified";
      }
      // Trust the signed `hd` claim, not a string suffix on the address:
      // the local part of a foreign-domain address is attacker-controlled.
      if (claims.hd !== PRIMARY_DOMAIN || !isWorkspaceEmail(email)) {
        return "/login?error=GoogleWrongDomain";
      }

      const dbUser = await findWorkspaceUser(email);
      if (!dbUser) return "/login?error=GoogleNoAccount";
      if (!dbUser.isActive) return "/login?error=GoogleInactive";

      return true;
    },

    async jwt({ token, user, account, profile }) {
      if (account?.provider === "google") {
        // Auth.js replaces user.id with a random UUID for OAuth sign-ins when
        // there's no adapter, so the Prisma cuid must be resolved HERE.
        // session.user.id is used directly as a foreign key (Message.authorId,
        // Activity.assigneeId, Lead.ownerId, Subscription.salespersonId) — a
        // UUID would violate those constraints and yield zero area access.
        const email = (
          (profile as GoogleClaims | undefined)?.email ??
          token.email ??
          ""
        )
          .toLowerCase()
          .trim();
        const dbUser = email ? await findWorkspaceUser(email) : null;

        // Defence in depth behind signIn(): no row, no session at all.
        if (!dbUser || !dbUser.isActive) return null;

        token.id = dbUser.id;
        token.sub = dbUser.id;
        token.role = dbUser.role;
        token.name = dbUser.name;
        token.email = dbUser.email;
        return token;
      }

      // Credentials sign-in, and every subsequent request (no user/account).
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
  },
});

import { isGoogleSsoEnabled } from "@/lib/auth";
import { signInWithGoogle } from "@/lib/actions/auth-actions";
import { BigviewLogo } from "@/components/brand/logo";
import { CredentialsForm } from "@/components/auth/credentials-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";

export const metadata = { title: "Sign in" };

// Auth.js redirects here with ?error=… when a provider rejects the attempt.
// The Google provider's profile() throws these specific codes.
const ERROR_MESSAGES: Record<string, string> = {
  GoogleWrongDomain:
    "That Google account isn't on the company domain. Use your work account.",
  GoogleNoAccount:
    "That Google account isn't set up in BIGVIEW Control yet. Ask an admin to add you.",
  GoogleInactive: "That account has been deactivated.",
  GoogleUnverified:
    "Google hasn't verified the email address on that account.",
  AccessDenied: "Sign-in was denied. Check with an admin if this persists.",
  Configuration:
    "Google sign-in isn't configured correctly. Use your email and password.",
  OAuthCallbackError:
    "Google sign-in didn't complete. Try again, or use your email and password.",
};

function messageFor(error: string | undefined) {
  if (!error) return null;
  // Auth.js wraps provider errors, so fall back to a generic message rather
  // than leaking a raw error code to the user.
  return (
    ERROR_MESSAGES[error] ??
    "Google sign-in failed. Try again, or use your email and password."
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const googleEnabled = isGoogleSsoEnabled();
  const errorMessage = messageFor(error);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mb-2 flex justify-center">
            <BigviewLogo textClassName="text-4xl" />
          </div>
          <CardDescription>
            Sign in to manage rentals &amp; subscriptions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {errorMessage && (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">
              {errorMessage}
            </p>
          )}

          {googleEnabled && (
            <>
              <form action={signInWithGoogle}>
                <Button
                  type="submit"
                  variant="outline"
                  className="w-full gap-2"
                >
                  <GoogleMark />
                  Sign in with Google
                </Button>
              </form>
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <span className="h-px flex-1 bg-border" />
              </div>
            </>
          )}

          <CredentialsForm />
        </CardContent>
      </Card>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.5 13.2l7.9 6.2C12.3 13.5 17.6 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.1 24.5c0-1.6-.1-2.8-.4-4.1H24v8.1h12.6c-.3 2.1-1.6 5.2-4.6 7.3l7.7 6c4.6-4.2 6.4-10.3 6.4-17.3z"
      />
      <path
        fill="#FBBC05"
        d="M10.4 28.6A14.6 14.6 0 0 1 9.6 24c0-1.6.3-3.2.8-4.6l-7.9-6.2A24 24 0 0 0 0 24c0 3.9.9 7.5 2.5 10.8l7.9-6.2z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.5 0 11.9-2.1 15.8-5.8l-7.7-6c-2.1 1.4-4.8 2.4-8.1 2.4-6.4 0-11.7-4-13.6-9.9l-7.9 6.2C6.5 42.6 14.6 48 24 48z"
      />
    </svg>
  );
}

"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, login } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { getErrorMessage, getErrorStatus } from "@/components/ui/errors";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [usingDevDefaults, setUsingDevDefaults] = useState(false);

  useEffect(() => {
    let active = true;
    getSession()
      .then((s) => {
        if (active) setUsingDevDefaults(s.usingDevDefaults);
      })
      .catch(() => {
        /* session probe is best-effort; banner just stays hidden */
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(password);
      router.push("/");
      router.refresh();
    } catch (err) {
      const status = getErrorStatus(err);
      setError(
        status === 401
          ? "Incorrect password."
          : getErrorMessage(err, "Could not sign in. Please try again."),
      );
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="font-serif text-4xl font-semibold tracking-tight text-ink">Wanderline</h1>
          <p className="mt-1 text-sm text-ink/50">Sign in to author your trips.</p>
        </div>

        {usingDevDefaults && (
          <Banner tone="warning" testId="dev-default-banner">
            Using the built-in dev password <code className="font-mono">letmein</code> — set{" "}
            <code className="font-mono">OWNER_PASSWORD</code> in{" "}
            <code className="font-mono">.env</code> to secure this app.
          </Banner>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <label htmlFor="password" className="block text-sm font-medium text-ink/70">
            Password
          </label>
          <input
            id="password"
            data-testid="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            autoComplete="current-password"
            className="w-full rounded-md border border-ink/20 px-3 py-2 text-sm outline-none focus:border-trail focus:ring-2 focus:ring-trail/30"
          />
          {error && (
            <p data-testid="login-error" role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <Button
            data-testid="login-submit"
            type="submit"
            disabled={submitting}
            className="w-full bg-trail"
          >
            {submitting ? "Signing in…" : "Enter"}
          </Button>
        </form>
      </div>
    </main>
  );
}

"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createTrip } from "@/lib/api-client";
import { Button, buttonClasses } from "@/components/ui/Button";
import { getErrorMessage } from "@/components/ui/errors";

export default function NewTripPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Give your trip a title to get started.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const trip = await createTrip({
        title: title.trim(),
        description: description.trim() || undefined,
      });
      router.push(`/trips/${trip.id}/edit`);
    } catch (err) {
      setError(getErrorMessage(err, "Could not create the trip. Please try again."));
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <header className="mb-6 flex items-center justify-between">
        <Link href="/" className="font-serif text-2xl font-semibold text-ink">
          Wanderline
        </Link>
        <Link href="/" className={buttonClasses("ghost")}>
          ← Cancel
        </Link>
      </header>

      <h1 className="font-serif text-3xl text-ink">New trip</h1>
      <p className="mt-1 text-sm text-ink/50">Name your journey — you can add stops next.</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-ink/80">
            Title
          </label>
          <input
            id="title"
            data-testid="new-trip-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            placeholder="e.g. Two weeks in Japan"
            className="mt-1 w-full rounded-md border border-ink/20 px-3 py-2 text-sm outline-none focus:border-trail"
          />
        </div>
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-ink/80">
            Description <span className="font-normal text-ink/40">(optional)</span>
          </label>
          <textarea
            id="description"
            data-testid="new-trip-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="A short summary of the journey…"
            className="mt-1 w-full resize-none rounded-md border border-ink/20 px-3 py-2 text-sm outline-none focus:border-trail"
          />
        </div>
        {error && (
          <p data-testid="new-trip-error" role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <Button data-testid="new-trip-create" type="submit" disabled={submitting} className="w-full">
          {submitting ? "Creating…" : "Create trip"}
        </Button>
      </form>
    </main>
  );
}

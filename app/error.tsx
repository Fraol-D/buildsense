"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="wrap stack">
      <h1>This screen failed to render.</h1>
      <p>{error.message || "An unexpected error stopped the page."}</p>
      <button className="button" type="button" onClick={reset}>
        Try again
      </button>
    </main>
  );
}

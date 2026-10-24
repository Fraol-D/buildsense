import Link from "next/link";

export default function NotFound() {
  return (
    <main className="wrap stack">
      <h1>That page is not part of Buildsense.</h1>
      <Link href="/">Back to projects</Link>
    </main>
  );
}

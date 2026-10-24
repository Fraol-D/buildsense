import { Suspense } from "react";
import { Workspace } from "@/components/workspace";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<main className="wrap">Opening the project…</main>}>
      <Workspace params={params} />
    </Suspense>
  );
}

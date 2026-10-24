import { Suspense } from "react";
import { HomeScreen } from "@/components/home-screen";

export default function Page() {
  return (
    <Suspense fallback={<main className="wrap">Opening projects…</main>}>
      <HomeScreen />
    </Suspense>
  );
}

"use client";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid min-h-[60dvh] place-items-center px-6 text-center">
      <div>
        <h1 className="text-xl font-semibold">Something went wrong · Algo salió mal</h1>
        {error.digest && <p className="mt-2 font-mono text-xs text-muted">ref {error.digest}</p>}
        <Button className="mt-6" onClick={reset}>Retry · Reintentar</Button>
      </div>
    </div>
  );
}

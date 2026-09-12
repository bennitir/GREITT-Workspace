"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

export default function TraceDetails({
  summary,
  children,
}: {
  summary: ReactNode;
  children: ReactNode;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const details = detailsRef.current;
      if (!details?.open) return;

      const target = event.target;
      if (target instanceof Node && !details.contains(target)) {
        details.open = false;
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  return (
    <details ref={detailsRef} className="relative m-0">
      <summary className="cursor-pointer list-none rounded border px-3 py-2 font-medium text-slate-700 hover:bg-slate-50">
        {summary}
      </summary>
      {children}
    </details>
  );
}

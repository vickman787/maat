"use client";

import { Printer } from "lucide-react";

export function PrintButton({ label = "Print / Save as PDF" }: { label?: string }) {
  return (
    <button type="button" className="button secondary" onClick={() => window.print()}>
      <Printer size={15} /> {label}
    </button>
  );
}

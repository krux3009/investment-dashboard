// Wraps a page subtree, opens the EventSource once via useLivePrices,
// otherwise renders nothing. Mount at the top of each route that wants
// live numbers.

"use client";

import { useLivePrices } from "@/lib/use-live-prices";

export function LivePricesProvider({ children }: { children: React.ReactNode }) {
  useLivePrices();
  return <>{children}</>;
}

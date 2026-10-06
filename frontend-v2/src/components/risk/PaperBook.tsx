import { useEffect, useMemo, useState } from "react";
import { BookDrawer } from "@/components/risk/BookDrawer";
import { COMMODITIES } from "@/lib/book";
import { subscribeDemoBook, type DemoPosition } from "@/lib/demoBook";
import { useLiveMarket } from "@/lib/live-market";
import { TICKERS, unavailableInstrument, type Instrument } from "@/lib/market";

/**
 * The paper book editor as a modal over the risk desk. Quotes come from the authenticated
 * tape; a symbol without a quote, commodities included, cannot be booked.
 */
export function PaperBook({ onClose }: { onClose: () => void }) {
  const [positions, setPositions] = useState<DemoPosition[]>([]);
  useEffect(() => subscribeDemoBook(setPositions), []);
  const [instruments, setInstruments] = useState<Record<string, Instrument>>(() =>
    Object.fromEntries(TICKERS.map((s) => [s, unavailableInstrument(s)])),
  );
  const symbols = useMemo(
    // Commodity contracts are requested too: a quick-add books only if the tape quotes it.
    () =>
      Array.from(
        new Set([...positions.map((p) => p.symbol), ...Object.keys(COMMODITIES), ...TICKERS]),
      ).slice(0, 30),
    [positions],
  );
  useLiveMarket(setInstruments, symbols);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Paper book"
        className="max-h-[86vh] w-full max-w-3xl overflow-auto"
      >
        <BookDrawer positions={positions} instruments={instruments} onClose={onClose} />
      </div>
    </div>
  );
}

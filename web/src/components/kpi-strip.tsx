/**
 * KpiStrip — four KpiTiles in a responsive grid. Mirrors the SWS Portfolio
 * Holdings tab quad-row under the perf chart (Unrealized · Realized ·
 * Dividends · Currency Impact).
 *
 * Values are stubbed until P5 wires `/api/returns/summary`.
 */

import { KpiTile, type KpiTileProps } from "@/components/kpi-tile";

interface Props {
  tiles: KpiTileProps[];          // expect 4 tiles for the canonical strip
  caption?: string;               // small italic note ("Stubbed — wired in P5")
}

export function KpiStrip({ tiles, caption }: Props) {
  return (
    <section className="flex flex-col gap-2">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map((tile) => (
          <KpiTile key={tile.label} {...tile} />
        ))}
      </div>
      {caption ? (
        <p className="text-[11px] text-whisper italic leading-snug">{caption}</p>
      ) : null}
    </section>
  );
}

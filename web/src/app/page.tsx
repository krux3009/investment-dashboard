import { fetchHoldings } from "@/lib/api";

// Phase A: prove the FastAPI ↔ Next pipe works. Plain HTML table, no
// styling beyond Tailwind reset. Visual work lives in Phase B.

export default async function Home() {
  const data = await fetchHoldings();

  const fmtUsd = (n: number) =>
    n.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    });
  const fmtPct = (n: number) =>
    `${n >= 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;

  return (
    <main style={{ padding: "2rem", maxWidth: "1100px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>
        investment-dashboard · v3 phase A
      </h1>
      <p style={{ color: "#666", marginBottom: "1.5rem" }}>
        FastAPI → Next.js wire-up smoke test. Live moomoo book, USD-aggregated.
      </p>

      <section style={{ marginBottom: "1.5rem" }}>
        <div>
          Total market value (USD):{" "}
          <strong>{fmtUsd(data.total_market_value_usd)}</strong>
        </div>
        <div>
          Total P&amp;L (USD): {fmtUsd(data.total_pnl_abs_usd)} (
          {fmtPct(data.total_pnl_pct)})
        </div>
        <div style={{ color: "#666", fontSize: "0.85rem" }}>
          last_updated={data.last_updated} · fresh={String(data.fresh)} ·
          simulate_with_no_positions=
          {String(data.simulate_with_no_positions)}
        </div>
        <div style={{ color: "#666", fontSize: "0.85rem" }}>
          fx_rates_used=
          {Object.keys(data.fx_rates_used).length === 0
            ? "(none — single currency)"
            : JSON.stringify(data.fx_rates_used)}
        </div>
      </section>

      {data.holdings.length === 0 ? (
        <p style={{ fontStyle: "italic", color: "#666" }}>
          No positions returned by the API.
        </p>
      ) : (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #ccc", textAlign: "left" }}>
              <th style={{ padding: "0.5rem 0.75rem" }}>Ticker</th>
              <th style={{ padding: "0.5rem 0.75rem" }}>Name</th>
              <th style={{ padding: "0.5rem 0.75rem" }}>Mkt</th>
              <th style={{ padding: "0.5rem 0.75rem", textAlign: "right" }}>
                Qty
              </th>
              <th style={{ padding: "0.5rem 0.75rem", textAlign: "right" }}>
                Native MV
              </th>
              <th style={{ padding: "0.5rem 0.75rem", textAlign: "right" }}>
                MV (USD)
              </th>
              <th style={{ padding: "0.5rem 0.75rem", textAlign: "right" }}>
                Total P&amp;L
              </th>
            </tr>
          </thead>
          <tbody>
            {data.holdings.map((h) => (
              <tr key={h.code} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "0.5rem 0.75rem", fontWeight: 500 }}>
                  {h.ticker}
                </td>
                <td style={{ padding: "0.5rem 0.75rem", color: "#444" }}>
                  {h.name}
                </td>
                <td style={{ padding: "0.5rem 0.75rem" }}>
                  {h.market} · {h.currency}
                </td>
                <td
                  style={{
                    padding: "0.5rem 0.75rem",
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {h.qty}
                </td>
                <td
                  style={{
                    padding: "0.5rem 0.75rem",
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {h.market_value.toLocaleString()} {h.currency}
                </td>
                <td
                  style={{
                    padding: "0.5rem 0.75rem",
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {fmtUsd(h.market_value_usd)}
                </td>
                <td
                  style={{
                    padding: "0.5rem 0.75rem",
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {fmtPct(h.total_pnl_pct)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

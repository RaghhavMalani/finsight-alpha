/** Research series have no listing venue, currency price or provider ticker. */
export const FACTOR_SERIES = [
  { id: "US-MKT", country: "US", name: "US market factor", source: "Ken French Data Library" },
  { id: "IN-MKT", country: "India", name: "India market factor", source: "IIM Ahmedabad" },
] as const;
export const factorSeries = (identity: string) => FACTOR_SERIES.find((s) => s.id === identity);

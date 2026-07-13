import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { api, type Datasets, type Providers, type Weather } from "@/lib/api";

function value(value: number | null | undefined, suffix: string) {
  return Number.isFinite(value) ? `${Number(value).toFixed(1)}${suffix}` : "—";
}

export function ExternalContextStrip() {
  const [city, setCity] = useState("Mumbai");
  const [draftCity, setDraftCity] = useState("Mumbai");
  const weather = useQuery({
    queryKey: ["context-weather", city],
    queryFn: () => api<Weather>(`/context/weather?city=${encodeURIComponent(city)}`),
    staleTime: 10 * 60_000,
    retry: 1,
  });
  const datasets = useQuery({
    queryKey: ["context-datasets"],
    queryFn: () => api<Datasets>("/context/datasets"),
    staleTime: 60_000,
    retry: 1,
  });
  const providers = useQuery({
    queryKey: ["context-providers"],
    queryFn: () => api<Providers>("/context/providers"),
    staleTime: 60_000,
    retry: 1,
  });

  const providerEntries = Object.entries(providers.data ?? {});
  const readyProviders = providerEntries.filter(([, item]) => item.configured).length;

  return (
    <div className="shrink-0 border-b border-divider bg-background p-2">
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
        <section className="border border-divider bg-panel px-3 py-2">
          <div className="mono-caps flex items-center justify-between text-[9px] text-faint">
            <span>WEATHER · OPEN-METEO</span>
            <span
              className={weather.data?.operational_risk === "elevated" ? "text-down" : "text-up"}
            >
              {weather.isFetching
                ? "SYNCING"
                : (weather.data?.operational_risk?.toUpperCase() ?? "OFFLINE")}
            </span>
          </div>
          <div className="mt-1 flex items-end justify-between gap-3">
            <div>
              <div className="font-serif text-lg text-foreground">
                {weather.data
                  ? `${weather.data.city} · ${weather.data.condition}`
                  : "Weather unavailable"}
              </div>
              <div className="font-mono text-[10px] text-muted-foreground">
                {value(weather.data?.temperature_c, "°C")} · WIND{" "}
                {value(weather.data?.wind_kph, " km/h")} · RAIN{" "}
                {value(weather.data?.precipitation_mm, " mm")}
              </div>
            </div>
            <form
              className="flex"
              onSubmit={(event) => {
                event.preventDefault();
                const next = draftCity.trim();
                if (next) setCity(next);
              }}
            >
              <input
                value={draftCity}
                onChange={(event) => setDraftCity(event.target.value)}
                aria-label="Weather city"
                className="w-24 border border-border bg-background px-1.5 py-1 font-mono text-[9px] text-foreground outline-none focus:border-primary"
              />
              <button
                type="submit"
                className="border border-l-0 border-primary px-2 py-1 font-mono text-[9px] text-primary"
              >
                LOAD
              </button>
            </form>
          </div>
        </section>

        <section className="border border-divider bg-panel px-3 py-2">
          <div className="mono-caps flex items-center justify-between text-[9px] text-faint">
            <span>KAGGLE · DATASETS</span>
            <span className={datasets.data?.count ? "text-up" : "text-primary"}>
              {datasets.isFetching ? "SCANNING" : `${datasets.data?.count ?? 0} FOUND`}
            </span>
          </div>
          <div className="mt-1 font-serif text-lg text-foreground">
            {datasets.data?.datasets[0]?.name ?? "No research dataset loaded"}
          </div>
          <div
            className="truncate font-mono text-[10px] text-muted-foreground"
            title={datasets.data?.root}
          >
            {datasets.data?.message ??
              (datasets.isError ? "Dataset inventory unavailable" : "Reading local inventory…")}
          </div>
        </section>

        <section className="border border-divider bg-panel px-3 py-2">
          <div className="mono-caps flex items-center justify-between text-[9px] text-faint">
            <span>DATA PROVIDERS</span>
            <span className="text-up">
              {readyProviders}/{providerEntries.length || "—"} READY
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {providerEntries.length ? (
              providerEntries.map(([name, item]) => (
                <span
                  key={name}
                  className={`mono-caps border px-1.5 py-0.5 text-[8px] ${item.configured ? "border-up/40 bg-up/5 text-up" : "border-border text-faint"}`}
                >
                  {name.replace("_", " ")} · {item.configured ? "ON" : "KEY NEEDED"}
                </span>
              ))
            ) : (
              <span className="font-mono text-[10px] text-muted-foreground">
                {providers.isError ? "Provider status unavailable" : "Checking integrations…"}
              </span>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

import { Link } from "@tanstack/react-router";
import { CandleChart } from "./charts";
import { BAR_RANGES, overviewTarget, type BarRange, type MarketQuote } from "./contracts";
import { compactNum, num, pct, stamp } from "./format";
import { useBars, useQuotes } from "./queries";
import { Chip, Kpis, Loading, Note, Panel, Unavailable } from "./ui";
import { setWatchlist, toggleWatchlist, useWatchlist } from "./watchlist";
import { useDataMode } from "@/replay/mode";
import ReplayOverviewScreen from "./ReplayOverviewScreen";
import { instrumentMoney, lookupInstrument } from "./instruments";
import { factorSeries } from "@/replay/factor-series";

function quoteSource(q: MarketQuote) {
  return q.source === "FINNHUB"
    ? `Finnhub · ${q.live ? "live" : "snapshot"}`
    : q.source === "YFINANCE_EOD"
      ? "Yahoo · last daily bar"
      : q.source;
}
export default function OverviewScreen(props: {
  ticker: string;
  range: BarRange;
  onRange: (range: BarRange) => void;
}) {
  const mode = useDataMode();
  if (mode === "live" && factorSeries(props.ticker))
    return (
      <Panel title="Market factor research">
        <p className="mk-line">
          These factor research scenes are recorded in Replay. Select Replay, or enter a ticker for
          local Live prices.
        </p>
      </Panel>
    );
  return mode === "replay" ? (
    <ReplayOverviewScreen ticker={props.ticker} />
  ) : (
    <LiveOverviewScreen {...props} />
  );
}
function LiveOverviewScreen({
  ticker,
  range,
  onRange,
}: {
  ticker: string;
  range: BarRange;
  onRange: (range: BarRange) => void;
}) {
  const watchlist = useWatchlist();
  const asset = lookupInstrument(ticker);
  const mark = (v: number | null) =>
    v == null ? "—" : asset ? instrumentMoney(v, asset.currency) : num(v);
  const quotes = useQuotes([ticker, ...watchlist, "^INDIAVIX"]);
  const candles = useBars(ticker, range);
  const quote = quotes.data?.[ticker],
    data = candles.data;
  const watching = watchlist.includes(ticker),
    full = !watching && watchlist.length >= 30;
  const tone =
    quote && quote.change_pct != null
      ? quote.change_pct < 0
        ? ("down" as const)
        : ("up" as const)
      : undefined;
  return (
    <>
      <Panel
        title={`Quote · ${ticker}`}
        className="mk-quote"
        meta={
          quote && (
            <>
              <Chip tone={quote.live ? "info" : "plain"}>{quoteSource(quote)}</Chip>
              <Chip>{stamp(quote.quote_ts)}</Chip>
            </>
          )
        }
      >
        {quotes.isPending ? (
          <Loading label="quotes" />
        ) : quotes.isError ? (
          <Unavailable what="Quotes" error={quotes.error} retry={() => void quotes.refetch()} />
        ) : !quote ? (
          <Unavailable
            what={`Quote for ${ticker}`}
            error={new Error("The source returned no quote for this symbol.")}
          />
        ) : (
          <Kpis
            items={[
              { label: "Last", value: mark(quote.last) },
              {
                label: "Change",
                value: quote.prev_close == null ? "—" : mark(quote.last - quote.prev_close),
                tone,
              },
              { label: "Change %", value: pct(quote.change_pct, 2, true), tone },
              { label: "Open", value: mark(quote.open) },
              { label: "High", value: mark(quote.high) },
              { label: "Low", value: mark(quote.low) },
              { label: "Previous close", value: mark(quote.prev_close) },
              { label: "Volume", value: compactNum(quote.volume) },
            ]}
          />
        )}
        <div className="mk-controls">
          <button
            type="button"
            className="mk-ghost"
            aria-pressed={watching}
            disabled={full}
            onClick={() => toggleWatchlist(ticker)}
          >
            {watching ? "Remove from watchlist" : "Add to watchlist"}
          </button>
          <span className="mk-note">
            {full
              ? "Watchlist is full (30). Remove a symbol to add another."
              : "Saved in this browser · quotes refresh every 30 seconds"}
          </span>
        </div>
      </Panel>
      <Panel title="India VIX" meta={<Chip>NSE · regular session 09:15–15:30 IST</Chip>}>
        {quotes.data?.["^INDIAVIX"] ? (
          <p className="mk-line">
            {num(quotes.data["^INDIAVIX"].last)} index points ·{" "}
            {quoteSource(quotes.data["^INDIAVIX"])} · {stamp(quotes.data["^INDIAVIX"].quote_ts)}
          </p>
        ) : (
          <p className="mk-line">
            India VIX unavailable: the source returned no timestamped index quote.
          </p>
        )}
      </Panel>
      <div className="mk-overview-grid">
        <Panel
          title={`Price · ${ticker}`}
          meta={
            data && (
              <Chip>
                {data.source === "YFINANCE" ? "Yahoo" : data.source} · {data.interval}
              </Chip>
            )
          }
        >
          <div
            className="mk-seg"
            role="radiogroup"
            aria-label="Chart range"
            onKeyDown={(e) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
              e.preventDefault();
              const index = BAR_RANGES.indexOf(range);
              const next =
                e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? BAR_RANGES.length - 1
                    : (index + (e.key === "ArrowRight" ? 1 : -1) + BAR_RANGES.length) %
                      BAR_RANGES.length;
              onRange(BAR_RANGES[next]);
              (e.currentTarget.children[next] as HTMLButtonElement)?.focus();
            }}
          >
            {BAR_RANGES.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={r === range}
                tabIndex={r === range ? 0 : -1}
                onClick={() => onRange(r)}
              >
                {r}
              </button>
            ))}
          </div>
          {candles.isPending ? (
            <Loading label={`${range} candles`} />
          ) : candles.isError ? (
            <Unavailable
              what="Price bars"
              error={candles.error}
              retry={() => void candles.refetch()}
            />
          ) : (
            data && (
              <>
                <CandleChart
                  bars={data.bars}
                  timezone={data.timezone}
                  label={`${ticker} ${range} candlesticks and volume`}
                />
                <Note>
                  {data.source} · {data.interval} · {data.bars.length} bars · last bar{" "}
                  {stamp(data.bars[data.bars.length - 1].t)} · fetched {stamp(data.fetched_at)}.{" "}
                  Prices are split- and dividend-adjusted; the latest bar may still be forming.
                  Volume is unavailable where shown as —.
                </Note>
              </>
            )
          )}
        </Panel>
        <Panel title="Watchlist" className="mk-watch" meta={<Chip>{watchlist.length} / 30</Chip>}>
          {quotes.isPending ? (
            <Loading label="the watchlist" />
          ) : quotes.isError ? (
            <Unavailable what="Watchlist quotes" error={quotes.error} />
          ) : !watchlist.length ? (
            <p className="mk-line">Your watchlist is empty. Add a ticker from its Overview.</p>
          ) : (
            <div className="mk-table-wrap">
              <table className="mk-table">
                <thead>
                  <tr>
                    <th scope="col">Symbol / source</th>
                    <th scope="col">Last</th>
                    <th scope="col">Change %</th>
                    <th scope="col">
                      <span className="sr-only">Remove</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {watchlist.map((symbol) => {
                    const q = quotes.data?.[symbol];
                    return (
                      <tr key={symbol} className={symbol === ticker ? "mk-current" : undefined}>
                        <th scope="row">
                          <Link {...overviewTarget(symbol)}>{symbol}</Link>
                          <small>{q ? quoteSource(q) : "No quote"}</small>
                          <small>
                            {q ? stamp(q.quote_ts) : "Source did not return this symbol"}
                          </small>
                        </th>
                        <td>{num(q?.last)}</td>
                        <td
                          className={
                            q?.change_pct != null
                              ? q.change_pct < 0
                                ? "mk-down"
                                : "mk-up"
                              : undefined
                          }
                        >
                          {pct(q?.change_pct, 2, true)}
                        </td>
                        <td>
                          <button
                            className="mk-ghost"
                            type="button"
                            aria-label={`Remove ${symbol} from watchlist`}
                            onClick={() => setWatchlist(watchlist.filter((t) => t !== symbol))}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Note>US and India symbols. Each row keeps its own source and observation time.</Note>
        </Panel>
      </div>
    </>
  );
}

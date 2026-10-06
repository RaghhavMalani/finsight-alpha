import { useSearch } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { int } from "./format";
import { useResearchAsk, useResearchIndex } from "./queries";
import { Chip, Loading, Note, Panel, Unavailable } from "./ui";

export default function ResearchScreen() {
  const { ticker } = useSearch({ from: "/markets" });
  return <Research key={ticker} ticker={ticker} />;
}

function Research({ ticker }: { ticker: string }) {
  const index = useResearchIndex();
  const ask = useResearchAsk();
  const [question, setQuestion] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (q) ask.mutate({ ticker, question: q });
  };
  const a = ask.data;
  return (
    <div className="mk-grid">
      <Panel title={`Filing index · ${ticker}`} meta={<Chip>SEC EDGAR · your account only</Chip>}>
        <p className="mk-line">
          Fetch {ticker}'s most recent 10-K or 10-Q from EDGAR and index it for questions. The index
          is private to your account, holds only this company's filing, and is replaced on each
          fetch.
        </p>
        <div className="mk-controls">
          <button
            type="button"
            className="mk-primary"
            disabled={index.isPending}
            onClick={() => index.mutate(ticker)}
          >
            {index.isPending ? "Indexing…" : "Index latest filing"}
          </button>
        </div>
        {index.isError && <Unavailable what="Filing index" error={index.error} />}
        {index.data && (
          <p className="mk-line" role="status">
            Indexed {int(index.data.chunks)} passages from {index.data.files.join(", ")}.
          </p>
        )}
      </Panel>

      <Panel title="Ask the filings" className="mk-span">
        <form className="mk-ask" onSubmit={submit}>
          <label htmlFor="mk-question" className="mk-label">
            Question about {ticker}'s filings
          </label>
          <textarea
            id="mk-question"
            rows={3}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What are the main risk factors to gross margin?"
          />
          <button type="submit" className="mk-primary" disabled={ask.isPending || !question.trim()}>
            Ask
          </button>
        </form>
        {ask.isPending && <Loading label="the answer" />}
        {ask.isError && <Unavailable what="Answer" error={ask.error} />}
        {a && (
          <article className="mk-answer">
            <div className="mk-controls">
              {a.grounded ? (
                <Chip tone="pass" title="The answer cites at least one indexed passage">
                  Grounded in cited passages
                </Chip>
              ) : a.provider === "none" || a.provider == null ? (
                <Chip tone="info" title="No language model is configured; showing retrieved text">
                  Retrieval only · no model answer
                </Chip>
              ) : (
                <Chip tone="warn" title="The model answered without citing an indexed passage">
                  Not grounded
                </Chip>
              )}
              {a.provider && <Chip>Provider {a.provider}</Chip>}
            </div>
            <p className="mk-answer-text">{a.answer}</p>
            {a.citations.length > 0 && (
              <ol className="mk-citations">
                {a.citations.map((c) => (
                  <li key={c.n} value={c.n}>
                    <p className="mk-label">
                      {c.source_file} · page {c.page}
                    </p>
                    <blockquote>{c.text}</blockquote>
                  </li>
                ))}
              </ol>
            )}
          </article>
        )}
        <Note>
          Answers use only passages indexed for {ticker} under your account. Without an index the
          API answers 404; index the filings first.
        </Note>
      </Panel>
    </div>
  );
}

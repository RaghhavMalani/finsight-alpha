import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { HashValue } from "@/epistemic/EpistemicValue";
import type { RunSummary } from "@/forge/contracts/observer";
import { DEFAULT_BASELINE_ID } from "@/forge/contracts/observer";
import { baselineQuery, runsQuery } from "@/forge/data/forge-queries";
import { ForgeShell } from "@/app/shell/ForgeShell";
import {
  InstrumentPanel,
  LoadingState,
  StatusMark,
  SurfaceHeader,
  UnavailableState,
} from "@/forge/shared/SurfacePrimitives";

type VerificationFilter = "verified" | "failed";

type RunFilters = {
  model: string | undefined;
  verdict: string | undefined;
  task: string | undefined;
  taskClass: string | undefined;
  seed: number | undefined;
  verified: VerificationFilter | undefined;
};

export function RunIndex(filters: RunFilters) {
  const runs = useQuery(runsQuery());
  const baseline = useQuery(baselineQuery(DEFAULT_BASELINE_ID));
  const navigate = useNavigate();
  const failure = runs.error ?? baseline.error;

  if (runs.isPending || baseline.isPending) {
    return (
      <ForgeShell>
        <LoadingState label="run index" />
      </ForgeShell>
    );
  }

  if (failure || !runs.data || !baseline.data) {
    return (
      <ForgeShell>
        <UnavailableState
          title="Run index unavailable"
          error={failure}
          retry={() => {
            void runs.refetch();
            void baseline.refetch();
          }}
        />
      </ForgeShell>
    );
  }

  const taskNeedle = filters.task?.trim().toLowerCase();
  const filteredRuns = runs.data.items.filter((run) => {
    if (filters.model && run.model !== filters.model) return false;
    if (filters.verdict && run.decision?.verdict !== filters.verdict) return false;
    if (filters.taskClass && run.taskClass !== filters.taskClass) return false;
    if (filters.seed !== undefined && run.seed !== filters.seed) return false;
    if (filters.verified === "verified" && !run.verifiedResearchSuccess) return false;
    if (filters.verified === "failed" && run.verifiedResearchSuccess) return false;
    if (
      taskNeedle &&
      !run.taskId.toLowerCase().includes(taskNeedle) &&
      !run.taskClass.toLowerCase().includes(taskNeedle)
    ) {
      return false;
    }
    return true;
  });
  const taskClasses = Array.from(new Set(runs.data.items.map((run) => run.taskClass))).sort();
  const seeds = Array.from(new Set(runs.data.items.map((run) => run.seed))).sort((a, b) => a - b);
  const updateFilters = (patch: Partial<RunFilters>) => {
    void navigate({
      to: "/runs",
      search: { ...filters, ...patch },
      replace: true,
    });
  };

  return (
    <ForgeShell>
      <SurfaceHeader
        eyebrow="Canonical trajectories"
        title="Runs"
        description="Manifest-bound trajectories grouped by model. Every filter and observer selection is URL-addressable."
        meta={<StatusMark status="INFO" label="IMMUTABLE" />}
      />

      <section aria-label="Run filters" className="mt-4 border border-[#1D232B] bg-[#0B0E11]">
        <div className="grid gap-px bg-[#1D232B] lg:grid-cols-[1.35fr_1fr_1fr]">
          <label className="bg-[#0B0E11] p-3">
            <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#65707c]">
              Task search
            </span>
            <input
              type="search"
              value={filters.task ?? ""}
              onChange={(event) => updateFilters({ task: event.target.value || undefined })}
              placeholder="task id or class"
              className="mt-2 h-8 w-full border border-[#303842] bg-[#07090B] px-2.5 font-mono text-[9px] text-[#dce0e4] placeholder:text-[#4f5963] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFB000]"
            />
          </label>
          <FilterSelect
            label="Task class"
            value={filters.taskClass ?? ""}
            onChange={(value) => updateFilters({ taskClass: value || undefined })}
            options={taskClasses.map((value) => ({ value, label: value.replaceAll("_", " ") }))}
          />
          <FilterSelect
            label="Seed"
            value={filters.seed?.toString() ?? ""}
            onChange={(value) => updateFilters({ seed: value ? Number(value) : undefined })}
            options={seeds.map((value) => ({ value: String(value), label: String(value) }))}
          />
        </div>

        <div className="grid gap-3 border-t border-[#1D232B] p-3 xl:grid-cols-[1.25fr_1fr_1fr_auto] xl:items-center">
          <FilterGroup label="Model">
            <FilterButton
              label="All"
              active={!filters.model}
              onClick={() => updateFilters({ model: undefined })}
            />
            {baseline.data.models.map((model) => (
              <FilterButton
                key={model.id}
                label={model.label}
                active={filters.model === model.id}
                onClick={() => updateFilters({ model: model.id })}
              />
            ))}
          </FilterGroup>
          <FilterGroup label="Verdict">
            {[undefined, "ACCEPT", "REJECT", "ABSTAIN"].map((value) => (
              <FilterButton
                key={value ?? "all"}
                label={value ?? "All"}
                active={filters.verdict === value || (!filters.verdict && value === undefined)}
                onClick={() => updateFilters({ verdict: value })}
              />
            ))}
          </FilterGroup>
          <FilterGroup label="Verification">
            <FilterButton
              label="All"
              active={!filters.verified}
              onClick={() => updateFilters({ verified: undefined })}
            />
            <FilterButton
              label="Verified"
              active={filters.verified === "verified"}
              onClick={() => updateFilters({ verified: "verified" })}
            />
            <FilterButton
              label="Failed"
              active={filters.verified === "failed"}
              onClick={() => updateFilters({ verified: "failed" })}
            />
          </FilterGroup>
          <div className="flex items-center justify-between gap-3 xl:block xl:text-right">
            <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#65707c]">
              {filteredRuns.length} / {runs.data.matched}
            </span>
            <button
              type="button"
              onClick={() =>
                updateFilters({
                  model: undefined,
                  verdict: undefined,
                  task: undefined,
                  taskClass: undefined,
                  seed: undefined,
                  verified: undefined,
                })
              }
              className="ml-3 font-mono text-[8px] uppercase tracking-[0.08em] text-[#52A8FF] hover:text-[#8ac8ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFB000]"
            >
              Clear
            </button>
          </div>
        </div>
      </section>

      <InstrumentPanel
        title="Observed runs"
        code={runs.data.binding.integrityStatus}
        className="mt-3"
      >
        {filteredRuns.length ? (
          <div>
            {baseline.data.models.map((model, modelIndex) => {
              const modelRuns = filteredRuns.filter((run) => run.model === model.id);
              if (!modelRuns.length) return null;
              const counts = verdictCounts(modelRuns);
              return (
                <details
                  key={model.id}
                  open={Boolean(filters.model) || modelIndex === 0}
                  className="border-b border-[#1D232B] last:border-b-0"
                >
                  <summary className="cursor-pointer list-none bg-[#090c0f] px-3 py-3 hover:bg-[#0e1216] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#FFB000]">
                    <span className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                      <span>
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#FFB000]">
                          {model.label}
                        </span>
                        <span className="ml-3 font-mono text-[8px] text-[#65707c]">
                          {modelRuns.length} runs
                        </span>
                      </span>
                      <span className="flex gap-4 font-mono text-[8px] uppercase tracking-[0.07em] text-[#7f8993]">
                        <span className="text-[#35C78A]">Accept {counts.ACCEPT}</span>
                        <span className="text-[#FF5A57]">Reject {counts.REJECT}</span>
                        <span className="text-[#D8A43A]">Abstain {counts.ABSTAIN}</span>
                      </span>
                    </span>
                  </summary>
                  <div className="divide-y divide-[#171d23]">
                    {modelRuns.map((run) => (
                      <RunRow key={run.runId} run={run} />
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        ) : (
          <p className="p-5 text-sm text-[#7B8490]">
            No frozen trajectories match the URL filters.
          </p>
        )}
      </InstrumentPanel>
    </ForgeShell>
  );
}

function RunRow({ run }: { run: RunSummary }) {
  return (
    <article className="grid gap-3 px-3 py-3 hover:bg-[#0d1115] lg:grid-cols-[10rem_minmax(12rem,1fr)_6rem_11rem_auto] lg:items-center">
      <div>
        <div className="text-[12px] font-medium text-[#dce0e4]">{run.taskId}</div>
        <div className="mt-1 font-mono text-[7px] uppercase tracking-[0.08em] text-[#65707c]">
          {run.taskClass.replaceAll("_", " ")}
        </div>
      </div>
      <div className="grid gap-1.5">
        <HashValue label="run" value={run.runId} />
        <HashValue label="world" value={run.worldHash} />
      </div>
      <div className="font-mono text-[8px] text-[#8b949e]">
        <span className="block uppercase text-[#59636e]">Seed</span>
        <span className="mt-1 block text-[#cbd1d6]">{run.seed}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 font-mono text-[8px] tabular-nums">
        <span>
          <span className="block text-[#59636e]">COST</span>
          <span className="mt-1 block text-[#FFB000]">${run.usage.cost.value.toFixed(4)}</span>
        </span>
        <span>
          <span className="block text-[#59636e]">WALL</span>
          <span className="mt-1 block text-[#cbd1d6]">
            {run.usage.wallSeconds.value.toFixed(2)}s
          </span>
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 lg:justify-end">
        <StatusMark
          status={run.verifiedResearchSuccess ? "PASS" : "FAIL"}
          label={run.decision?.verdict ?? "NONE"}
        />
        <Link
          to="/runs/$runId"
          params={{ runId: run.runId }}
          search={{ node: 1, tab: "action" }}
          className="border border-[#3b4651] px-3 py-2 font-mono text-[8px] uppercase tracking-[0.1em] text-[#d5dbe0] hover:border-[#FFB000] hover:text-[#FFB000] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFB000]"
        >
          Observe
        </Link>
      </div>
    </article>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="bg-[#0B0E11] p-3">
      <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#65707c]">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-8 w-full border border-[#303842] bg-[#07090B] px-2.5 font-mono text-[9px] uppercase text-[#dce0e4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFB000]"
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#65707c]">{label}</div>
      <div className="mt-2 flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function FilterButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`border px-2 py-1.5 font-mono text-[8px] uppercase tracking-[0.08em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFB000] ${
        active
          ? "border-[#FFB000] bg-[#1b160d] text-[#FFB000]"
          : "border-[#303842] text-[#8b949e] hover:border-[#59636e]"
      }`}
    >
      {label}
    </button>
  );
}

function verdictCounts(runs: readonly RunSummary[]) {
  return runs.reduce(
    (counts, run) => {
      const verdict = run.decision?.verdict;
      if (verdict === "ACCEPT" || verdict === "REJECT" || verdict === "ABSTAIN")
        counts[verdict] += 1;
      return counts;
    },
    { ACCEPT: 0, REJECT: 0, ABSTAIN: 0 },
  );
}

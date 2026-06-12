"use client";

import { useState } from "react";
import Link from "next/link";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { motion } from "framer-motion";
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpDown, ChevronDown } from "lucide-react";
import EmptyState from "../EmptyState";
import StatusChip from "../StatusChip";
import { formatINR } from "@/lib/format";
import type { LeakRow } from "@/lib/mock/types";

const col = createColumnHelper<LeakRow>();

const ROW_TINT: Record<LeakRow["verdict"], string> = {
  leaking: "bg-bad/[0.04]",
  watch: "bg-watch/[0.03]",
  healthy: "",
};

const columns = [
  col.accessor("channel", {
    header: "Channel",
    cell: (info) => <span className="font-semibold">{info.getValue()}</span>,
  }),
  col.accessor("spend", {
    header: "Spend/mo",
    cell: (info) => <span className="font-mono text-[13px]">{formatINR(info.getValue())}</span>,
  }),
  col.accessor("conversions", {
    header: "Customers",
    cell: (info) => <span className="font-mono text-[13px]">{info.getValue()}</span>,
  }),
  col.accessor("cac", {
    header: "CAC",
    cell: (info) => {
      const v = info.getValue();
      return <span className="font-mono text-[13px]">{v === null ? "—" : formatINR(v)}</span>;
    },
  }),
  col.accessor("verdict", {
    header: "Verdict",
    cell: (info) => <StatusChip verdict={info.getValue()} />,
    sortingFn: (a, b) => {
      const rank = { leaking: 0, watch: 1, healthy: 2 } as const;
      return rank[a.original.verdict] - rank[b.original.verdict];
    },
  }),
  col.accessor("wastedPerMonth", {
    header: "₹ wasted/mo",
    cell: (info) => {
      const v = info.getValue();
      return (
        <span className={`font-mono text-[13px] font-semibold ${v > 0 ? "text-bad" : "text-muted"}`}>
          {v > 0 ? formatINR(v) : "₹0"}
        </span>
      );
    },
  }),
];

/** Ranked bitter-truth table: sortable, status-tinted, rows expand into why + fix. */
export default function LeaksTable({ rows }: { rows: LeakRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "wastedPerMonth", desc: true }]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: () => true,
  });

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nothing to audit yet"
        body="Connect a source to see your first verdict — and where the first rupee is leaking."
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: 0.07 }}
    >
      {/* desktop table */}
      <div className="hidden overflow-hidden rounded-2xl border border-stroke-2 bg-surface md:block">
        <table className="w-full border-collapse text-left">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-stroke-2">
                {hg.headers.map((h) => {
                  const dir = h.column.getIsSorted();
                  return (
                    <th
                      key={h.id}
                      aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none"}
                      className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted"
                    >
                      <button
                        onClick={h.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1.5 transition-colors duration-150 hover:text-ink"
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {dir === "asc" ? (
                          <ArrowUp size={12} aria-hidden />
                        ) : dir === "desc" ? (
                          <ArrowDown size={12} aria-hidden />
                        ) : (
                          <ArrowUpDown size={12} className="opacity-40" aria-hidden />
                        )}
                      </button>
                    </th>
                  );
                })}
                <th className="w-10 px-4 py-3">
                  <span className="sr-only">Expand</span>
                </th>
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <FragmentRow key={row.id} row={row} />
            ))}
          </tbody>
        </table>
      </div>

      {/* mobile stacked cards */}
      <ul className="space-y-3 md:hidden">
        {table.getRowModel().rows.map(({ original: r }) => (
          <li key={r.id} className={`rounded-2xl border border-stroke-2 bg-surface p-4 ${ROW_TINT[r.verdict]}`}>
            <details>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                <span className="text-[14px] font-bold">{r.channel}</span>
                <StatusChip verdict={r.verdict} />
              </summary>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-[12px]">
                <div>
                  <dt className="text-muted">Spend/mo</dt>
                  <dd>{formatINR(r.spend)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Customers</dt>
                  <dd>{r.conversions}</dd>
                </div>
                <div>
                  <dt className="text-muted">CAC</dt>
                  <dd>{r.cac === null ? "—" : formatINR(r.cac)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Wasted/mo</dt>
                  <dd className={r.wastedPerMonth > 0 ? "font-semibold text-bad" : ""}>
                    {formatINR(r.wastedPerMonth)}
                  </dd>
                </div>
              </dl>
              <ExpandedContent row={r} />
            </details>
            <p className="mt-2 flex items-center gap-1 text-[11px] text-muted">
              <ChevronDown size={11} aria-hidden /> tap for why + fix
            </p>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

function FragmentRow({
  row,
}: {
  row: import("@tanstack/react-table").Row<LeakRow>;
}) {
  const r = row.original;
  const open = row.getIsExpanded();
  return (
    <>
      <tr
        className={`border-b border-stroke-2 transition-colors duration-150 last:border-0 hover:bg-white/[0.02] ${ROW_TINT[r.verdict]}`}
      >
        {row.getVisibleCells().map((cell) => (
          <td key={cell.id} className="px-4 py-3.5 text-[13px]">
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>
        ))}
        <td className="px-4 py-3.5">
          <button
            onClick={row.getToggleExpandedHandler()}
            aria-expanded={open}
            aria-label={`${open ? "Hide" : "Show"} why and fix for ${r.channel}`}
            className="rounded-lg border border-stroke-2 p-1.5 text-muted transition-all duration-200 hover:bg-white/5 hover:text-ink"
          >
            <ChevronDown
              size={14}
              aria-hidden
              className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            />
          </button>
        </td>
      </tr>
      {open && (
        <tr className={`border-b border-stroke-2 last:border-0 ${ROW_TINT[r.verdict]}`}>
          <td colSpan={7} className="px-4 pb-4 pt-0">
            <ExpandedContent row={r} />
          </td>
        </tr>
      )}
    </>
  );
}

function ExpandedContent({ row: r }: { row: LeakRow }) {
  return (
    <div className="mt-3 grid gap-3 rounded-xl border border-stroke-2 bg-bg/40 p-4 sm:grid-cols-2">
      <div>
        <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Why</h4>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink/90">{r.why}</p>
      </div>
      <div>
        <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Suggested fix</h4>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink/90">{r.fix}</p>
        {r.verdict !== "healthy" && (
          <Link
            href="/execute"
            className="mt-2.5 inline-flex items-center gap-1 text-[12px] font-bold text-amber transition-opacity duration-200 hover:opacity-80"
          >
            Send to Execute board
            <ArrowRight size={12} aria-hidden />
          </Link>
        )}
      </div>
    </div>
  );
}

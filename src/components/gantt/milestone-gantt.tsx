"use client";

// Types only: the Gantt itself is Bryntum's prebuilt UMD bundle, served from /vendor/bryntum
// (copied by scripts/copy-vendor.mjs) so the dev server never has to bundle it.
import type { Gantt, GanttConfig, StringHelper as StringHelperType, TaskModel, TaskModelConfig } from "@bryntum/gantt";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatMoney } from "@/lib/money";
import type { ContractView } from "@/server/contracts";

interface BryntumGanttNS {
  Gantt: new (config: Partial<GanttConfig>) => Gantt;
  StringHelper: typeof StringHelperType;
}

let loader: Promise<BryntumGanttNS> | null = null;

function loadBryntum(): Promise<BryntumGanttNS> {
  loader ??= new Promise((resolve, reject) => {
    for (const href of ["gantt.css", "stockholm-dark.css", "fontawesome/css/fontawesome.css", "fontawesome/css/solid.css"]) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = `/vendor/bryntum/${href}`;
      document.head.appendChild(link);
    }
    const script = document.createElement("script");
    script.src = "/vendor/bryntum/gantt.umd.js";
    script.async = true;
    script.onload = () => {
      const ns = (window as unknown as { bryntum?: { gantt?: BryntumGanttNS } }).bryntum?.gantt;
      if (ns?.Gantt) resolve(ns);
      else reject(new Error("Bryntum Gantt loaded without its global"));
    };
    script.onerror = () => {
      loader = null;
      reject(new Error("Couldn't load the timeline (run `npm run dev`, which copies Bryntum to public/vendor)"));
    };
    document.head.appendChild(script);
  });
  return loader;
}

const DONE = ["released", "payout_pending", "paid_out"];
const PROGRESS: Record<string, number> = {
  funding: 5,
  funded: 25,
  submitted: 60,
  changes_requested: 50,
  needs_review: 80,
  verified: 90,
  releasing: 95,
  release_pending: 95,
  released: 100,
  payout_pending: 100,
  paid_out: 100,
};
const COLOR: Record<string, string> = {
  paid_out: "green",
  payout_pending: "green",
  released: "green",
  verified: "teal",
  needs_review: "orange",
  changes_requested: "orange",
  submitted: "blue",
  funded: "blue",
  disputed: "red",
  voided: "gray",
  cancelled: "gray",
};

/**
 * Bryntum Gantt as the project view: each milestone is a bar ending at its due date, with a
 * payment diamond where money is (or will be) released. Dragging or resizing a bar proposes a
 * schedule change that the other party must accept; the bar snaps back until they do.
 */
export default function MilestoneGantt({ view, onProposeDue }: { view: ContractView; onProposeDue: (milestoneId: string, dueAt: Date) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const propose = useRef(onProposeDue);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    propose.current = onProposeDue;
  });

  const data = useMemo(() => {
    const day = 86_400_000;
    const kickoff = new Date(view.contract.acceptedAt ?? view.contract.createdAt);
    let cursor = kickoff.getTime();
    const releasedAt = new Map(view.events.filter((e) => e.type === "CAPTURE_COMPLETED").map((e) => [e.milestoneId, new Date(e.at)]));
    const children: TaskModelConfig[] = view.milestones.map((m) => {
      const due = m.dueAt ? new Date(m.dueAt).getTime() : cursor + m.draft.durationDays * day;
      const startDate = new Date(Math.min(cursor, due - day));
      cursor = due;
      const settled = DONE.includes(m.status) || ["voided", "cancelled"].includes(m.status);
      return {
        id: m.id,
        name: `${m.position + 1}. ${m.draft.title}${m.kind === "change_order" ? " (change order)" : ""}`,
        startDate,
        endDate: new Date(due),
        manuallyScheduled: true,
        percentDone: PROGRESS[m.status] ?? 0,
        eventColor: (COLOR[m.status] ?? "gray") as TaskModelConfig["eventColor"],
        draggable: !settled,
        resizable: settled ? false : "end",
        note: `${m.status.replaceAll("_", " ")} · ${formatMoney(m.priceMinor)}`,
        expanded: false,
        children: [
          {
            id: `pay-${m.id}`,
            name: releasedAt.has(m.id) ? `Paid ${formatMoney(m.priceMinor)}` : `Pays ${formatMoney(m.priceMinor)} on approval`,
            startDate: releasedAt.get(m.id) ?? new Date(due),
            duration: 0,
            manuallyScheduled: true,
            draggable: false,
            resizable: false,
            eventColor: (releasedAt.has(m.id) ? "green" : "gray") as TaskModelConfig["eventColor"],
          },
        ],
      };
    });
    const originals = view.milestones.filter((m) => m.kind === "original");
    return {
      tasks: [
        {
          id: "project",
          name: view.contract.title,
          expanded: true,
          manuallyScheduled: true,
          draggable: false,
          resizable: false,
          startDate: kickoff,
          endDate: new Date(Math.max(cursor, kickoff.getTime() + day)),
          children,
        },
      ] as TaskModelConfig[],
      dependencies: originals.slice(1).map((m, i) => ({ id: `dep-${m.id}`, fromTask: originals[i].id, toTask: m.id })),
      start: new Date(kickoff.getTime() - 2 * day),
      end: new Date(Math.max(cursor, kickoff.getTime()) + 5 * day),
      ids: new Set(view.milestones.map((m) => m.id)),
    };
  }, [view]);

  useEffect(() => {
    let gantt: Gantt | null = null;
    let cancelled = false;
    loadBryntum()
      .then(({ Gantt: GanttClass, StringHelper }) => {
        if (cancelled || !host.current) return;
        const report = (task: TaskModel) => {
          if (data.ids.has(String(task.id)) && task.endDate) propose.current(String(task.id), task.endDate as Date);
        };
        gantt = new GanttClass({
          appendTo: host.current,
          height: "100%",
          project: { tasksData: data.tasks, dependenciesData: data.dependencies },
          startDate: data.start,
          endDate: data.end,
          viewPreset: "weekAndDayLetter",
          rowHeight: 40,
          barMargin: 8,
          columns: [
            { type: "name", field: "name", text: "Milestone", width: 260 },
            { text: "Status", field: "note", width: 190, renderer: ({ value }: { value?: string }) => StringHelper.encodeHtml(value ?? "") },
          ],
          features: { dependencies: { allowCreate: false }, taskEdit: false, taskMenu: false, cellEdit: false },
          listeners: {
            afterTaskDrop: ({ taskRecords, valid }: { taskRecords: TaskModel[]; valid: boolean }) => {
              if (valid) taskRecords.forEach(report);
            },
            taskResizeEnd: ({ changed, taskRecord }: { changed: boolean; taskRecord: TaskModel }) => {
              if (changed) report(taskRecord);
            },
          },
        } as Partial<GanttConfig>);
      })
      .catch((e: Error) => setError(e.message));
    return () => {
      cancelled = true;
      gantt?.destroy();
    };
  }, [data]);

  if (error) return <p className="text-sm text-red-700">{error}</p>;
  return <div ref={host} className="h-[380px] overflow-hidden rounded-md border border-zinc-200 bg-white dark:border-zinc-800" />;
}

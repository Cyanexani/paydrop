"use client";

// Types only: the Gantt itself is Bryntum's prebuilt UMD bundle, served from /vendor/bryntum
// (copied by scripts/copy-vendor.mjs) so the dev server never has to bundle it.
import type { Gantt, GanttConfig, StringHelper as StringHelperType, TaskModel, TaskModelConfig } from "@bryntum/gantt";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatMoney } from "@/lib/money";
import type { ContractView } from "@/server/contracts";
import { useTheme } from "../theme";

interface BryntumGanttNS {
  Gantt: new (config: Partial<GanttConfig>) => Gantt;
  StringHelper: typeof StringHelperType;
}

let loader: Promise<BryntumGanttNS> | null = null;

function loadBryntum(): Promise<BryntumGanttNS> {
  loader ??= new Promise((resolve, reject) => {
    for (const href of ["gantt.css", "fontawesome/css/fontawesome.css", "fontawesome/css/solid.css"]) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = `/vendor/bryntum/${href}`;
      document.head.appendChild(link);
    }
    setBryntumTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
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

/** One Bryntum theme stylesheet, swapped in place when the app's theme changes. */
function setBryntumTheme(theme: "dark" | "light") {
  let link = document.getElementById("bryntum-theme") as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.id = "bryntum-theme";
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }
  const href = `/vendor/bryntum/stockholm-${theme}.css`;
  if (link.getAttribute("href") !== href) link.setAttribute("href", href);
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
// The app's swatch colours: magenta = held at PayPal, peach = being checked, butter = paid.
// Bryntum wants literal colours, so each theme gets its own set (matching the --tone-* tokens).
const TONES = {
  dark: { paid: "#fff7ad", check: "#ffb3ae", held: "#ff49c1", bad: "#ff6b6b", neutral: "#6a4560", pending: "#8a6280", project: "#6a1452" },
  light: { paid: "#f2c230", check: "#f0857d", held: "#e6249f", bad: "#e5484d", neutral: "#cbb3c3", pending: "#b39aab", project: "#b5107b" },
} as const;
type ToneKey = keyof (typeof TONES)["dark"];
const STATUS_TONE: Record<string, ToneKey> = {
  paid_out: "paid",
  payout_pending: "paid",
  released: "paid",
  releasing: "paid",
  release_pending: "paid",
  verified: "check",
  needs_review: "check",
  changes_requested: "check",
  submitted: "check",
  funded: "held",
  funding: "held",
  disputed: "bad",
  voided: "neutral",
  cancelled: "neutral",
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
  const theme = useTheme();

  useEffect(() => {
    propose.current = onProposeDue;
  });

  useEffect(() => {
    if (loader) setBryntumTheme(theme);
  }, [theme]);

  const data = useMemo(() => {
    const tone = TONES[theme];
    const color = (key: ToneKey) => tone[key] as TaskModelConfig["eventColor"];
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
        eventColor: color(STATUS_TONE[m.status] ?? "pending"),
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
            eventColor: color(releasedAt.has(m.id) ? "paid" : "pending"),
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
          eventColor: color("project"),
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
  }, [view, theme]);

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

  if (error) return <p className="text-sm text-[#ffc2c2]">{error}</p>;
  // Header (~76px) plus one 40px row for the project and each milestone, with a little air.
  const height = Math.min(560, 96 + (view.milestones.length + 1) * 40);
  return <div ref={host} style={{ height }} className="overflow-hidden rounded-2xl border border-line bg-raised" />;
}

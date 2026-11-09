import type { CriterionResult } from "@/lib/milestones/state-machine";

export interface CheckCriterion {
  id: string;
  text: string;
  method: "browser" | "file" | "client_judged";
}

export interface CheckStep {
  at: string;
  action: string;
  detail: string;
}

export interface CheckInput {
  evidenceUrl: string;
  criteria: CheckCriterion[];
  /** Where to store a local replay video (when not using Kernel). */
  replayDir?: string;
}

export interface CheckOutput {
  results: CriterionResult[];
  steps: CheckStep[];
  mode: "kernel" | "local" | "basic";
  judge: "claude" | "heuristic";
  replayUrl: string | null;
  /** Local replay video path, served by the app. */
  replayFile: string | null;
  injection: InjectionFinding[];
}

export interface InjectionFinding {
  url: string;
  where: "visible" | "hidden" | "comment" | "attribute" | "meta";
  snippet: string;
}

export interface FormField {
  ref: string;
  tag: string;
  type: string;
  name: string;
  label: string;
  required: boolean;
  options?: string[];
}

export interface PageReport {
  url: string;
  status: number | null;
  title: string;
  metaDescription: string;
  headings: string[];
  text: string;
  links: Array<{ ref: string; text: string; href: string; internal: boolean }>;
  buttons: Array<{ ref: string; text: string }>;
  fields: FormField[];
  images: number;
  horizontalOverflow: boolean;
  viewportWidth: number;
  consoleErrors: string[];
  /** Raw strings from hidden text, comments, attributes and meta tags, for injection scanning. */
  hiddenStrings: Array<{ where: InjectionFinding["where"]; text: string }>;
}

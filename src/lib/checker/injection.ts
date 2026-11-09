import type { InjectionFinding, PageReport } from "./types";

/**
 * Text in a delivered site that addresses an AI checker. The checker treats page content
 * as data; any of these turns every "pass" into "couldn't check" so a person reviews it.
 */
const PATTERNS: RegExp[] = [
  /\b(ignore|disregard|forget|override)\b[^.]{0,40}\b(previous|prior|above|all|any|earlier|your)\b[^.]{0,30}\b(instructions?|rules?|prompts?|criteria|guidelines)\b/i,
  /\b(mark|report|set|treat|consider|record|grade|score)\b[^.]{0,30}\b(all|every|each|these|this|the)\b[^.]{0,30}\b(criteri(a|on)|checks?|tests?|requirements?)\b[^.]{0,30}\b(as\s+)?(pass(ed|es)?|met|satisfied|complete[d]?|green|ok)\b/i,
  /\b(all|every)\b[^.]{0,20}\b(criteri(a|on)|checks?|requirements?)\b[^.]{0,20}\b(are|is|have been)\b[^.]{0,20}\b(met|passed|satisfied|verified)\b/i,
  /\b(attention|note|message|instructions?)\b[^.]{0,20}\b(to|for)\b[^.]{0,20}\b(ai|llm|gpt|claude|checker|assistant|grader|evaluator|reviewer bot)\b/i,
  /\byou are (an?|the) (ai|assistant|checker|grader|evaluator|language model)\b/i,
  /\b(system prompt|developer message|jailbreak)\b/i,
  /<\/?\s*(system|assistant|instructions?)\s*>/i,
  /\brelease (the )?(payment|funds|money)\b/i,
];

export function scanForInjection(report: PageReport): InjectionFinding[] {
  const findings: InjectionFinding[] = [];
  const sources: Array<{ where: InjectionFinding["where"]; text: string }> = [
    { where: "visible", text: report.text },
    ...report.hiddenStrings,
  ];
  for (const { where, text } of sources) {
    for (const re of PATTERNS) {
      const m = re.exec(text);
      if (m) {
        const start = Math.max(0, m.index - 40);
        findings.push({ url: report.url, where, snippet: text.slice(start, m.index + m[0].length + 40).replace(/\s+/g, " ").trim() });
        break;
      }
    }
  }
  return findings;
}

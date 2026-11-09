import { connection } from "next/server";
import { siteFiles } from "@/server/agent";
import { appDb } from "@/server/app-db";

/**
 * Sites built by AI agent workers. Served with a CSP sandbox so the page runs in an opaque
 * origin: script on a delivered page can't use a viewer's MilestonePay session.
 */
export async function GET(_req: Request, ctx: RouteContext<"/deliveries/[contractId]/[[...path]]">) {
  await connection();
  const { contractId, path } = await ctx.params;
  if (!/^ct_[a-z0-9]+$/i.test(contractId)) return new Response("Not found", { status: 404 });
  const files = await siteFiles(await appDb(), contractId);
  const key = `/${(path ?? []).join("/")}`.replace(/\.html$/, "");
  const body = files[key] ?? files[key.replace(/\/$/, "")] ?? null;
  if (body === null) return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain" } });
  // Sitemaps list root-relative paths; make them absolute under this delivery.
  const base = `/deliveries/${contractId}`;
  const isXml = key.endsWith(".xml");
  const content = isXml
    ? body.replace(/<loc>\/?([^<]*)<\/loc>/g, (_m, p: string) => `<loc>${base}/${p}</loc>`)
    : body.replace(/(href|src)="\/(?!\/)/g, `$1="${base}/`);
  return new Response(content, {
    headers: {
      "Content-Type": isXml ? "application/xml" : "text/html; charset=utf-8",
      "Content-Security-Policy": "sandbox allow-scripts allow-forms; default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

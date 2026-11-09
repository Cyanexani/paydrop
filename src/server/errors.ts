import { randomUUID } from "node:crypto";

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what: string) => new AppError(404, "not_found", `${what} not found`);
export const forbidden = (message = "You are not a party to this contract") => new AppError(403, "forbidden", message);
export const badRequest = (message: string, code = "bad_request") => new AppError(400, code, message);

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

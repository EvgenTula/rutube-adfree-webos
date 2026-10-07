import { readFile } from "node:fs/promises";

export function createFixtureHttp(routes) {
  return Object.freeze({
    async json(request) {
      if (request.signal && request.signal.aborted) {
        return { ok: false, error: { code: "cancelled", operation: request.operation } };
      }
      const fixture = routes[request.path];
      if (!fixture) {
        return { ok: false, error: { code: "http", operation: request.operation, status: 404 } };
      }
      return { ok: true, value: JSON.parse(await readFile(fixture, "utf8")) };
    },
    async text(request) {
      if (request.signal && request.signal.aborted) {
        return { ok: false, error: { code: "cancelled", operation: request.operation } };
      }
      const fixture = routes[request.url];
      if (!fixture) {
        return { ok: false, error: { code: "cors-rejected", operation: request.operation } };
      }
      return { ok: true, value: await readFile(fixture, "utf8") };
    },
  });
}

import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, normalize, resolve, sep } from "node:path";

const root = resolve("dist");
const port = Number(process.env.RUTUBE_DEV_PORT || 4173);
const allowedApiPaths = [
  /^\/api\/v2\/video\/recommendation\/main\/?$/,
  /^\/api\/search\/combined\/video_playlist\/?$/,
  /^\/api\/video\/[a-z0-9-]{1,80}\/?$/i,
  /^\/api\/play\/options\/[a-z0-9-]{1,80}\/?$/i,
];
const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
};

function send(response, status, body, headers = {}) {
  response.writeHead(status, { "Cache-Control": "no-store", ...headers });
  response.end(body);
}

async function proxyRutube(request, response, parsed) {
  if (request.method !== "GET") return send(response, 405, "Only GET is allowed");
  if (request.headers.cookie || request.headers.authorization) {
    return send(response, 400, "Credentials are not accepted by the development proxy");
  }
  const upstreamPath = parsed.pathname.slice("/rutube".length);
  if (!allowedApiPaths.some((pattern) => pattern.test(upstreamPath))) {
    return send(response, 404, "RUTUBE route is not allowlisted");
  }
  const upstream = new URL(upstreamPath, "https://rutube.ru");
  upstream.search = parsed.search;
  try {
    const result = await fetch(upstream, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 Chrome/79 Safari/537.36",
      },
      redirect: "error",
    });
    const body = Buffer.from(await result.arrayBuffer());
    send(response, result.status, body, {
      "Content-Type": result.headers.get("content-type") || "application/json; charset=utf-8",
    });
  } catch (_error) {
    send(response, 502, JSON.stringify({ detail: "development proxy upstream failure" }), {
      "Content-Type": "application/json; charset=utf-8",
    });
  }
}

function serveStatic(response, pathname) {
  const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const candidate = resolve(root, normalize(relative));
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) return send(response, 403, "Forbidden");
  if (!existsSync(candidate) || !statSync(candidate).isFile()) return send(response, 404, "Not found");
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": mime[extname(candidate).toLowerCase()] || "application/octet-stream",
  });
  createReadStream(candidate).pipe(response);
}

if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("RUTUBE_DEV_PORT must be a valid port");
if (!existsSync(root)) throw new Error("dist is missing; run npm run build first");

createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") return send(response, 405, "Method not allowed");
  const parsed = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
  if (parsed.pathname.startsWith("/rutube/")) return proxyRutube(request, response, parsed);
  if (request.method === "HEAD") {
    response.writeHead(200, { "Cache-Control": "no-store" });
    return response.end();
  }
  return serveStatic(response, parsed.pathname);
}).listen(port, "127.0.0.1", () => {
  console.log(`Development preview: http://127.0.0.1:${port}`);
  console.log("The /rutube proxy accepts anonymous allowlisted RUTUBE API GET requests only.");
});

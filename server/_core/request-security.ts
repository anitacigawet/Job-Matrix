import type { RequestHandler } from "express";
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";

const LOOPBACK_HOST_PATTERN = /^(127\.0\.0\.1|localhost)(?::([0-9]{1,5}))?$/i;

/**
 * Turn a raw Host header into the one HTTP origin this local process accepts.
 * The raw value is deliberately validated before URL parsing so alternate
 * numeric spellings, subdomains, trailing dots, credentials, and forwarded
 * authorities cannot be normalized into an accepted loopback name.
 */
export function loopbackOriginForHost(
  hostHeader: string | undefined,
  expectedPort: number,
): string | null {
  if (!hostHeader || hostHeader.trim() !== hostHeader) return null;
  if (!Number.isInteger(expectedPort) || expectedPort < 1 || expectedPort > 65_535) {
    return null;
  }

  const match = LOOPBACK_HOST_PATTERN.exec(hostHeader);
  if (!match) return null;

  const hostname = match[1].toLowerCase();
  const portText = match[2];
  if (expectedPort === 80) {
    if (portText !== undefined && portText !== "80") return null;
  } else if (portText !== String(expectedPort)) {
    return null;
  }

  return expectedPort === 80
    ? `http://${hostname}`
    : `http://${hostname}:${expectedPort}`;
}

export function requireLoopbackHost(expectedPort: number): RequestHandler {
  return (req, res, next) => {
    const origin = loopbackOriginForHost(req.headers.host, expectedPort);
    if (!origin) {
      res.status(421).type("text/plain").send("Job Matrix accepts requests only at its local address.");
      return;
    }
    res.locals.jobMatrixOrigin = origin;
    next();
  };
}

type UpgradeListener = (
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
) => void;

/**
 * Wrap the upgrade listeners already installed by the development server.
 * Vite handles WebSocket upgrades outside Express, so the HTTP middleware
 * cannot protect HMR by itself.
 */
export function enforceLoopbackUpgradeHost(server: Server, expectedPort: number): void {
  const listeners = server.listeners("upgrade") as UpgradeListener[];
  if (listeners.length === 0) return;

  server.removeAllListeners("upgrade");
  server.on("upgrade", (request, socket, head) => {
    if (!loopbackOriginForHost(request.headers.host, expectedPort)) {
      socket.end(
        "HTTP/1.1 421 Misdirected Request\r\n"
        + "Connection: close\r\n"
        + "Content-Length: 0\r\n\r\n",
      );
      return;
    }

    for (const listener of listeners) {
      listener.call(server, request, socket, head);
    }
  });
}

/**
 * Browser HTTP access to tRPC is same-origin JSON. Headerless JSON remains
 * available to local command-line clients; server-side createCaller users do
 * not pass through HTTP at all.
 */
export const requireSameOriginTrpc: RequestHandler = (req, res, next) => {
  const expectedOrigin = res.locals.jobMatrixOrigin;
  if (typeof expectedOrigin !== "string") {
    res.status(500).type("text/plain").send("Local request validation was not initialized.");
    return;
  }

  const origin = req.headers.origin;
  if (origin !== undefined && (typeof origin !== "string" || origin !== expectedOrigin)) {
    res.status(403).type("text/plain").send("Cross-origin access to the local Job Matrix API is not allowed.");
    return;
  }

  const fetchSite = req.headers["sec-fetch-site"];
  if (fetchSite !== undefined && fetchSite !== "same-origin") {
    res.status(403).type("text/plain").send("Cross-site access to the local Job Matrix API is not allowed.");
    return;
  }

  if (req.method === "POST") {
    const mediaType = req.headers["content-type"]?.split(";", 1)[0].trim().toLowerCase();
    if (mediaType !== "application/json") {
      res.status(415).type("text/plain").send("The local Job Matrix API accepts JSON requests only.");
      return;
    }
  }

  next();
};

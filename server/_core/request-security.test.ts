import http, { type Server } from "node:http";
import net from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enforceLoopbackUpgradeHost, requireLoopbackHost, requireSameOriginTrpc } from "./request-security";

const APP_PORT = 3042;
let server: Server;
let networkPort: number;
let upgradesHandled = 0;
let apiDownstreamRequests = 0;

type RequestOptions = {
  path?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  omitHost?: boolean;
};

function request(options: RequestOptions = {}) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port: networkPort,
      path: options.path ?? "/healthz",
      method: options.method ?? "GET",
      setHost: !options.omitHost,
      headers: options.headers,
    }, response => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body }));
    });
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function upgrade(host: string) {
  return new Promise<string>((resolve, reject) => {
    const socket = net.connect(networkPort, "127.0.0.1");
    let response = "";
    socket.setEncoding("utf8");
    socket.once("connect", () => {
      socket.write(
        "GET / HTTP/1.1\r\n"
        + `Host: ${host}\r\n`
        + "Connection: Upgrade\r\n"
        + "Upgrade: websocket\r\n"
        + "Sec-WebSocket-Version: 13\r\n"
        + "Sec-WebSocket-Key: ZmljdGlvbmFsLXRlc3Qta2V5\r\n"
        + "Sec-WebSocket-Protocol: vite-ping\r\n\r\n",
      );
    });
    socket.on("data", chunk => { response += chunk; });
    socket.once("end", () => resolve(response));
    socket.once("error", reject);
  });
}

beforeAll(async () => {
  const app = express();
  app.use(requireLoopbackHost(APP_PORT));
  app.get("/healthz", (_req, res) => res.status(204).end());
  app.get("/application-assets/resume.pdf", (_req, res) => res.status(204).end());
  app.get("/oauth/gmail/callback", (_req, res) => res.status(400).send("invalid state"));
  app.use("/api/trpc", requireSameOriginTrpc);
  app.use("/api/trpc", (_req, _res, next) => {
    apiDownstreamRequests += 1;
    next();
  });
  app.use("/api/trpc", (_req, res) => res.status(204).end());
  server = app.listen(0, "127.0.0.1");
  server.on("upgrade", (_request, socket) => {
    upgradesHandled += 1;
    socket.end(
      "HTTP/1.1 101 Switching Protocols\r\n"
      + "Connection: Upgrade\r\n"
      + "Upgrade: websocket\r\n\r\n",
    );
  });
  enforceLoopbackUpgradeHost(server, APP_PORT);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not expose a TCP port.");
  networkPort = address.port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
});

describe("local HTTP request boundary", () => {
  it.each(["127.0.0.1", "localhost"])("accepts the loopback Host %s on the configured port", async hostname => {
    const response = await request({ headers: { Host: `${hostname}:${APP_PORT}` } });
    expect(response.status).toBe(204);
  });

  it.each([
    "attacker.example:3042",
    "localhost.attacker.example:3042",
    "127.0.0.1.attacker.example:3042",
    "localhost.:3042",
    "localhost:3043",
    "localhost:03042",
    "localhost:3042,attacker.example",
  ])("rejects the Host authority %s", async host => {
    const response = await request({ headers: { Host: host } });
    expect(response.status).toBe(421);
  });

  it("rejects a missing Host header before it reaches the application", async () => {
    // Node's HTTP parser rejects an HTTP/1.1 request without Host before
    // Express can return the application's 421 response.
    expect((await request({ omitHost: true })).status).toBe(400);
  });

  it("rejects the confirmed cross-site multipart mutation shape", async () => {
    const before = apiDownstreamRequests;
    const response = await request({
      path: "/api/trpc/personalized.nukeEverything",
      method: "POST",
      headers: {
        Host: `127.0.0.1:${APP_PORT}`,
        Origin: "https://attacker.example",
        "Sec-Fetch-Site": "cross-site",
        "Content-Type": "multipart/form-data; boundary=attack",
      },
      body: "--attack--\r\n",
    });
    expect(response.status).toBe(403);
    expect(apiDownstreamRequests).toBe(before);
  });

  it("rejects a headerless non-JSON POST before it reaches tRPC", async () => {
    const response = await request({
      path: "/api/trpc/personalized.nukeEverything",
      method: "POST",
      headers: {
        Host: `127.0.0.1:${APP_PORT}`,
        "Content-Type": "multipart/form-data; boundary=attack",
      },
      body: "--attack--\r\n",
    });
    expect(response.status).toBe(415);
  });

  it("rejects DNS-rebinding reads and writes before the API handler", async () => {
    for (const testCase of [
      { path: "/api/trpc/onboarding.getProfile", method: "GET" },
      { path: "/api/trpc/settings.saveLlm", method: "POST" },
    ]) {
      const response = await request({
        ...testCase,
        headers: {
          Host: `rebind.attacker.example:${APP_PORT}`,
          Origin: `http://rebind.attacker.example:${APP_PORT}`,
          "Sec-Fetch-Site": "same-origin",
          "Content-Type": "application/json",
        },
        body: testCase.method === "POST" ? '{"json":{}}' : undefined,
      });
      expect(response.status).toBe(421);
    }
  });

  it.each([
    { origin: `http://localhost:${APP_PORT}`, fetchSite: "same-origin" },
    { origin: `http://127.0.0.1:${APP_PORT + 1}`, fetchSite: "same-origin" },
    { origin: "null", fetchSite: "same-origin" },
    { origin: `http://127.0.0.1:${APP_PORT}`, fetchSite: "same-site" },
    { origin: `http://127.0.0.1:${APP_PORT}`, fetchSite: "cross-site" },
  ])("rejects mismatched browser metadata %#", async ({ origin, fetchSite }) => {
    const response = await request({
      path: "/api/trpc/personalized.nukeEverything",
      method: "POST",
      headers: {
        Host: `127.0.0.1:${APP_PORT}`,
        Origin: origin,
        "Sec-Fetch-Site": fetchSite,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: '{"json":null}',
    });
    expect(response.status).toBe(403);
  });

  it.each([
    "/api/trpc/personalized.nukeEverything",
    "/api/trpc/one,two",
    "/api/trpc/%70ersonalized.nukeEverything",
    "/api/trpc/junk/personalized.nukeEverything",
  ])("guards the mounted API representation %s", async path => {
    const response = await request({
      path,
      method: "POST",
      headers: {
        Host: `127.0.0.1:${APP_PORT}`,
        Origin: "https://attacker.example",
        "Content-Type": "application/json",
      },
      body: '{"json":null}',
    });
    expect(response.status).toBe(403);
  });

  it("allows the normal same-origin JSON API request", async () => {
    const response = await request({
      path: "/api/trpc/settings.updateNotifications",
      method: "POST",
      headers: {
        Host: `localhost:${APP_PORT}`,
        Origin: `http://localhost:${APP_PORT}`,
        "Sec-Fetch-Site": "same-origin",
        "Content-Type": "application/json; charset=utf-8",
      },
      body: '{"json":{}}',
    });
    expect(response.status).toBe(204);
  });

  it("allows a headerless local JSON client and GET query", async () => {
    const headers = { Host: `127.0.0.1:${APP_PORT}`, "Content-Type": "application/json" };
    expect((await request({ path: "/api/trpc/settings.updateNotifications", method: "POST", headers, body: '{"json":{}}' })).status).toBe(204);
    expect((await request({ path: "/api/trpc/onboarding.getProfile", headers: { Host: `127.0.0.1:${APP_PORT}` } })).status).toBe(204);
  });

  it("keeps the cross-site Gmail OAuth callback outside the API origin guard", async () => {
    const response = await request({
      path: "/oauth/gmail/callback?state=invalid",
      headers: {
        Host: `127.0.0.1:${APP_PORT}`,
        "Sec-Fetch-Site": "cross-site",
      },
    });
    expect(response.status).toBe(400);
  });

  it("protects local application assets with the global Host guard", async () => {
    expect((await request({ path: "/application-assets/resume.pdf", headers: { Host: `localhost:${APP_PORT}` } })).status).toBe(204);
    expect((await request({ path: "/application-assets/resume.pdf", headers: { Host: `attacker.example:${APP_PORT}` } })).status).toBe(421);
  });

  it("rejects a hostile development WebSocket upgrade before the HMR listener", async () => {
    const before = upgradesHandled;
    expect(await upgrade(`attacker.example:${APP_PORT}`)).toContain("421 Misdirected Request");
    expect(upgradesHandled).toBe(before);
  });

  it("passes a valid loopback WebSocket upgrade to the HMR listener", async () => {
    const before = upgradesHandled;
    expect(await upgrade(`localhost:${APP_PORT}`)).toContain("101 Switching Protocols");
    expect(upgradesHandled).toBe(before + 1);
  });
});

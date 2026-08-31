import "dotenv/config";
import express from "express";
import { createServer } from "http";
import path from "path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { startAutoScanScheduler } from "../auto-scan-scheduler";
import { startWeeklyDigestScheduler } from "../services/weekly-digest";
import { logEnvironmentBanner } from "./environment";
import { initDb } from "../db";
import { ENV } from "./env";
import { LOOPBACK_HOST } from "./network";
import { completeGmailAuthorization } from "../services/gmail-client";
import { startInboxWatcher } from "../services/inbox-watcher";

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    char =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[char] ?? char
  );
}

logEnvironmentBanner();

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.use(express.json({ limit: "15mb" }));
  app.use(express.urlencoded({ limit: "15mb", extended: true }));
  app.get("/healthz", (_req, res) => res.json({ ok: true, mode: "local" }));

  app.get("/oauth/gmail/callback", async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const oauthError =
      typeof req.query.error === "string" ? req.query.error : "";
    try {
      if (oauthError)
        throw new Error(
          `Google authorization was not completed: ${oauthError}`
        );
      if (!code || !state)
        throw new Error(
          "Google did not return a complete authorization response."
        );
      const result = await completeGmailAuthorization(code, state);
      const email = escapeHtml(result.email);
      res
        .type("html")
        .send(
          `<!doctype html><html><body style="font-family:system-ui;padding:2rem;background:#111;color:#eee"><h1>Gmail connected</h1><p>${email} is now connected to Job Matrix. You can close this window.</p><script>window.opener?.postMessage({type:"job-matrix-gmail-connected"}, window.location.origin);window.close();</script></body></html>`
        );
    } catch (error) {
      const message = escapeHtml(
        error instanceof Error ? error.message : "Gmail connection failed."
      );
      res
        .status(400)
        .type("html")
        .send(
          `<!doctype html><html><body style="font-family:system-ui;padding:2rem;background:#111;color:#eee"><h1>Gmail was not connected</h1><p>${message}</p><p>Return to Job Matrix and try again.</p></body></html>`
        );
    }
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // The browser-assisted workflow keeps the user's primary résumé beside the
  // local database. Serving it from loopback gives the user and browser agent a
  // stable download target without exposing the underlying filesystem path.
  const applicationAssetsRoot = path.join(
    path.dirname(ENV.databasePath),
    "application-assets"
  );
  app.use(
    "/application-assets",
    express.static(applicationAssetsRoot, {
      fallthrough: false,
      maxAge: 0,
      dotfiles: "deny",
    })
  );

  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = ENV.port;

  server.listen(port, LOOPBACK_HOST, () => {
    console.log(
      `Server running on http://${LOOPBACK_HOST}:${port}/ (local machine only)`
    );
    startAutoScanScheduler();
    startWeeklyDigestScheduler();
    startInboxWatcher();
  });
}

async function main() {
  await initDb();
  await startServer();
}

main().catch(err => {
  console.error("[Startup] Fatal error:", err);
  process.exit(1);
});

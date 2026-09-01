import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import path from "path";
import { pathToFileURL } from "url";
import { enforceLoopbackUpgradeHost } from "./request-security";

export async function setupVite(app: Express, server: Server, expectedPort: number) {
  // Keep all development-only imports behind this branch. The production
  // server imports serveStatic() from this module, so top-level Vite imports
  // would otherwise make a packaged build depend on the development toolchain.
  const { createServer: createViteServer } = await import("vite");
  const configUrl = pathToFileURL(
    path.resolve(import.meta.dirname, "../..", "vite.config.ts")
  ).href;
  const { default: viteConfig } = (await import(configUrl)) as {
    default: Record<string, unknown>;
  };
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: ["127.0.0.1", "localhost"],
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });
  enforceLoopbackUpgradeHost(server, expectedPort);

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${Date.now()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

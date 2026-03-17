import { randomUUID, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import Fastify from "fastify";

import { parseCommand, toSseMessage, type AgentEvent } from "@jobapplybot/protocol";
import { JobRunner } from "@jobapplybot/runner";
import { FileBackedStore } from "@jobapplybot/storage";

const port = Number(process.env.PORT ?? "4318");
const dataDir = process.env.JOBAPPLYBOT_DATA_DIR ?? path.join(process.cwd(), ".local");
const secretPath = path.join(dataDir, "agent-secret.txt");

async function ensureSecret(): Promise<string> {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    return (await fs.readFile(secretPath, "utf8")).trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }

    const secret = randomUUID();
    await fs.writeFile(secretPath, secret, { encoding: "utf8", mode: 0o600 });
    return secret;
  }
}

function isAuthorized(provided: unknown, expected: string): boolean {
  if (typeof provided !== "string" || provided.trim().length === 0) {
    return false;
  }

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

function isLocalRequest(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1";
}

export async function buildServer() {
  const secret = await ensureSecret();
  const store = new FileBackedStore(dataDir);
  const runner = new JobRunner(store, {
    enableLiveBrowser: true,
    browserProfileDir: path.join(dataDir, "browser-profile"),
    browserChannel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
    browserExecutablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? "",
    browserHeadless: process.env.PLAYWRIGHT_HEADLESS === "1"
  });
  const app = Fastify({ logger: false });
  const subscribers = new Map<string, Set<NodeJS.WritableStream>>();

  const broadcast = (jobId: string, event: AgentEvent) => {
    const targets = subscribers.get(jobId);

    if (!targets) {
      return;
    }

    const payload = toSseMessage(event);

    for (const target of targets) {
      target.write(payload);
    }
  };

  app.get("/health", async () => ({
    ok: true
  }));

  app.get("/events/:jobId", async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const query = request.query as { secret?: string };
    const headerSecret = request.headers["x-jobapplybot-secret"];

    if (!isLocalRequest(request.ip) || !isAuthorized(query.secret ?? headerSecret, secret)) {
      reply.code(401);
      return reply.send({
        ok: false,
        error: "Unauthorized"
      });
    }

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    });
    reply.hijack();
    reply.raw.write(": connected\n\n");

    const set = subscribers.get(jobId) ?? new Set<NodeJS.WritableStream>();
    set.add(reply.raw);
    subscribers.set(jobId, set);

    request.raw.on("close", () => {
      const active = subscribers.get(jobId);

      if (!active) {
        return;
      }

      active.delete(reply.raw);

      if (active.size === 0) {
        subscribers.delete(jobId);
      }
    });
  });

  app.post("/api", async (request, reply) => {
    const providedSecret = request.headers["x-jobapplybot-secret"];

    if (!isLocalRequest(request.ip) || !isAuthorized(providedSecret, secret)) {
      reply.code(401);
      return {
        ok: false,
        error: "Unauthorized"
      };
    }

    try {
      const command = parseCommand(request.body);

      switch (command.command) {
        case "job.capture": {
          const result = await runner.captureJob(command.payload.url, command.payload.source);
          return {
            ok: true,
            jobId: result.jobId
          };
        }
        case "job.start": {
          await runner.startJob(command.payload.jobId, (event) => {
            broadcast(command.payload.jobId, event);
          });

          return {
            ok: true
          };
        }
        case "field.provide": {
          await runner.provideField(
            command.payload.jobId,
            command.payload.requestId,
            command.payload.value,
            command.payload.save,
            (event) => {
              broadcast(command.payload.jobId, event);
            }
          );

          return {
            ok: true
          };
        }
        case "profile.get": {
          return {
            ok: true,
            data: await store.getProfile()
          };
        }
        case "profile.set": {
          await store.setProfile(command.payload.data);
          return {
            ok: true
          };
        }
        case "custom_values.list": {
          return {
            ok: true,
            items: await store.listCustomValues()
          };
        }
        case "custom_values.delete": {
          return {
            ok: true,
            deleted: await store.deleteCustomValue(command.payload.signatureHash)
          };
        }
        case "job.summary": {
          return {
            ok: true,
            summary: await runner.getSummary(command.payload.jobId)
          };
        }
      }
    } catch (error) {
      reply.code(400);
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  });

  return {
    app,
    secret
  };
}

async function start() {
  const { app, secret } = await buildServer();
  await app.listen({
    host: "127.0.0.1",
    port
  });

  console.log(`JobApplyBot agent listening on http://127.0.0.1:${port}`);
  console.log(`Extension secret: ${secret}`);
}

if (require.main === module) {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

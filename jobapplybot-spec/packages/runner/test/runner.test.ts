import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AgentEvent } from "@jobapplybot/protocol";
import { FileBackedStore } from "@jobapplybot/storage";

import { JobRunner } from "../src";

describe("runner", () => {
  let rootDir = "";

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), "jobapplybot-runner-"));
  });

  afterEach(async () => {
    if (rootDir) {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it("pauses for missing required fields and resumes to review", async () => {
    const store = new FileBackedStore(rootDir);
    await store.setProfile({
      fullName: "Ada Lovelace",
      email: "ada@example.com"
    });

    const runner = new JobRunner(store);
    const events: AgentEvent[] = [];
    const greenhouseFixture = path.resolve(process.cwd(), "../../tests/integration/mocks/greenhouse.html");
    const { jobId } = await runner.captureJob(pathToFileURL(greenhouseFixture).toString(), "manual");

    await runner.startJob(jobId, (event) => {
      events.push(event);
    });

    const needFieldEvent = events.find((event) => event.type === "need_field");

    expect(needFieldEvent?.type).toBe("need_field");

    await runner.provideField(
      jobId,
      needFieldEvent && needFieldEvent.type === "need_field" ? needFieldEvent.data.requestId : "",
      "I care about product quality.",
      true,
      (event) => {
        events.push(event);
      }
    );

    const summary = await runner.getSummary(jobId);

    expect(summary?.status).toBe("ready_to_submit");
    expect(summary?.finalStepDetected).toBe(true);
  });
});

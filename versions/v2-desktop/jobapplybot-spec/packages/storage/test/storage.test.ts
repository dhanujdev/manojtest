import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FileBackedStore } from "../src";

describe("storage", () => {
  let rootDir = "";

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), "jobapplybot-storage-"));
  });

  afterEach(async () => {
    if (rootDir) {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it("persists profile and custom values", async () => {
    const store = new FileBackedStore(rootDir);

    await store.setProfile({
      fullName: "Ada Lovelace",
      email: "ada@example.com"
    });
    await store.setCustomValue("signature-1234567890", "Saved value");

    await expect(store.getProfile()).resolves.toEqual({
      fullName: "Ada Lovelace",
      email: "ada@example.com"
    });
    await expect(store.getCustomValue("signature-1234567890")).resolves.toBe("Saved value");
  });
});

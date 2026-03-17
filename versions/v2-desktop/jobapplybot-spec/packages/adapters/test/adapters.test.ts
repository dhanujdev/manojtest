import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import { computeFieldSignature, getAdapterForUrl } from "../src";

describe("adapters", () => {
  it("selects greenhouse and lever adapters", () => {
    expect(getAdapterForUrl("https://boards.greenhouse.io/example/jobs/123")?.adapterName).toBe(
      "GreenhouseAdapter"
    );
    expect(getAdapterForUrl("https://jobs.lever.co/example/role-name")?.adapterName).toBe(
      "LeverAdapter"
    );
  });

  it("keeps field signatures stable", () => {
    expect(computeFieldSignature("Email", "email")).toBe(computeFieldSignature("email", "email"));
  });

  it("extracts fields from greenhouse html deterministically", () => {
    const fixturePath = path.resolve(process.cwd(), "../../tests/integration/mocks/greenhouse.html");
    const html = readFileSync(fixturePath, "utf8");
    const adapter = getAdapterForUrl(pathToFileURL(fixturePath).toString());

    expect(adapter).not.toBeNull();

    const model = adapter?.buildModel({
      url: pathToFileURL(fixturePath),
      html
    });

    expect(model?.fields.some((field) => field.label.includes("Why are you interested"))).toBe(true);
    expect(model?.finalStepDetected).toBe(true);
  });
});

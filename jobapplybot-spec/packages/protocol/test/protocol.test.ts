import { describe, expect, it } from "vitest";

import { isSubmitLabel, parseCommand } from "../src";

describe("protocol", () => {
  it("parses valid commands", () => {
    const command = parseCommand({
      command: "job.capture",
      payload: {
        url: "https://boards.greenhouse.io/example/jobs/123",
        source: "manual"
      }
    });

    expect(command.command).toBe("job.capture");
  });

  it("rejects invalid commands", () => {
    expect(() =>
      parseCommand({
        command: "job.capture",
        payload: {
          url: "not-a-url",
          source: "manual"
        }
      })
    ).toThrow();
  });

  it("detects submit labels deterministically", () => {
    expect(isSubmitLabel("Submit Application")).toBe(true);
    expect(isSubmitLabel("Review")).toBe(false);
  });
});

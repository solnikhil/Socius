import { test } from "node:test";
import assert from "node:assert/strict";
import { googleCalendar } from "../src/google-calendar.js";
import { curatedCatalog } from "@socius/marketplace/curated";
import { verifyManifest, type McpToolClient } from "../src/index.js";
import type { ConnectorManifest } from "@socius/contracts";
test("Calendar binds UTC instants before approval and cannot invite attendees", async () => {
  assert.deepEqual(
    verifyManifest(
      curatedCatalog.find(
        (p) => p.id === googleCalendar.id,
      ) as ConnectorManifest,
    ),
    [],
  );
  const action = googleCalendar.actions.find((a) => a.access === "write")!;
  const input = {
    summary: "Focus",
    startTime: "2026-11-01T01:30:00-04:00",
    endTime: "2026-11-01T01:30:00-05:00",
  };
  const parsed = action.input.parse(input);
  assert.equal(parsed.startTime, "2026-11-01T05:30:00.000Z");
  assert.equal(parsed.endTime, "2026-11-01T06:30:00.000Z");
  for (const bad of [
    { ...input, startTime: "2026-11-01T01:30:00" },
    { ...input, endTime: input.startTime },
    { ...input, attendees: [{ email: "person@example.com" }] },
    { ...input, recurrenceData: ["RRULE:FREQ=DAILY"] },
  ])
    assert.equal(action.input.safeParse(bad).success, false);
  let called: unknown;
  const client: McpToolClient = {
    listTools: async () => [],
    close: async () => {},
    callTool: async (name, args) => {
      called = { name, args };
      return { text: "event-id", isError: false };
    },
  };
  await action.execute(client, parsed);
  assert.deepEqual(called, {
    name: "create_event",
    args: { ...parsed, timeZone: "UTC", notificationLevel: "NONE" },
  });
});

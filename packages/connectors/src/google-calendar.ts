import { z } from "zod";
import type { ReviewedConnector } from "./index.js";
import { reviewedAction, reference } from "./actions.js";
// Normalize explicit-offset instants before approval. Never infer a timezone from host locale.
const instant = z.iso
  .datetime({ offset: true })
  .transform((s) => new Date(s).toISOString());
const range = {
  calendarId: reference.default("primary"),
  startTime: instant,
  endTime: instant,
};
const ordered = (a: { startTime: string; endTime: string }) =>
  Date.parse(a.endTime) > Date.parse(a.startTime);
export const googleCalendar: ReviewedConnector = {
  id: "socius/google-calendar",
  serverUrl: "https://calendarmcp.googleapis.com/mcp/v1",
  accountLabel: "Google Calendar account",
  oauth: {
    scopes: ["https://www.googleapis.com/auth/calendar.events"],
    clientIdEnv: "SOCIUS_CALENDAR_CLIENT_ID",
    clientSecretEnv: "SOCIUS_CALENDAR_CLIENT_SECRET",
    authorizationParams: { access_type: "offline", prompt: "consent" },
  },
  requiredTools: {
    list_events: ["calendarId", "startTime", "endTime", "pageSize"],
    create_event: [
      "calendarId",
      "summary",
      "startTime",
      "endTime",
      "timeZone",
      "notificationLevel",
    ],
  },
  actions: [
    reviewedAction({
      id: "calendar.list-events",
      upstream: "list_events",
      access: "read",
      capability: "calendar.read",
      description: "List calendar events in an explicit time window.",
      schema: z
        .strictObject({
          ...range,
          pageSize: z.number().int().min(1).max(50).default(20),
        })
        .refine(ordered, "End must be after start")
        .refine(
          (a) =>
            Date.parse(a.endTime) - Date.parse(a.startTime) <= 366 * 86400000,
          "Choose at most one year",
        ),
      describe: ({ calendarId, startTime, endTime }) =>
        `Read events in ${calendarId} from ${startTime} to ${endTime}`,
    }),
    reviewedAction({
      id: "calendar.create-event",
      upstream: "create_event",
      access: "write",
      capability: "calendar.write",
      description:
        "Propose a timed event with no attendees or invitations. Exact calendar and UTC times require approval.",
      schema: z
        .strictObject({
          ...range,
          summary: z.string().trim().min(1).max(200),
          description: z.string().max(20000).default(""),
        })
        .refine(ordered, "End must be after start")
        .refine(
          (a) =>
            Date.parse(a.endTime) - Date.parse(a.startTime) <= 7 * 86400000,
          "Choose at most seven days",
        ),
      arguments: (args) => ({
        ...args,
        timeZone: "UTC",
        notificationLevel: "NONE",
      }),
      describe: ({ calendarId, summary, startTime, endTime }) =>
        `Create “${summary}” in ${calendarId}, ${startTime}–${endTime} (UTC; no invitations)`,
    }),
  ],
};

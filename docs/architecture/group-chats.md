# Group chats

Status: implemented. Group chats are the conversational way bots work together. [Boards](teams.md) are the structured alternative, with planned task graphs and budgets. Both ship together.

![A group chat where Socius brings in Planner](../assets/socius-group-chat.png)

## Model

A **group chat** (`GroupChat` in `packages/contracts/src/app.ts`) is a name and a list of specialist bots. **Socius, the main bot, coordinates every group.** It is never listed as a member and cannot be removed. Groups hold 1–8 members. The thread is an ordinary list of `Message` records carrying `groupId`, so group messages never appear in any bot's direct chat.

When the user sends a message (`POST /api/groups/chat`):

1. **Socius runs** with its usual instructions plus a briefing. The briefing lists every member's name, role and instructions, clipped to 1,200 characters each. Socius sees the group history as one conversation, with members' replies attributed to them.
2. Socius may call **`askMember(member, request)`**. The named member then runs:
   - with **its own instructions, skills and memory grants**, never Socius's;
   - with the last 20 group messages as context;
   - with the coordinator's request.

   Its reply streams into the thread under its own name and is returned to Socius. Members have no `askMember` or `createBot` tool, so they cannot delegate or recurse.
3. Socius writes the **final reply**, which builds on the members' replies rather than repeating them.

Limits:
- Up to 6 member requests per user message; further requests are refused with a message telling Socius to answer.
- 10 tool-loop steps for the coordinator.
- A 5-minute wall-clock limit for the whole turn.
- One running reply per group at a time.

Stopping the task (`/api/tasks/cancel`) aborts the coordinator and any member call in progress. Membership edits apply to the next member request.

Approvals from group work, such as a member's memory proposal or Socius proposing a bot, appear inline in the group chat. They also appear in the proposing bot's own chat. Each still checks that bot's grants on approval.

## UI

Group chats use the same chat view as direct chats: floating name pill, bubbles and composer. The differences:
- A small avatar and name label marks each run of replies from one bot.
- The pill opens the roster, **Edit members** and **Delete group chat**.
- Create a group from **New group chat** in the sidebar, or press ⌘2 in the `To:` palette. Groups are listed under **Group chats** in the sidebar.

## API

```http
POST   /api/groups          {"name"?, "memberIds": ["<bot>", …]}   → 201 GroupChat (name defaults to member names)
POST   /api/groups/update   {"id", "name"?, "memberIds"?}           → 200 GroupChat
DELETE /api/groups          {"id"}                                  → 200 (409 while a reply is running; deletes its messages)
GET    /api/groups/messages?groupId=…                               → Message[]
POST   /api/groups/chat     {"groupId", "content", "attachment"?}   → NDJSON stream
```

Stream events:
- `started` (`taskId`)
- `text` (`botId` of whoever is writing, plus the text so far)
- `message`: a member's finished reply
- `done` or `error`, as in direct chats

`GET /api/state` includes `groups`.

## Limitations

- Members answer only when Socius asks them. Users cannot address a member directly with an @mention yet.
- Member calls run one at a time, never in parallel.
- No shared group files beyond chat attachments.
- Model calls are not checkpointed. An interrupted reply is marked failed and must be resent.
- Deterministic fixtures exercise the API and UI. No live-model group run has been recorded yet.

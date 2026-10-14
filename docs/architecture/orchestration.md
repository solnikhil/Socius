# Socius as orchestrator

Socius coordinates the user's specialist bots from its own chat. Boards stay retired, and group chats remain the place where several bots keep working together.

## Asking a specialist (automatic)

In Socius's direct chat, the model has `askBot(bot, request)`. Asking runs immediately, without a review card. This is the policy the user chose: reads and questions are automatic, and changes need approval.

- **What the specialist receives:** only Socius's request, with its own framing (Socius is asking on the user's behalf, and the request is a task, not the user's words). It answers with its own model, memory recall, skills and connected apps. It never sees Socius's history.
- **How the thread reads:** Socius's text so far, then the specialist's reply, then the rest of Socius's reply. The specialist's reply is stored in Socius's chat with `delegated: { botId, request }`, and the UI labels it with the specialist's name and the request. It never appears in the specialist's own chat.
- **Limits:** at most 6 asks per user message. A repeated request is answered from the first reply. An unknown name returns the roster.
- **App changes:** a change the specialist proposes in a connected app still needs the user's approval. Its review card appears in Socius's chat, and the specialist's reply waits for it.

## Changing the workspace (approved each time)

These proposals show a review card and wait, up to 15 minutes and outside the task deadline. Socius then receives `done`, `declined`, `declined-with-feedback` (with the user's text) or `still-waiting`.

| Tool | Approval kind | Applies |
| --- | --- | --- |
| `createBot` | `bot` | A fresh specialist with no grants. The reviewer picks its look. |
| `updateBot` | `bot-update` | Only the proposed name, role or instructions. Socius itself cannot be edited this way. |
| `createGroupChat` | `group` | A group chat with the named members (1–8). |
| `changeGroupMembers` | `group-members` | The proposed final member list. It is refused while that group is replying. |

Names resolve to existing bots and groups when the proposal is made. Approval rechecks them against the current state. `POST /api/approvals` accepts `feedback` (decline only), which is stored on the approval and returned to Socius.

**Stopping and ending:** Stop or shutdown ends the wait. So does a reply that finishes without waiting for its proposal. In each case the card stays pending until it expires.

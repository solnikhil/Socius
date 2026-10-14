# R01 milestone: private phone access

This milestone extends the Electron-owned runtime. It does not run a second browser runtime, replicate a workspace, enable a cloud worker, or complete all of [Issue #12](https://github.com/solnikhil/Socius/issues/12).

## Trust and data boundaries

The shared web UI connects over private Tailscale Serve HTTPS to the same loopback runtime used by Electron. Tailscale controls network reach; Socius pairs browsers, authenticates each session and authorizes each action. Tailnet membership and Tailscale identity headers are not app authentication. Local processes on the host remain inside the trusted host boundary: a process able to read the workspace or impersonate loopback traffic is not isolated by this feature.

Remote access defaults off. Only a paired local browser can enable it, configure its one canonical `https://machine.tailnet.ts.net` origin, create a pairing challenge or revoke other devices. There is no remote CLI, shell, Electron IPC, keychain interface, arbitrary filesystem route or credential export. New API routes are local-only until added to the explicit remote allowlist. Provider credentials/setup, connector OAuth initiation/verification, package import/install/export, and host configuration return “Do this on your laptop.” The OAuth callback remains local-only.

Host selects an exact configured origin; forwarded headers cannot select another. Tailscale Serve preserves Host and sends X-Forwarded-Host/Proto/For. When present, these must match Host, HTTPS and a single valid IP respectively; other forwarded headers and Funnel requests are rejected. Identity/IP metadata never supplies app authority or pairing consent. Direct localhost requests with forwarded headers are rejected. Mutations require the matching Origin, and cross-site requests are rejected. No wildcard CORS or network bind is added.

Devices have independent 256-bit session tokens; SQLite stores only SHA-256 hashes and public metadata. Remote cookies use `__Host-socius_remote`, Secure, HttpOnly, SameSite=Strict, Path=/ and a 30-day lifetime renewed on authenticated use. Local cookies remain separate. Pairing challenges are single-use, expire after five minutes, have high-entropy link material and an alternative six-digit code, and allow at most five exchange attempts per minute across all clients. Starting another challenge invalidates the previous one; challenges do not survive restart. QR generation is local in the browser, with no external QR service. The link's fragment is removed from history immediately and never sent in the request URL. Pairing information is not placed in browser storage, logs or activity.

Revocation closes the device's active HTTP streams immediately and blocks subsequent requests. Expiry/configuration are checked during open responses every second. Disabling remote access or changing its origin revokes all remote sessions and invalidates pairing material. Already accepted tasks and external writes continue independently of the phone connection; revocation does not undo accepted actions. Cancel a task explicitly before revoking if it should stop. Existing action grants, exact digests, expiration and the shared broker still govern approvals; no second approval engine is added.

## Host lifecycle and setup

1. Install/sign in to Tailscale on the laptop and phone, enable HTTPS prerequisites, and restrict access with tailnet policy. These are manual owner actions.
2. Start Socius through Electron. Do not start `npm run web` for phone access: it can use another data directory and lacks the desktop credential bridge.
3. Open Settings → Remote access & devices. Enter the laptop's exact Tailscale HTTPS origin and enable remote access.
4. Inspect existing Serve configuration yourself before using its HTTPS 443 root route. If it belongs to another service, resolve that conflict first; Socius does not overwrite or reset any configuration automatically.
5. Run the command printed in Settings, using the actual target. The preferred port is 47613:

   ```sh
   tailscale serve --bg --https=443 http://127.0.0.1:47613
   ```

6. Click Pair a phone. On the phone, with Tailscale connected, scan the QR or open the private link. Alternatively open the configured HTTPS URL and enter the six-digit code. Review the device label and tap Pair this phone.

The Electron utility process remembers its chosen port. `SOCIUS_RUNTIME_PORT` sets the preferred initial port; otherwise 47613 is used. A remembered port is retried first; a collision tries up to 20 following ports. A changed target is shown as “Serve target needs updating”; the owner must update Serve and save settings to acknowledge it. CLI detection only checks executable presence on PATH: it does not prove sign-in, version support, HTTPS, routing or policy readiness.

Socius never runs Tailscale commands or changes tailnet, SSH, OS power or firewall settings. A manually configured `--bg` Serve proxy can outlive Socius. If the app stops or its port changes, the owner must remove/update the old target before another service uses that port. Automatic service ownership/teardown, port-reuse protection beyond the running process and platform-specific daemon lifecycle are remaining #12 work; this manual milestone does not claim those guarantees.

To disable: turn off remote access locally (sessions are revoked), then inspect Serve and stop the Socius-only listener:

```sh
tailscale serve --https=443 off
```

`tailscale serve reset` removes all Serve configuration; do not use it when unrelated services exist. Even the listener-specific `off` command can affect other routes on HTTPS 443, so check ownership first. No automatic cleanup command is executed.

The laptop must remain awake, connected and running Socius. There is no wake-on-demand, lid-closed guarantee or closed-app execution. Cloud model providers continue to receive context routed to them. A private HTTPS hostname/certificate can expose hostname metadata; choose a non-sensitive device name.

## Reconnect and retry semantics

Every phone send, cancellation and approval carries an Idempotency-Key. SQLite reserves `(device, key)` before execution, hashes the route/payload, and stores the result or original task ID. Reusing a key for different content returns 409. Repeating the same accepted request returns its saved result without executing again. A crash before a result/task ID is recorded leaves an explicitly uncertain reservation; refresh rather than silently replaying it. Receipts persist for the session's lifetime and are bounded to 20,000 per device. Old receipts are not silently evicted into executable requests.

The client retains an uncertain request key only in memory for a deliberate retry, never schedules offline sends, and aborts the phone's fetch when it goes offline or returns to the foreground. That does not cancel the host task. The active chat recovers through `/api/chats/:id?since=<lastEventId>` and the workspace state API. This returns an authoritative bounded snapshot (last 500 messages, 100 tasks), including changes to a partial assistant message. `since` is a hint, not a claim of an append-only event log or byte-for-byte stream replay.

The banner distinguishes offline and expired/revoked sessions. A reachability failure says the laptop may be asleep, Socius stopped, or Tailscale disconnected; a browser cannot reliably distinguish those causes. Text attachments remain bounded by the existing supported format/size checks; no new PDF/image parsing is claimed. Responses use private/no-store API caching; there is no service worker or offline action queue. No session material or workspace content is written to browser persistent storage by this feature.

## Manual acceptance — owner runs on a real phone

All boxes below remain unverified until tested on an authorized real tailnet/device:

- [ ] Laptop: start Electron, configure origin, run the printed Serve command; desktop still sees the same bots and models.
- [ ] Phone on mobile data with Tailscale: scan QR, confirm label, pair; the URL contains no challenge afterward.
- [ ] Chat with Socius; desktop and phone show the same message/result.
- [ ] During a response, enable airplane mode then reconnect. The saved conversation recovers, with one user message and one task.
- [ ] Cancel a running task from the phone; confirm its host state is cancelled.
- [ ] Approve one exact pending action from the phone; desktop shows the same resolution and external effect happens at most once where the existing broker can guarantee it.
- [ ] Revoke the phone locally during a stream; the stream stops and subsequent access is denied. Host tasks are handled explicitly.
- [ ] Restart Socius and confirm the target/readiness state; update Serve if needed. A revoked session remains revoked.
- [ ] A client blocked by tailnet policy cannot reach the app; an allowed but unpaired browser cannot read its state.
- [ ] Disable remote access and perform the owner-reviewed listener teardown without affecting unrelated services.

## Evidence and remaining issue scope

Automated evidence on 14 October 2026: `npm run check` passed all 120 tests; `npm run catalog:check` and `npm run build` passed; `npm run test:e2e` passed all four tests, including Electron restart and the phone HTTPS flow. The latest focused phone run also passed after hiding host-only provider entry on the phone. [Phone-width fixture screenshot](../assets/remote-access-phone-fixture.png). The browser fixture uses a local HTTPS proxy that mirrors Serve headers and a second isolated mobile browser context; it is not physical iOS/Android, live Tailscale, live model or live connector evidence. SSH recovery, platform/version matrix, full service ownership/lifecycle/teardown evidence, and real tailnet acceptance remain in #12. Scheduling #10, Dreaming #8 and per-bot skill assignment #13 are not implemented by this milestone.

References: [Serve](https://tailscale.com/docs/features/tailscale-serve), [Serve CLI](https://tailscale.com/docs/reference/tailscale-cli/serve), [Serve proxy implementation](https://github.com/tailscale/tailscale/blob/main/ipn/ipnlocal/serve.go).

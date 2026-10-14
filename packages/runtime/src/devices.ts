import {
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { PairedDevice, PhonePairing } from "@socius/contracts/app";
import type { Store } from "./store.js";
import { fail } from "./http.js";

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const matches = (a: string, b: string) =>
  timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
const LIFETIME = 30 * 86400000;
type Challenge = { tokenHash: string; codeHash: string; expires: number };
/** Sessions survive restart; bootstrap and short-lived pairing challenges deliberately do not. */
export class DeviceService {
  private challenge: Challenge | undefined;
  private attempts: number[] = [];
  private streams = new Map<string, Set<() => void>>();
  constructor(
    private store: Store,
    private now = () => Date.now(),
  ) {}
  create(label: string, kind: PairedDevice["originKind"]) {
    const token = randomBytes(32).toString("hex"),
      id = randomUUID();
    const now = new Date(this.now()).toISOString(),
      expires = new Date(this.now() + LIFETIME).toISOString();
    this.store.db
      .prepare("INSERT INTO devices VALUES(?,?,?,?,?,?,NULL,?)")
      .run(id, label, hash(token), now, now, expires, kind);
    this.store.event("device.paired", `Paired a ${kind} browser.`);
    return { token, device: this.list().find((d) => d.id === id)! };
  }
  list(): PairedDevice[] {
    return this.store.db
      .prepare(
        "SELECT id,label,created_at,last_used_at,expires_at,revoked_at,origin_kind FROM devices ORDER BY created_at DESC LIMIT 200",
      )
      .all()
      .map((r) => ({
        id: String(r.id),
        label: String(r.label),
        createdAt: String(r.created_at),
        lastUsedAt: String(r.last_used_at),
        expiresAt: String(r.expires_at),
        revokedAt: r.revoked_at === null ? null : String(r.revoked_at),
        originKind: r.origin_kind as PairedDevice["originKind"],
      }));
  }
  authenticate(
    token: string,
    kind: PairedDevice["originKind"],
    touch = true,
  ): PairedDevice {
    if (!/^[a-f0-9]{64}$/.test(token))
      fail(401, "Pair this browser with Socius first");
    const row = this.store.db
      .prepare("SELECT * FROM devices WHERE token_hash=?")
      .get(hash(token));
    if (!row || !matches(String(row.token_hash), hash(token)))
      return fail(401, "Session expired or revoked. Pair this browser again.");
    if (
      row.revoked_at ||
      row.origin_kind !== kind ||
      Date.parse(String(row.expires_at)) <= this.now()
    )
      fail(401, "Session expired or revoked. Pair this browser again.");
    if (touch)
      this.store.db
        .prepare("UPDATE devices SET last_used_at=?, expires_at=? WHERE id=?")
        .run(
          new Date(this.now()).toISOString(),
          new Date(this.now() + LIFETIME).toISOString(),
          String(row.id),
        );
    return {
      id: String(row.id),
      label: String(row.label),
      createdAt: String(row.created_at),
      lastUsedAt: String(row.last_used_at),
      expiresAt: String(row.expires_at),
      revokedAt: null,
      originKind: kind,
    };
  }
  pairing(): PhonePairing {
    const token = randomBytes(32).toString("hex"),
      code = randomInt(0, 1000000).toString().padStart(6, "0"),
      expires = this.now() + 300000;
    this.challenge = { tokenHash: hash(token), codeHash: hash(code), expires };
    this.store.event(
      "device.pairing",
      "Phone pairing started; expires in five minutes.",
    );
    return { token, code, expiresAt: new Date(expires).toISOString() };
  }
  exchange(value: string, label: string) {
    this.attempts = this.attempts.filter((t) => t > this.now() - 60000);
    if (this.attempts.length >= 5)
      fail(429, "Too many pairing attempts. Wait one minute.");
    this.attempts.push(this.now());
    const c = this.challenge;
    if (
      !c ||
      c.expires <= this.now() ||
      !(matches(c.tokenHash, hash(value)) || matches(c.codeHash, hash(value)))
    )
      fail(403, "Invalid or expired pairing challenge");
    this.challenge = undefined;
    return this.create(label, "remote");
  }
  clearPairing() {
    this.challenge = undefined;
  }
  revoke(id: string) {
    this.store.db
      .prepare(
        "UPDATE devices SET revoked_at=? WHERE id=? AND revoked_at IS NULL",
      )
      .run(new Date(this.now()).toISOString(), id);
    for (const close of this.streams.get(id) ?? []) close();
    this.streams.delete(id);
    this.store.event("device.revoked", "A browser session was revoked.");
  }
  revokeRemote() {
    for (const d of this.store.db
      .prepare(
        "SELECT id FROM devices WHERE origin_kind='remote' AND revoked_at IS NULL",
      )
      .all())
      this.revoke(String(d.id));
    this.clearPairing();
  }
  track(id: string, close: () => void) {
    const set = this.streams.get(id) ?? new Set();
    set.add(close);
    this.streams.set(id, set);
    return () => {
      set.delete(close);
      if (!set.size) this.streams.delete(id);
    };
  }
  close() {
    for (const set of this.streams.values()) for (const close of set) close();
    this.streams.clear();
  }
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/store.js";
import { DeviceService } from "../src/devices.js";
test("device tokens are hashed, pairing is bounded/single-use, revocation survives restart and closes streams", async () => {
  const dir = await mkdtemp(join(tmpdir(), "socius-devices-"));
  let store = new Store(dir);
  let now = Date.now();
  let svc = new DeviceService(store, () => now);
  try {
    const challenge = svc.pairing();
    const { token, device } = svc.exchange(challenge.code, "My phone");
    assert.equal(svc.authenticate(token, "remote").id, device.id);
    assert.ok(
      !JSON.stringify(store.db.prepare("SELECT * FROM devices").all()).includes(
        token,
      ),
    );
    assert.throws(() => svc.exchange(challenge.token, "replay"), /Invalid/);
    let closed = false;
    svc.track(device.id, () => {
      closed = true;
    });
    svc.revoke(device.id);
    assert.ok(closed);
    assert.throws(() => svc.authenticate(token, "remote"), /revoked/);
    store.close();
    store = new Store(dir);
    svc = new DeviceService(store, () => now);
    assert.throws(() => svc.authenticate(token, "remote"), /revoked/);
    const expired = svc.pairing();
    now += 300001;
    assert.throws(() => svc.exchange(expired.token, "expired"), /expired/);
    for (let i = 0; i < 4; i++)
      assert.throws(() => svc.exchange("bad", "bad"), /Invalid/);
    assert.throws(() => svc.exchange("bad", "bad"), /Too many/);
    const local = svc.create("Desktop", "local");
    now += 31 * 86400000;
    assert.throws(() => svc.authenticate(local.token, "local"), /expired/);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

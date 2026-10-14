import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { BoardTask } from "@socius/contracts/app";
import { columnOf, validatePlan } from "../src/index.js";

const a = randomUUID(),
  b = randomUUID(),
  source = randomUUID();
const board = { memberIds: [a, b], sourceIds: [source], maxTasks: 4 };
const task = (key: string, dependsOn: string[] = [], assigneeId = a) => ({
  key,
  title: key,
  instructions: `Do ${key}`,
  assigneeId,
  dependsOn,
  sourceIds: [],
});

test("a bounded acyclic plan over board members is accepted", () => {
  const result = validatePlan(
    {
      summary: "Research then write.",
      tasks: [
        { ...task("research"), sourceIds: [source] },
        task("draft", ["research"], b),
      ],
    },
    board,
  );
  assert.deepEqual(result.errors, []);
  assert.equal(result.plan?.tasks.length, 2);
});

test("circular, self and unknown dependencies are rejected", () => {
  for (const tasks of [
    [task("x", ["y"]), task("y", ["x"])],
    [task("x", ["x"])],
    [task("x", ["missing"])],
  ])
    assert.equal(validatePlan({ summary: "s", tasks }, board).plan, null);
  assert.match(
    validatePlan(
      { summary: "s", tasks: [task("x", ["y"]), task("y", ["x"])] },
      board,
    ).errors[0]!,
    /circular/,
  );
});

test("plans cannot reach outside the board or exceed the per-run task budget", () => {
  const outsider = validatePlan(
    { summary: "s", tasks: [task("x", [], randomUUID())] },
    board,
  );
  assert.match(outsider.errors[0]!, /outside this board/);
  const unshared = validatePlan(
    { summary: "s", tasks: [{ ...task("x"), sourceIds: [randomUUID()] }] },
    board,
  );
  assert.match(unshared.errors[0]!, /unshared source/);
  const large = validatePlan(
    { summary: "s", tasks: ["a", "b", "c", "d", "e"].map((k) => task(k)) },
    board,
  );
  assert.match(large.errors[0]!, /allows 4 per run/);
  const duplicate = validatePlan(
    { summary: "s", tasks: [task("x"), task("x")] },
    board,
  );
  assert.match(duplicate.errors[0]!, /Duplicate task key/);
});

test("blocked work and pending approvals surface under Needs input", () => {
  const base = {
    boardId: "b",
    runId: "r",
    title: "t",
    instructions: "i",
    assigneeId: a,
    sourceIds: [],
    result: null,
    error: null,
    attempts: 0,
    createdAt: "",
    startedAt: null,
    finishedAt: null,
  };
  const failed: BoardTask = {
    ...base,
    id: "1",
    key: "one",
    dependsOn: [],
    state: "failed",
  };
  const waiting: BoardTask = {
    ...base,
    id: "2",
    key: "two",
    dependsOn: ["one"],
    state: "backlog",
  };
  const done: BoardTask = {
    ...base,
    id: "3",
    key: "three",
    dependsOn: [],
    state: "done",
  };
  const tasks = [failed, waiting, done];
  assert.equal(columnOf(failed, tasks), "history");
  assert.equal(columnOf(waiting, tasks), "review");
  assert.equal(columnOf(done, tasks), "done");
  assert.equal(
    columnOf(done, tasks, [
      {
        id: "p",
        botId: a,
        taskId: "3",
        kind: "memory",
        content: "c",
        payload: "c",
        digest: "d",
        state: "pending",
        expiresAt: "",
        createdAt: "",
      },
    ]),
    "review",
  );
});

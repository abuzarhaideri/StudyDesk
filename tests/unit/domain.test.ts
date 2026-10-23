import { describe, expect, it } from "vitest";
import {
  applyCommand,
  focusToday,
  initialState,
  localDay,
  reconcile,
  remaining,
  StateSchema,
} from "../../shared/domain";
const draft = {
  title: "Study algebra",
  description: "Chapter 2",
  priority: "high" as const,
  category: "Math",
  dueDate: "2026-10-23",
};
describe("Task lifecycle and validation", () => {
  it("creates, edits, completes, reopens and deletes a task with timestamps", () => {
    let s = applyCommand(
      initialState(),
      { type: "task.create", data: draft },
      100,
    );
    const id = s.tasks[0].id;
    expect(s.tasks[0]).toMatchObject({
      ...draft,
      completed: false,
      completedAt: null,
      createdAt: 100,
    });
    s = applyCommand(
      s,
      { type: "task.edit", id, data: { ...draft, title: "Practice algebra" } },
      200,
    );
    expect(s.tasks[0]).toMatchObject({
      title: "Practice algebra",
      createdAt: 100,
      updatedAt: 200,
    });
    s = applyCommand(s, { type: "task.toggle", id }, 300);
    expect(s.tasks[0]).toMatchObject({ completed: true, completedAt: 300 });
    s = applyCommand(s, { type: "task.toggle", id }, 400);
    expect(s.tasks[0]).toMatchObject({ completed: false, completedAt: null });
    expect(applyCommand(s, { type: "task.delete", id }).tasks).toHaveLength(0);
  });
  it.each([
    { title: "  " },
    { title: "a".repeat(201) },
    { priority: "critical" },
    { dueDate: "2026-02-31" },
    { dueDate: "<script>" },
  ])("rejects invalid task input %j", (patch) => {
    expect(() =>
      applyCommand(initialState(), {
        type: "task.create",
        data: { ...draft, ...patch },
      }),
    ).toThrow();
  });
  it("rejects unrecognized commands and invalid IDs", () => {
    expect(() =>
      applyCommand(initialState(), { type: "execute", data: "anything" }),
    ).toThrow();
    expect(() =>
      applyCommand(initialState(), { type: "task.delete", id: "../file" }),
    ).toThrow();
  });
  it("does not mutate the original state", () => {
    const s = initialState();
    applyCommand(s, { type: "task.create", data: draft });
    expect(s.tasks).toEqual([]);
  });
});
describe("Notes and settings", () => {
  it("creates, edits, pins and removes plain text notes", () => {
    let s = applyCommand(initialState(), { type: "note.create" }, 10);
    const id = s.notes[0].id;
    s = applyCommand(
      s,
      {
        type: "note.edit",
        id,
        data: {
          title: "Revision",
          body: "<script>literal text</script>",
          pinned: true,
        },
      },
      20,
    );
    expect(s.notes[0]).toMatchObject({
      title: "Revision",
      pinned: true,
      createdAt: 10,
      updatedAt: 20,
    });
    expect(applyCommand(s, { type: "note.delete", id }).notes).toEqual([]);
  });
  it("rejects missing notes instead of pretending to save", () => {
    expect(() =>
      applyCommand(initialState(), {
        type: "note.edit",
        id: crypto.randomUUID(),
        data: { title: "", body: "", pinned: false },
      }),
    ).toThrow("no longer exists");
  });
  it("validates settings and updates idle durations", () => {
    const s = initialState();
    const next = applyCommand(s, {
      type: "settings",
      data: { ...s.settings, focus: 40, theme: "dark" },
    });
    expect(next.timer.durationMs).toBe(40 * 60000);
    expect(next.settings.theme).toBe("dark");
    expect(() =>
      applyCommand(s, { type: "settings", data: { ...s.settings, focus: 0 } }),
    ).toThrow();
    expect(() =>
      applyCommand(s, {
        type: "settings",
        data: { ...s.settings, focus: 2.5 },
      }),
    ).toThrow();
  });
  it("validates stored data rather than trusting JSON", () => {
    expect(StateSchema.safeParse({ version: 2 }).success).toBe(false);
    expect(StateSchema.safeParse(initialState()).success).toBe(true);
  });
});
describe("Timestamp timer and recovery", () => {
  it("pauses/resumes without drift and ignores repeated start", () => {
    let s = applyCommand(
      initialState(),
      { type: "timer", action: "start" },
      1000,
    );
    const deadline = s.timer.deadline;
    s = applyCommand(s, { type: "timer", action: "start" }, 1500);
    expect(s.timer.deadline).toBe(deadline);
    s = applyCommand(s, { type: "timer", action: "pause" }, 62000);
    expect(s.timer.remainingMs).toBe(25 * 60000 - 61000);
    expect(remaining(s.timer, 9999999)).toBe(s.timer.remainingMs);
    s = applyCommand(s, { type: "timer", action: "start" }, 90000);
    expect(s.timer.deadline).toBe(90000 + 25 * 60000 - 61000);
  });
  it("records an expired focus exactly once after sleep/relaunch", () => {
    const running = applyCommand(
      initialState(),
      { type: "timer", action: "start" },
      1000,
    );
    const restored = StateSchema.parse(JSON.parse(JSON.stringify(running)));
    let s = reconcile(restored, 999999999, false);
    expect(s.sessions).toHaveLength(1);
    expect(s.sessions[0].completedAt).toBe(running.timer.deadline);
    expect(s.timer).toMatchObject({ mode: "short", status: "idle" });
    s = reconcile(s, 999999999, false);
    expect(s.sessions).toHaveLength(1);
  });
  it("never records skipped/reset focus sessions or completed breaks", () => {
    let s = applyCommand(
      initialState(),
      { type: "timer", action: "start" },
      100,
    );
    s = applyCommand(s, { type: "timer", action: "skip" }, 200);
    expect(s.sessions).toHaveLength(0);
    s = applyCommand(s, { type: "timer", action: "start" }, 300);
    s = reconcile(s, 9999999, true);
    expect(s.sessions).toHaveLength(0);
    expect(s.timer.mode).toBe("focus");
    s = applyCommand(s, { type: "timer", action: "start" }, 10000000);
    s = applyCommand(s, { type: "timer", action: "reset" }, 10000001);
    expect(s.timer.status).toBe("idle");
    expect(s.sessions).toHaveLength(0);
  });
  it("respects active duration after settings change", () => {
    let s = applyCommand(
      initialState(),
      { type: "timer", action: "start" },
      1000,
    );
    s = applyCommand(
      s,
      { type: "settings", data: { ...s.settings, focus: 10 } },
      2000,
    );
    expect(s.timer.durationMs).toBe(25 * 60000);
    expect(
      applyCommand(s, { type: "timer", action: "reset" }, 2000).timer
        .durationMs,
    ).toBe(10 * 60000);
  });
  it("auto starts only the next break while live, never cascades after sleep", () => {
    let s = initialState();
    s.settings.autoBreak = true;
    s = applyCommand(s, { type: "timer", action: "start" }, 100);
    expect(reconcile(s, 9999999, false).timer.status).toBe("idle");
    const next = reconcile(s, 9999999, true);
    expect(next.timer.status).toBe("running");
    expect(next.timer.deadline).toBe(9999999 + 5 * 60000);
  });
  it("offers a long break after every fourth completed focus", () => {
    let s = initialState();
    for (let i = 0; i < 4; i++) {
      s = applyCommand(
        s,
        { type: "timer", action: "mode", mode: "focus" },
        i * 2000000,
      );
      s = applyCommand(s, { type: "timer", action: "start" }, i * 2000000);
      s = reconcile(s, i * 2000000 + 1500000, false);
    }
    expect(s.sessions).toHaveLength(4);
    expect(s.timer.mode).toBe("long");
  });
  it("splits focus duration across local midnight", () => {
    const now = new Date(2026, 9, 23, 0, 10).getTime();
    const sessions = [
      {
        id: crypto.randomUUID(),
        startedAt: now - 25 * 60000,
        completedAt: now,
        durationMs: 25 * 60000,
        segments: [],
      },
    ];
    expect(focusToday(sessions, now)).toBe(10 * 60000);
    expect(localDay(now)).toBe("2026-10-23");
  });
  it("excludes paused time when allocating a session across midnight", () => {
    let s = initialState();
    s = applyCommand(
      s,
      { type: "timer", action: "start" },
      new Date(2026, 9, 22, 23, 50).getTime(),
    );
    s = applyCommand(
      s,
      { type: "timer", action: "pause" },
      new Date(2026, 9, 22, 23, 55).getTime(),
    );
    s = applyCommand(
      s,
      { type: "timer", action: "start" },
      new Date(2026, 9, 23, 0, 10).getTime(),
    );
    const now = new Date(2026, 9, 23, 0, 30).getTime();
    s = reconcile(s, now, false);
    expect(focusToday(s.sessions, now)).toBe(20 * 60000);
  });
});

import { z } from "zod";

const id = z.string().uuid();
const timestamp = z.number().finite().nonnegative();
const text = z.string().trim().min(1).max(200);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
  );
export const TaskInput = z.object({
  title: text,
  description: z.string().max(10000),
  priority: z.enum(["low", "medium", "high"]),
  category: z.string().trim().max(60),
  dueDate: date.nullable(),
});
export const TaskSchema = TaskInput.extend({
  id,
  completed: z.boolean(),
  createdAt: timestamp,
  updatedAt: timestamp,
  completedAt: timestamp.nullable(),
});
export const NoteInput = z.object({
  title: z.string().max(200),
  body: z.string().max(100000),
  pinned: z.boolean(),
});
export const NoteSchema = NoteInput.extend({
  id,
  createdAt: timestamp,
  updatedAt: timestamp,
});
export const SettingsSchema = z.object({
  theme: z.enum(["light", "dark", "system"]),
  focus: z.number().int().min(1).max(180),
  short: z.number().int().min(1).max(60),
  long: z.number().int().min(1).max(90),
  autoBreak: z.boolean(),
  notifications: z.boolean(),
});
export const ModeSchema = z.enum(["focus", "short", "long"]);
const SegmentSchema = z
  .object({ start: timestamp, end: timestamp })
  .refine((s) => s.end >= s.start);
export const TimerSchema = z.object({
  id,
  mode: ModeSchema,
  status: z.enum(["idle", "running", "paused"]),
  durationMs: z.number().int().positive().max(10800000),
  remainingMs: z.number().nonnegative().max(10800000),
  deadline: timestamp.nullable(),
  startedAt: timestamp.nullable(),
  segmentStartedAt: timestamp.nullable().default(null),
  segments: z.array(SegmentSchema).default([]),
});
export const SessionSchema = z.object({
  id,
  startedAt: timestamp,
  completedAt: timestamp,
  durationMs: z.number().positive().max(10800000),
  segments: z.array(SegmentSchema).default([]),
});
export const StateSchema = z.object({
  version: z.literal(1),
  tasks: z.array(TaskSchema).max(50000),
  notes: z.array(NoteSchema).max(10000),
  sessions: z.array(SessionSchema).max(100000),
  settings: SettingsSchema,
  timer: TimerSchema,
});
export type Task = z.infer<typeof TaskSchema>;
export type Note = z.infer<typeof NoteSchema>;
export type Settings = z.infer<typeof SettingsSchema>;
export type Mode = z.infer<typeof ModeSchema>;
export type State = z.infer<typeof StateSchema>;
export type TaskDraft = z.infer<typeof TaskInput>;
export type NoteDraft = z.infer<typeof NoteInput>;
export const CommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("task.create"), data: TaskInput }),
  z.object({ type: z.literal("task.edit"), id, data: TaskInput }),
  z.object({ type: z.literal("task.toggle"), id }),
  z.object({ type: z.literal("task.delete"), id }),
  z.object({ type: z.literal("note.create") }),
  z.object({ type: z.literal("note.edit"), id, data: NoteInput }),
  z.object({ type: z.literal("note.delete"), id }),
  z.object({ type: z.literal("settings"), data: SettingsSchema }),
  z.object({
    type: z.literal("timer"),
    action: z.enum(["start", "pause", "reset", "skip", "mode"]),
    mode: ModeSchema.optional(),
  }),
]);
export type Command = z.infer<typeof CommandSchema>;
export type Result = { ok: true; state: State } | { ok: false; error: string };
export interface StudyDeskAPI {
  load(): Promise<{ state: State; warning: string | null; version: string }>;
  dispatch(command: Command): Promise<Result>;
  subscribe(listener: (state: State) => void): () => void;
  backup(
    action: "export" | "import",
  ): Promise<{ ok: boolean; message: string }>;
}

export const defaultSettings: Settings = {
  theme: "system",
  focus: 25,
  short: 5,
  long: 15,
  autoBreak: false,
  notifications: false,
};
export function newTimer(
  settings: Settings,
  mode: Mode = "focus",
): State["timer"] {
  const durationMs = settings[mode] * 60000;
  return {
    id: crypto.randomUUID(),
    mode,
    status: "idle",
    durationMs,
    remainingMs: durationMs,
    deadline: null,
    startedAt: null,
    segmentStartedAt: null,
    segments: [],
  };
}
export function initialState(): State {
  return {
    version: 1,
    tasks: [],
    notes: [],
    sessions: [],
    settings: { ...defaultSettings },
    timer: newTimer(defaultSettings),
  };
}
export function remaining(timer: State["timer"], now: number): number {
  return timer.status === "running" && timer.deadline !== null
    ? Math.max(0, Math.min(timer.durationMs, timer.deadline - now))
    : timer.remainingMs;
}
// Expired sessions are reconciled once; missed breaks never produce synthetic focus sessions.
export function reconcile(state: State, now: number, live: boolean): State {
  const t = state.timer;
  if (t.status !== "running" || t.deadline === null || now < t.deadline)
    return state;
  const sessions =
    t.mode === "focus" && !state.sessions.some((s) => s.id === t.id)
      ? [
          ...state.sessions,
          {
            id: t.id,
            startedAt: t.startedAt ?? t.deadline - t.durationMs,
            completedAt: t.deadline,
            durationMs: t.durationMs,
            segments: [
              ...t.segments,
              {
                start: t.segmentStartedAt ?? t.deadline - t.remainingMs,
                end: t.deadline,
              },
            ],
          },
        ]
      : state.sessions;
  const mode =
    t.mode === "focus"
      ? sessions.length % 4 === 0
        ? "long"
        : "short"
      : "focus";
  const timer = newTimer(state.settings, mode);
  if (live && state.settings.autoBreak && t.mode === "focus") {
    timer.status = "running";
    timer.startedAt = now;
    timer.segmentStartedAt = now;
    timer.deadline = now + timer.durationMs;
  }
  return { ...state, sessions, timer };
}
export function applyCommand(
  state: State,
  input: unknown,
  now = Date.now(),
): State {
  const c = CommandSchema.parse(input);
  const s = reconcile(state, now, false);
  switch (c.type) {
    case "task.create":
      return {
        ...s,
        tasks: [
          ...s.tasks,
          {
            ...c.data,
            id: crypto.randomUUID(),
            completed: false,
            createdAt: now,
            updatedAt: now,
            completedAt: null,
          },
        ],
      };
    case "task.edit": {
      if (!s.tasks.some((t) => t.id === c.id))
        throw new Error("Task no longer exists");
      return {
        ...s,
        tasks: s.tasks.map((t) =>
          t.id === c.id ? { ...t, ...c.data, updatedAt: now } : t,
        ),
      };
    }
    case "task.toggle":
      return {
        ...s,
        tasks: s.tasks.map((t) =>
          t.id === c.id
            ? {
                ...t,
                completed: !t.completed,
                completedAt: t.completed ? null : now,
                updatedAt: now,
              }
            : t,
        ),
      };
    case "task.delete":
      return { ...s, tasks: s.tasks.filter((t) => t.id !== c.id) };
    case "note.create":
      return {
        ...s,
        notes: [
          {
            id: crypto.randomUUID(),
            title: "",
            body: "",
            pinned: false,
            createdAt: now,
            updatedAt: now,
          },
          ...s.notes,
        ],
      };
    case "note.edit": {
      if (!s.notes.some((n) => n.id === c.id))
        throw new Error("Note no longer exists");
      return {
        ...s,
        notes: s.notes.map((n) =>
          n.id === c.id ? { ...n, ...c.data, updatedAt: now } : n,
        ),
      };
    }
    case "note.delete":
      return { ...s, notes: s.notes.filter((n) => n.id !== c.id) };
    case "settings":
      return {
        ...s,
        settings: c.data,
        timer:
          s.timer.status === "idle" ? newTimer(c.data, s.timer.mode) : s.timer,
      };
    case "timer": {
      let timer = { ...s.timer };
      if (c.action === "start" && timer.status !== "running")
        timer = {
          ...timer,
          status: "running",
          startedAt: timer.startedAt ?? now,
          segmentStartedAt: now,
          deadline: now + timer.remainingMs,
        };
      if (c.action === "pause" && timer.status === "running")
        timer = {
          ...timer,
          segments: [
            ...timer.segments,
            {
              start: timer.segmentStartedAt ?? now,
              end: Math.max(timer.segmentStartedAt ?? now, now),
            },
          ],
          segmentStartedAt: null,
          remainingMs: remaining(timer, now),
          status: "paused",
          deadline: null,
        };
      if (c.action === "reset") timer = newTimer(s.settings, timer.mode);
      if (c.action === "mode" && c.mode) timer = newTimer(s.settings, c.mode);
      if (c.action === "skip")
        timer = newTimer(
          s.settings,
          timer.mode === "focus" ? "short" : "focus",
        );
      return { ...s, timer };
    }
  }
}
export function localDay(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// Split actual focus duration across local midnight, including sessions spanning DST changes.
export function focusToday(sessions: State["sessions"], now: number): number {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return sessions.reduce(
    (sum, s) =>
      sum +
      (s.segments.length
        ? s.segments
        : [{ start: s.completedAt - s.durationMs, end: s.completedAt }]
      ).reduce(
        (total, segment) =>
          total +
          Math.max(
            0,
            Math.min(segment.end, end.getTime()) -
              Math.max(segment.start, start.getTime()),
          ),
        0,
      ),
    0,
  );
}

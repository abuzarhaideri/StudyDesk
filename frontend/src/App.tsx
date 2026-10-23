import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  BookOpen,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Clock3,
  Coffee,
  Ellipsis,
  Feather,
  Flame,
  LayoutDashboard,
  ListTodo,
  LoaderCircle,
  Moon,
  NotebookPen,
  Pause,
  Pin,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  SkipForward,
  Sparkles,
  Sun,
  Target,
  Timer,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  focusToday,
  localDay,
  remaining,
  type Command,
  type Mode,
  type Note,
  type Settings,
  type State,
  type Task,
  type TaskDraft,
} from "../../shared/domain";
import { Button } from "./components/ui/button";
import { Dialog } from "./components/ui/dialog";

type Page = "Dashboard" | "Tasks" | "Focus" | "Notes" | "Settings";
type Send = (command: Command) => Promise<State | null>;
const navigation: { page: Page; icon: LucideIcon; key: string }[] = [
  { page: "Dashboard", icon: LayoutDashboard, key: "1" },
  { page: "Tasks", icon: ListTodo, key: "2" },
  { page: "Focus", icon: Timer, key: "3" },
  { page: "Notes", icon: NotebookPen, key: "4" },
];
const modeLabels: Record<Mode, string> = {
  focus: "Focus",
  short: "Short break",
  long: "Long break",
};
function formatTime(ms: number) {
  const seconds = Math.ceil(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
function dateLabel(date: string | null) {
  if (!date) return null;
  if (date === localDay(Date.now())) return "Today";
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
function Empty({
  icon: Icon = Feather,
  title,
  children,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={23} strokeWidth={1.5} />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export default function App() {
  const [state, setState] = useState<State | null>(null);
  const [page, setPage] = useState<Page>("Dashboard");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [version, setVersion] = useState("1.0.0");
  const [editing, setEditing] = useState<Task | "new" | null>(null);
  const [deleting, setDeleting] = useState<{
    type: "task" | "note";
    id: string;
    title: string;
  } | null>(null);
  const [saving, setSaving] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [help, setHelp] = useState(false);
  const [selectedNote, setSelectedNote] = useState<string | null>(null);
  const [systemDark, setSystemDark] = useState(
    matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    window.studyDesk
      .load()
      .then((result) => {
        if (mounted.current) {
          setState(result.state);
          setWarning(result.warning);
          setVersion(result.version);
        }
      })
      .catch(() =>
        setError(
          "We couldn’t open your local data. Close and reopen StudyDesk to try again.",
        ),
      );
    const unsubscribe = window.studyDesk.subscribe(setState);
    const media = matchMedia("(prefers-color-scheme: dark)");
    const change = () => setSystemDark(media.matches);
    media.addEventListener("change", change);
    return () => {
      mounted.current = false;
      unsubscribe();
      media.removeEventListener("change", change);
    };
  }, []);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(
      () => setNow(Date.now()),
      state?.timer.status === "running" ? 1000 : 30000,
    );
    return () => clearInterval(timer);
  }, [state?.timer.status]);
  const send: Send = useCallback(async (command) => {
    setSaving((n) => n + 1);
    try {
      const result = await window.studyDesk.dispatch(command);
      if (!result.ok) {
        setError(result.error);
        return null;
      }
      setState(result.state);
      return result.state;
    } catch {
      setError("Your change could not be saved. Please try again.");
      return null;
    } finally {
      setSaving((n) => n - 1);
    }
  }, []);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const nav = navigation.find((n) => n.key === e.key);
      if (nav) {
        e.preventDefault();
        setPage(nav.page);
      }
      if (e.key === ",") {
        e.preventDefault();
        setPage("Settings");
      }
      if (e.key === "n") {
        e.preventDefault();
        setEditing("new");
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  const dark =
    state?.settings.theme === "dark" ||
    (state?.settings.theme === "system" && systemDark);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  async function createNote() {
    const next = await send({ type: "note.create" });
    if (next) {
      setSelectedNote(next.notes[0].id);
      setPage("Notes");
    }
  }
  if (!state)
    return (
      <div className="fatal">
        <BookOpen size={35} />
        <h1>Making room for a little progress.</h1>
        <p>{error ?? "Opening your desk…"}</p>
      </div>
    );
  const today = localDay(now);
  const pending = state.tasks.filter((t) => !t.completed);
  const dueToday = state.tasks.filter((t) => t.dueDate === today);
  const completedToday = state.tasks.filter(
    (t) => t.completedAt && localDay(t.completedAt) === today,
  ).length;
  const focusMinutes = Math.floor(focusToday(state.sessions, now) / 60000);
  const taskRow = (task: Task) => (
    <TaskRow
      key={task.id}
      task={task}
      today={today}
      onToggle={() => void send({ type: "task.toggle", id: task.id })}
      onEdit={() => setEditing(task)}
      onDelete={() =>
        setDeleting({ type: "task", id: task.id, title: task.title })
      }
    />
  );
  return (
    <MotionConfig reducedMotion="user">
      <div className="app-shell">
        <aside className="sidebar">
          <div className="traffic-space" />
          <div className="brand">
            <div className="brand-icon">
              <BookOpen size={22} strokeWidth={1.7} />
            </div>
            <span>
              StudyDesk<span className="brand-dot">.</span>
            </span>
          </div>
          <div className="workspace-label">YOUR LITTLE SPACE TO GROW</div>
          <Button
            className="quick-add"
            variant="secondary"
            onClick={() => setEditing("new")}
          >
            <Plus size={16} /> Quick add task <kbd>⌘ N</kbd>
          </Button>
          <div className="nav-label">WORKSPACE</div>
          <nav aria-label="Main navigation">
            {navigation.map(({ page: item, icon: Icon }) => (
              <button
                key={item}
                aria-label={item}
                aria-current={page === item ? "page" : undefined}
                className={`nav-item ${page === item ? "active" : ""}`}
                onClick={() => setPage(item)}
              >
                <Icon size={18} strokeWidth={1.7} />
                <span>{item}</span>
                {item === "Tasks" && pending.length > 0 && (
                  <span className="nav-count">{pending.length}</span>
                )}
                {item === page && <span className="nav-active-dot" />}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="sidebar-quote">
              <div className="quote-sun">
                <Sun size={22} strokeWidth={1.4} />
              </div>
              <p>
                Small steps.
                <br />
                Meaningful progress.
              </p>
              <span>You’re doing better than you think.</span>
            </div>
            <button
              className={`nav-item ${page === "Settings" ? "active" : ""}`}
              onClick={() => setPage("Settings")}
            >
              <Settings2 size={18} />
              <span>Settings</span>
            </button>
            <div className="local-status">
              <span className="status-dot" />
              All yours. Always offline.
              <button
                aria-label="Keyboard shortcuts and help"
                onClick={() => setHelp(true)}
              >
                <CircleHelp size={15} />
              </button>
            </div>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div>
              <span className="breadcrumb">My workspace</span>
              <ChevronRight size={13} />
              <span>{page}</span>
            </div>
            <div className="topbar-right">
              <span className="save-indicator" aria-live="polite">
                {saving ? (
                  <LoaderCircle size={13} className="spin" />
                ) : (
                  <Check size={13} />
                )}
                {saving ? "Saving…" : "Saved on this device"}
              </span>
              <span className="topbar-divider" />
              <button
                className="theme-toggle"
                aria-label={
                  dark ? "Switch to light theme" : "Switch to dark theme"
                }
                onClick={() =>
                  void send({
                    type: "settings",
                    data: { ...state.settings, theme: dark ? "light" : "dark" },
                  })
                }
              >
                {dark ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <div className="avatar" title="Your personal workspace">
                S
              </div>
            </div>
          </header>
          {error && (
            <div role="alert" className="banner error">
              {error}
              <button onClick={() => setError(null)} aria-label="Dismiss error">
                <X size={16} />
              </button>
            </div>
          )}
          {warning && (
            <div role="status" className="banner">
              {warning}
              <button
                onClick={() => setWarning(null)}
                aria-label="Dismiss notice"
              >
                <X size={16} />
              </button>
            </div>
          )}
          <main
            className={`content ${page === "Focus" ? "content-focus" : ""}`}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={page}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.13 }}
              >
                {page === "Dashboard" && (
                  <>
                    <div className="page-heading">
                      <div>
                        <div className="eyebrow">
                          <span className="tiny-line" /> A FRESH PAGE, EVERY DAY
                        </div>
                        <h1>
                          {new Date(now).getHours() < 12
                            ? "Good morning"
                            : new Date(now).getHours() < 17
                              ? "Good afternoon"
                              : "Good evening"}
                          <span className="greeting-dot">.</span>{" "}
                          <span className="greeting-sun">✳</span>
                        </h1>
                        <p>Let’s make a little room for what matters.</p>
                      </div>
                      <div className="date-chip">
                        <CalendarDays size={15} />
                        {new Date(now).toLocaleDateString(undefined, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}
                      </div>
                    </div>
                    <section
                      className="stats-grid"
                      aria-label="Today’s statistics"
                    >
                      <Stat
                        icon={ListTodo}
                        label="Tasks for today"
                        value={String(
                          dueToday.filter((t) => !t.completed).length,
                        ).padStart(2, "0")}
                        detail="A clear plan, a calmer mind"
                        color="sage"
                      />
                      <Stat
                        icon={CheckCheck}
                        label="Completed today"
                        value={String(completedToday).padStart(2, "0")}
                        detail={
                          completedToday
                            ? "Look at you making progress"
                            : "Every small win counts"
                        }
                        color="ochre"
                      />
                      <Stat
                        icon={Clock3}
                        label="Focus time"
                        value={String(focusMinutes)}
                        suffix="min"
                        detail="Time invested in yourself"
                        color="lavender"
                      />
                    </section>
                    <div className="dashboard-columns">
                      <div className="dashboard-primary">
                        <section className="card today-card">
                          <div className="card-heading">
                            <div>
                              <div className="section-kicker">
                                ONE THING AT A TIME
                              </div>
                              <h2>
                                On your desk{" "}
                                <span className="count-badge">
                                  {pending.length}
                                </span>
                              </h2>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setPage("Tasks")}
                            >
                              All tasks <ArrowRight size={14} />
                            </Button>
                          </div>
                          <div className="task-list">
                            {pending.length ? (
                              [...pending]
                                .sort((a, b) =>
                                  (a.dueDate ?? "9999").localeCompare(
                                    b.dueDate ?? "9999",
                                  ),
                                )
                                .slice(0, 4)
                                .map(taskRow)
                            ) : (
                              <Empty
                                icon={CheckCheck}
                                title="A clear desk. A fresh start."
                              >
                                Add a task below and give your day a little
                                direction.
                              </Empty>
                            )}
                          </div>
                          <QuickTask send={send} />
                          <div className="today-progress">
                            <div>
                              <span>Today’s progress</span>
                              <span>
                                {dueToday.filter((t) => t.completed).length} of{" "}
                                {dueToday.length} tasks
                              </span>
                            </div>
                            <div className="progress-track">
                              <span
                                style={{
                                  width: `${dueToday.length ? (dueToday.filter((t) => t.completed).length / dueToday.length) * 100 : 0}%`,
                                }}
                              />
                            </div>
                          </div>
                        </section>
                        <section className="card recent-notes">
                          <div className="card-heading">
                            <div>
                              <div className="section-kicker">
                                KEEP THAT THOUGHT
                              </div>
                              <h2>Recent notes</h2>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setPage("Notes")}
                            >
                              All notes <ArrowRight size={14} />
                            </Button>
                          </div>
                          {state.notes.length ? (
                            <div className="note-previews">
                              {[...state.notes]
                                .sort((a, b) => b.updatedAt - a.updatedAt)
                                .slice(0, 2)
                                .map((n) => (
                                  <button
                                    className="note-preview"
                                    key={n.id}
                                    onClick={() => {
                                      setSelectedNote(n.id);
                                      setPage("Notes");
                                    }}
                                  >
                                    <NotebookPen size={17} />
                                    <h3>{n.title || "Untitled note"}</h3>
                                    <p>
                                      {n.body || "A thought waiting to happen…"}
                                    </p>
                                    <span>
                                      {new Date(n.updatedAt).toLocaleDateString(
                                        undefined,
                                        { month: "short", day: "numeric" },
                                      )}
                                      {n.pinned && <Pin size={11} />}
                                    </span>
                                  </button>
                                ))}
                            </div>
                          ) : (
                            <button
                              className="note-empty"
                              onClick={() => void createNote()}
                            >
                              <div className="note-paper">
                                <Feather size={21} />
                              </div>
                              <div>
                                <strong>A home for your next idea.</strong>
                                <span>
                                  Capture a thought, a question, a little
                                  inspiration.
                                </span>
                              </div>
                              <Plus size={18} />
                            </button>
                          )}
                        </section>
                      </div>
                      <div className="dashboard-secondary">
                        <section className="focus-feature">
                          <div className="section-kicker">
                            <span className="status-dot" /> MAKE SPACE TO FOCUS
                          </div>
                          <h2>
                            A little focus.
                            <br />A lot of possibility.
                          </h2>
                          <p>
                            One quiet session can change
                            <br />
                            the shape of your day.
                          </p>
                          <div className="mini-clock">
                            <svg viewBox="0 0 160 160" aria-hidden="true">
                              <circle cx="80" cy="80" r="69" />
                              <circle
                                className="mini-clock-accent"
                                cx="80"
                                cy="80"
                                r="69"
                                strokeDasharray="320 434"
                              />
                            </svg>
                            <span>
                              {formatTime(remaining(state.timer, now))}
                              <small>
                                {modeLabels[state.timer.mode]} session
                              </small>
                            </span>
                            <span className="clock-leaf">✦</span>
                          </div>
                          <Button
                            onClick={() => {
                              setPage("Focus");
                              if (state.timer.status !== "running")
                                void send({ type: "timer", action: "start" });
                            }}
                          >
                            <Play size={14} fill="currentColor" />
                            {state.timer.status === "running"
                              ? "Return to focus"
                              : "Start a focus session"}
                            <ArrowRight size={15} />
                          </Button>
                          <div className="focus-caption">
                            Just you, your work, and a fresh start.
                          </div>
                        </section>
                        <section className="gentle-reminder">
                          <Sparkles size={19} strokeWidth={1.4} />
                          <div className="section-kicker">
                            A GENTLE REMINDER
                          </div>
                          <p>
                            “You don’t have to see the whole staircase. Just
                            take the first step.”
                          </p>
                          <span>— Martin Luther King Jr.</span>
                        </section>
                      </div>
                    </div>
                    <footer className="dashboard-footer">
                      <span>
                        <Feather size={13} /> A little more intentional, every
                        day.
                      </span>
                      <span>Your space. Your pace.</span>
                    </footer>
                  </>
                )}
                {page === "Tasks" && (
                  <Tasks
                    state={state}
                    send={send}
                    onNew={() => setEditing("new")}
                    taskRow={taskRow}
                    today={today}
                  />
                )}
                {page === "Focus" && (
                  <Focus
                    state={state}
                    now={now}
                    send={send}
                    minutes={focusMinutes}
                  />
                )}
                {page === "Notes" && (
                  <Notes
                    state={state}
                    send={send}
                    selected={selectedNote}
                    select={setSelectedNote}
                    create={createNote}
                    saving={saving > 0}
                    onDelete={(n) =>
                      setDeleting({
                        type: "note",
                        id: n.id,
                        title: n.title || "Untitled note",
                      })
                    }
                  />
                )}
                {page === "Settings" && (
                  <SettingsPage
                    state={state}
                    send={send}
                    version={version}
                    notify={setWarning}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
        <TaskDialog task={editing} close={() => setEditing(null)} send={send} />
        <Dialog
          open={!!deleting}
          onOpenChange={(open) => {
            if (!open) setDeleting(null);
          }}
          title={`Delete ${deleting?.type ?? "item"}?`}
          description={`“${deleting?.title ?? ""}” will be permanently removed from this device.`}
        >
          <div className="dialog-actions">
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (
                  deleting &&
                  (await send({
                    type: `${deleting.type}.delete`,
                    id: deleting.id,
                  }))
                )
                  setDeleting(null);
              }}
            >
              Delete {deleting?.type}
            </Button>
          </div>
        </Dialog>
        <Dialog
          open={help}
          onOpenChange={setHelp}
          title="A few little shortcuts"
          description="Make yourself at home."
        >
          <div className="shortcut-list">
            <p>
              <span>Quick add task</span>
              <kbd>⌘ N</kbd>
            </p>
            {navigation.map((n) => (
              <p key={n.page}>
                <span>{n.page}</span>
                <kbd>⌘ {n.key}</kbd>
              </p>
            ))}
            <p>
              <span>Settings</span>
              <kbd>⌘ ,</kbd>
            </p>
          </div>
          <p className="muted">
            Your tasks, notes and focus history are saved locally. No account.
            No connection. Just you.
          </p>
        </Dialog>
      </div>
    </MotionConfig>
  );
}
function Stat({
  icon: Icon,
  label,
  value,
  suffix,
  detail,
  color,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  suffix?: string;
  detail: string;
  color: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <div className={`stat-icon ${color}`}>
          <Icon size={17} strokeWidth={1.7} />
        </div>
      </div>
      <div className="stat-value">
        {value}
        <span>{suffix}</span>
      </div>
      <div className="stat-detail">{detail}</div>
    </div>
  );
}
function TaskRow({
  task,
  today,
  onToggle,
  onEdit,
  onDelete,
}: {
  task: Task;
  today: string;
  onToggle(): void;
  onEdit(): void;
  onDelete(): void;
}) {
  return (
    <div className={`task-row ${task.completed ? "is-complete" : ""}`}>
      <button
        role="checkbox"
        aria-checked={task.completed}
        aria-label={`${task.completed ? "Reopen" : "Complete"} ${task.title}`}
        className="task-check"
        onClick={onToggle}
      >
        {task.completed && <Check size={13} />}
      </button>
      <button className="task-body" onClick={onEdit}>
        <span className="task-title">{task.title}</span>
        <span className="task-meta">
          {task.category && <span className="category">{task.category}</span>}
          {task.dueDate && (
            <span
              className={
                task.dueDate < today && !task.completed ? "overdue" : ""
              }
            >
              <CalendarDays size={11} />
              {dateLabel(task.dueDate)}
              {task.dueDate < today && !task.completed ? " · Overdue" : ""}
            </span>
          )}
          {!task.category && !task.dueDate && (
            <span>No due date · at your own pace</span>
          )}
        </span>
      </button>
      <span className={`priority ${task.priority}`}>
        <span />
        {task.priority}
      </span>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Edit ${task.title}`}
        onClick={onEdit}
      >
        <Ellipsis size={17} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="row-delete"
        aria-label={`Delete ${task.title}`}
        onClick={onDelete}
      >
        <Trash2 size={14} />
      </Button>
    </div>
  );
}
function QuickTask({ send }: { send: Send }) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    const next = await send({
      type: "task.create",
      data: {
        title,
        description: "",
        dueDate: localDay(Date.now()),
        category: "",
        priority: "medium",
      },
    });
    if (next) setTitle("");
    setBusy(false);
  }
  return (
    <form className="quick-task" onSubmit={submit}>
      <Plus size={17} />
      <input
        aria-label="Quick task title"
        placeholder="Add a task. Make a little progress."
        value={title}
        maxLength={200}
        onChange={(e) => setTitle(e.target.value)}
      />
      <button aria-label="Add quick task" disabled={!title.trim() || busy}>
        {title.trim() ? <ArrowRight size={16} /> : <kbd>↵</kbd>}
      </button>
    </form>
  );
}
function Tasks({
  state,
  send,
  onNew,
  taskRow,
  today,
}: {
  state: State;
  send: Send;
  onNew(): void;
  taskRow(t: Task): ReactNode;
  today: string;
}) {
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("deadline");
  const matches = (t: Task, f: string) =>
    f === "Today"
      ? t.dueDate === today && !t.completed
      : f === "Upcoming"
        ? !!t.dueDate && t.dueDate > today && !t.completed
        : f === "Completed"
          ? t.completed
          : true;
  const tasks = useMemo(
    () =>
      state.tasks
        .filter(
          (t) =>
            matches(t, filter) &&
            `${t.title} ${t.description} ${t.category}`
              .toLowerCase()
              .includes(search.toLowerCase()),
        )
        .sort(
          (a, b) =>
            Number(a.completed) - Number(b.completed) ||
            (sort === "priority"
              ? ["high", "medium", "low"].indexOf(a.priority) -
                ["high", "medium", "low"].indexOf(b.priority)
              : (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999")) ||
            b.createdAt - a.createdAt,
        ),
    [state.tasks, filter, search, sort, today],
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">A LITTLE STRUCTURE, A LOT OF CLARITY</div>
          <h1>
            Your tasks<span className="greeting-dot">.</span>
          </h1>
          <p>Big ambitions begin with small, doable steps.</p>
        </div>
        <Button onClick={onNew}>
          <Plus size={16} />
          New task
        </Button>
      </div>
      <div className="task-toolbar">
        <div className="tabs">
          {["All", "Today", "Upcoming", "Completed"].map((f) => (
            <button
              className={filter === f ? "selected" : ""}
              key={f}
              onClick={() => setFilter(f)}
            >
              {f}
              <span>{state.tasks.filter((t) => matches(t, f)).length}</span>
            </button>
          ))}
        </div>
        <label className="sort-label">
          Sort by
          <select
            aria-label="Sort tasks"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="deadline">Deadline</option>
            <option value="priority">Priority</option>
          </select>
        </label>
      </div>
      <div className="card tasks-card">
        <div className="search-box">
          <Search size={16} />
          <input
            placeholder="Find a task…"
            aria-label="Search tasks"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              aria-label="Clear task search"
            >
              <X size={14} />
            </button>
          )}
        </div>
        {tasks.length ? (
          <div className="task-list">{tasks.map(taskRow)}</div>
        ) : (
          <Empty
            icon={ListTodo}
            title={
              search
                ? "Nothing here just yet."
                : filter === "Completed"
                  ? "Your wins will live here."
                  : "A little space for your next step."
            }
          >
            {search
              ? "Try a different word or clear your search."
              : "Start with one thing. It doesn’t have to be a big thing."}
          </Empty>
        )}
        <QuickTask send={send} />
      </div>
      <div className="page-footnote">
        <CheckCheck size={14} />
        {state.tasks.filter((t) => t.completed).length} completed ·{" "}
        {state.tasks.filter((t) => !t.completed).length} still to explore
      </div>
    </>
  );
}
function TaskDialog({
  task,
  close,
  send,
}: {
  task: Task | "new" | null;
  close(): void;
  send: Send;
}) {
  const [draft, setDraft] = useState<TaskDraft>({
    title: "",
    description: "",
    priority: "medium",
    category: "",
    dueDate: null,
  });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (task)
      setDraft(
        task === "new"
          ? {
              title: "",
              description: "",
              priority: "medium",
              category: "",
              dueDate: localDay(Date.now()),
            }
          : {
              title: task.title,
              description: task.description,
              priority: task.priority,
              category: task.category,
              dueDate: task.dueDate,
            },
      );
  }, [task]);
  const update = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!task || !draft.title.trim()) return;
    setBusy(true);
    const next = await send(
      task === "new"
        ? { type: "task.create", data: draft }
        : { type: "task.edit", id: task.id, data: draft },
    );
    setBusy(false);
    if (next) close();
  }
  return (
    <Dialog
      open={task !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title={task === "new" ? "One small step." : "Make it your own."}
      description={
        task === "new"
          ? "What would you like to make room for?"
          : "A little clarity goes a long way."
      }
    >
      <form onSubmit={submit} className="task-form">
        <label>
          Task title
          <input
            autoFocus
            required
            maxLength={200}
            placeholder="What’s on your mind?"
            value={draft.title}
            onChange={(e) => update("title", e.target.value)}
          />
        </label>
        <label>
          Description
          <textarea
            rows={3}
            maxLength={10000}
            placeholder="A few details, if you need them…"
            value={draft.description}
            onChange={(e) => update("description", e.target.value)}
          />
        </label>
        <div className="form-grid">
          <label>
            Priority
            <select
              aria-label="Priority"
              value={draft.priority}
              onChange={(e) =>
                update("priority", e.target.value as TaskDraft["priority"])
              }
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <label>
            Due date
            <input
              type="date"
              value={draft.dueDate ?? ""}
              onChange={(e) => update("dueDate", e.target.value || null)}
            />
          </label>
        </div>
        <label>
          Category
          <input
            maxLength={60}
            placeholder="e.g. Mathematics, Personal"
            value={draft.category}
            onChange={(e) => update("category", e.target.value)}
          />
        </label>
        <div className="dialog-actions">
          <Button type="button" variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={!draft.title.trim() || busy}>
            {busy ? "Saving…" : task === "new" ? "Create task" : "Save changes"}
            <ArrowRight size={15} />
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
function Focus({
  state,
  now,
  send,
  minutes,
}: {
  state: State;
  now: number;
  send: Send;
  minutes: number;
}) {
  const timer = state.timer;
  const progress = Math.max(
    0,
    Math.min(1, 1 - remaining(timer, now) / timer.durationMs),
  );
  const [change, setChange] = useState<Mode | "reset" | "skip" | null>(null);
  function request(action: Mode | "reset" | "skip") {
    if (timer.status !== "idle") setChange(action);
    else void apply(action);
  }
  async function apply(action: Mode | "reset" | "skip") {
    await send(
      action === "reset" || action === "skip"
        ? { type: "timer", action }
        : { type: "timer", action: "mode", mode: action },
    );
    setChange(null);
  }
  const sessions = state.sessions.filter(
    (s) => localDay(s.completedAt) === localDay(now),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PRESENCE OVER PRESSURE</div>
          <h1>
            A moment to focus<span className="greeting-dot">.</span>
          </h1>
          <p>You only need to do one thing at a time.</p>
        </div>
        <div className="date-chip">
          <Coffee size={15} />
          Breathe. You’ve got this.
        </div>
      </div>
      <section className="focus-room">
        <div className="tabs timer-tabs">
          {(["focus", "short", "long"] as Mode[]).map((mode) => (
            <button
              key={mode}
              className={timer.mode === mode ? "selected" : ""}
              onClick={() => {
                if (mode !== timer.mode) request(mode);
              }}
            >
              {modeLabels[mode]}
            </button>
          ))}
        </div>
        <div className="timer-orbit">
          <svg viewBox="0 0 320 320" aria-hidden="true">
            <circle className="timer-track" cx="160" cy="160" r="145" />
            <circle
              className="timer-progress"
              cx="160"
              cy="160"
              r="145"
              strokeDasharray={2 * Math.PI * 145}
              strokeDashoffset={2 * Math.PI * 145 * (1 - progress)}
            />
          </svg>
          <div className="timer-center">
            <span className="section-kicker">
              {timer.status === "running"
                ? "YOU’RE RIGHT WHERE YOU NEED TO BE"
                : timer.status === "paused"
                  ? "TAKE YOUR TIME"
                  : "A FRESH START AWAITS"}
            </span>
            <div className="countdown" role="timer" aria-label="Time remaining">
              {formatTime(remaining(timer, now))}
            </div>
            <span className="muted">{modeLabels[timer.mode]} session</span>
            <div className="session-dots">
              {Array.from({ length: 4 }, (_, i) => (
                <span
                  key={i}
                  className={
                    i < sessions.length % 4 ||
                    (sessions.length > 0 && sessions.length % 4 === 0)
                      ? "filled"
                      : ""
                  }
                />
              ))}
            </div>
          </div>
        </div>
        <div className="timer-controls">
          <Button
            variant="secondary"
            size="icon"
            aria-label="Reset timer"
            onClick={() => request("reset")}
          >
            <RotateCcw size={18} />
          </Button>
          <Button
            className="timer-start"
            onClick={() =>
              void send({
                type: "timer",
                action: timer.status === "running" ? "pause" : "start",
              })
            }
          >
            {timer.status === "running" ? (
              <Pause size={17} fill="currentColor" />
            ) : (
              <Play size={17} fill="currentColor" />
            )}
            {timer.status === "running"
              ? "Pause session"
              : timer.status === "paused"
                ? "Resume session"
                : "Start session"}
          </Button>
          <Button
            variant="secondary"
            size="icon"
            aria-label="Skip session"
            onClick={() => request("skip")}
          >
            <SkipForward size={18} />
          </Button>
        </div>
        <p className="focus-mantra">
          Close a few tabs. Take a deep breath. Begin.
        </p>
      </section>
      <div className="focus-stats">
        <div>
          <Target size={19} />
          <strong>{sessions.length}</strong>
          <span>sessions today</span>
        </div>
        <div>
          <Clock3 size={19} />
          <strong>
            {minutes}
            <small> min</small>
          </strong>
          <span>of quiet progress</span>
        </div>
        <div>
          <Flame size={19} />
          <strong>
            {new Set(state.sessions.map((s) => localDay(s.completedAt))).size}
          </strong>
          <span>days of showing up</span>
        </div>
      </div>
      {sessions.length > 0 && (
        <section className="card session-history">
          <h2>Today’s quiet victories</h2>
          {sessions
            .slice(-5)
            .reverse()
            .map((s) => (
              <div key={s.id}>
                <span>
                  <Check size={14} />
                  Focus session
                </span>
                <span>
                  {Math.round(s.durationMs / 60000)} min ·{" "}
                  {new Date(s.completedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            ))}
        </section>
      )}
      <Dialog
        open={change !== null}
        onOpenChange={(open) => {
          if (!open) setChange(null);
        }}
        title="Leave this session?"
        description="Your current session won’t count toward completed focus time. You can always begin again."
      >
        <div className="dialog-actions">
          <Button variant="secondary" onClick={() => setChange(null)}>
            Keep focusing
          </Button>
          <Button onClick={() => change && void apply(change)}>Continue</Button>
        </div>
      </Dialog>
    </>
  );
}
function Notes({
  state,
  send,
  selected,
  select,
  create,
  saving,
  onDelete,
}: {
  state: State;
  send: Send;
  selected: string | null;
  select(id: string): void;
  create(): Promise<void>;
  saving: boolean;
  onDelete(n: Note): void;
}) {
  const [search, setSearch] = useState("");
  const notes = [...state.notes]
    .filter((n) =>
      `${n.title} ${n.body}`.toLowerCase().includes(search.toLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt,
    );
  const active = state.notes.find((n) => n.id === selected) ?? notes[0];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">THOUGHTS WORTH KEEPING</div>
          <h1>
            A place for your ideas<span className="greeting-dot">.</span>
          </h1>
          <p>Catch a thought before it wanders away.</p>
        </div>
        <Button onClick={() => void create()}>
          <Plus size={16} />
          New note
        </Button>
      </div>
      <section className="card notes-workspace">
        <div className="notes-list">
          <div className="search-box">
            <Search size={16} />
            <input
              placeholder="Search your notes…"
              aria-label="Search notes"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="notes-list-label">
            {notes.length} {notes.length === 1 ? "NOTE" : "NOTES"}
          </div>
          {notes.map((n) => (
            <button
              key={n.id}
              className={`note-list-item ${active?.id === n.id ? "selected" : ""}`}
              onClick={() => select(n.id)}
            >
              <strong>
                {n.title || "Untitled note"}
                {n.pinned && <Pin size={12} />}
              </strong>
              <p>{n.body || "Your next idea starts here…"}</p>
              <span>
                {new Date(n.updatedAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </button>
          ))}
          {!notes.length && (
            <div className="notes-no-results">
              {search
                ? "No matching thoughts. Try another word."
                : "A little space for a big idea."}
            </div>
          )}
        </div>
        {active ? (
          <NoteEditor
            key={active.id}
            note={active}
            send={send}
            saving={saving}
            onDelete={() => onDelete(active)}
          />
        ) : (
          <div className="notes-blank">
            <Empty
              icon={NotebookPen}
              title="Every idea deserves a little space."
              action={
                <Button variant="secondary" onClick={() => void create()}>
                  <Plus size={15} />
                  Write your first note
                </Button>
              }
            >
              A study summary, a fleeting thought, a plan for tomorrow. Keep it
              here.
            </Empty>
          </div>
        )}
      </section>
    </>
  );
}
function NoteEditor({
  note,
  send,
  saving,
  onDelete,
}: {
  note: Note;
  send: Send;
  saving: boolean;
  onDelete(): void;
}) {
  const [draft, setDraft] = useState({
    title: note.title,
    body: note.body,
    pinned: note.pinned,
  });
  function update(patch: Partial<typeof draft>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    void send({ type: "note.edit", id: note.id, data: next });
  }
  return (
    <div className="note-editor">
      <div className="note-editor-toolbar">
        <span aria-live="polite">
          {saving ? "Saving…" : "All changes saved"}
        </span>
        <div>
          <Button
            variant={draft.pinned ? "secondary" : "ghost"}
            size="icon"
            aria-label={draft.pinned ? "Unpin note" : "Pin note"}
            onClick={() => update({ pinned: !draft.pinned })}
          >
            <Pin size={16} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Delete note"
            onClick={onDelete}
          >
            <Trash2 size={16} />
          </Button>
        </div>
      </div>
      <input
        className="note-title-input"
        placeholder="Untitled note"
        aria-label="Note title"
        maxLength={200}
        value={draft.title}
        onChange={(e) => update({ title: e.target.value })}
      />
      <div className="note-edited">
        Edited{" "}
        {new Date(note.updatedAt).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </div>
      <textarea
        className="note-body-input"
        aria-label="Note body"
        placeholder="Let your thoughts settle here…"
        maxLength={100000}
        value={draft.body}
        onChange={(e) => update({ body: e.target.value })}
      />
      <div className="note-editor-footer">
        <Feather size={13} />
        Just your words. A little room to think.
        <span>
          {draft.body.trim() ? draft.body.trim().split(/\s+/).length : 0} words
        </span>
      </div>
    </div>
  );
}
function SettingsPage({
  state,
  send,
  version,
  notify,
}: {
  state: State;
  send: Send;
  version: string;
  notify(message: string): void;
}) {
  const [durations, setDurations] = useState({
    focus: String(state.settings.focus),
    short: String(state.settings.short),
    long: String(state.settings.long),
  });
  const [busy, setBusy] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setDurations({
      focus: String(state.settings.focus),
      short: String(state.settings.short),
      long: String(state.settings.long),
    });
  }, [state.settings.focus, state.settings.short, state.settings.long]);
  function change(patch: Partial<Settings>) {
    void send({ type: "settings", data: { ...state.settings, ...patch } });
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const next = await send({
      type: "settings",
      data: {
        ...state.settings,
        focus: Number(durations.focus),
        short: Number(durations.short),
        long: Number(durations.long),
      },
    });
    setBusy(false);
    setSaved(!!next);
  }
  async function backup(action: "export" | "import") {
    setBackupBusy(true);
    try {
      const result = await window.studyDesk.backup(action);
      notify(result.message);
    } catch {
      notify("Backup could not be completed. Please try again.");
    } finally {
      setBackupBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MAKE YOURSELF AT HOME</div>
          <h1>
            Your desk, your way<span className="greeting-dot">.</span>
          </h1>
          <p>A few little things to help you settle in.</p>
        </div>
      </div>
      <div className="settings-layout">
        <section className="card settings-card">
          <div className="settings-heading">
            <Sun size={19} />
            <div>
              <h2>A comfortable view</h2>
              <p>A little light, a little dark. Whatever feels right.</p>
            </div>
          </div>
          <div className="theme-options">
            {(
              [
                { id: "light", label: "Light", icon: Sun },
                { id: "dark", label: "Dark", icon: Moon },
                { id: "system", label: "System", icon: Settings2 },
              ] as const
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                aria-pressed={state.settings.theme === id}
                className={state.settings.theme === id ? "selected" : ""}
                onClick={() => change({ theme: id })}
              >
                <div className={`theme-preview preview-${id}`}>
                  <span />
                  <div>
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
                <span>
                  <Icon size={14} />
                  {label}
                  {state.settings.theme === id && <Check size={13} />}
                </span>
              </button>
            ))}
          </div>
        </section>
        <section className="card settings-card">
          <div className="settings-heading">
            <Timer size={19} />
            <div>
              <h2>Find your rhythm</h2>
              <p>Set a pace that works for you.</p>
            </div>
          </div>
          <form onSubmit={save}>
            <div className="duration-grid">
              {(["focus", "short", "long"] as Mode[]).map((mode) => (
                <label key={mode}>
                  {modeLabels[mode]}
                  <div>
                    <input
                      type="number"
                      aria-label={`${modeLabels[mode]} duration`}
                      min={1}
                      max={mode === "focus" ? 180 : mode === "short" ? 60 : 90}
                      required
                      value={durations[mode]}
                      onChange={(e) => {
                        setDurations((d) => ({ ...d, [mode]: e.target.value }));
                        setSaved(false);
                      }}
                    />
                    <span>min</span>
                  </div>
                </label>
              ))}
            </div>
            <div className="settings-save">
              <p>
                {state.timer.status !== "idle"
                  ? "New durations apply to your next session."
                  : "A long break follows every four completed focus sessions."}
              </p>
              <Button size="sm" type="submit" disabled={busy}>
                {saved ? <Check size={14} /> : null}
                {busy ? "Saving…" : saved ? "Saved" : "Save durations"}
              </Button>
            </div>
          </form>
          <Toggle
            title="Ease into your break"
            description="Start a break automatically after a focus session."
            checked={state.settings.autoBreak}
            onChange={(v) => change({ autoBreak: v })}
          />
          <Toggle
            title="A gentle nudge"
            description="Show a desktop notification when a session ends. macOS permission may be required."
            checked={state.settings.notifications}
            onChange={(v) => change({ notifications: v })}
          />
        </section>
        <section className="card settings-card">
          <div className="settings-heading">
            <BookOpen size={19} />
            <div>
              <h2>Your work stays yours</h2>
              <p>Stored on this Mac. No accounts. No cloud.</p>
            </div>
          </div>
          <div className="backup-row">
            <div>
              <strong>A little peace of mind</strong>
              <p>Keep a JSON backup, or bring your work back.</p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              disabled={backupBusy}
              onClick={() => void backup("export")}
            >
              <ArrowDownToLine size={14} />
              Export
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={backupBusy}
              onClick={() => void backup("import")}
            >
              <ArrowUpFromLine size={14} />
              Import
            </Button>
          </div>
        </section>
        <div className="about-row">
          <div className="brand-icon">
            <BookOpen size={21} />
          </div>
          <div>
            <strong>StudyDesk</strong>
            <p>A little more intentional, every day.</p>
          </div>
          <span>
            Version {version}
            <br />
            Made for a quieter kind of progress.
          </span>
        </div>
      </div>
    </>
  );
}
function Toggle({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange(v: boolean): void;
}) {
  return (
    <div className="toggle-row">
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-label={title}
        aria-checked={checked}
        className={`toggle ${checked ? "on" : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </div>
  );
}

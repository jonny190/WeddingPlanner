import { useEffect, useState } from "react";
import type { Menu, MenuUpdate } from "../../api/types";
import { useSession } from "../../auth/session";
import { Button, IconButton } from "../../components/Button";
import { useConfirm } from "../../components/ConfirmDialog";
import { TextField } from "../../components/fields";
import { Callout } from "../../components/misc";
import { useToast } from "../../components/Toasts";
import { useUnsavedChanges } from "../../layout/NavigationGuard";
import { useSaveMenu } from "./api";

interface DraftOption {
  key: string;
  id?: string;
  name: string;
  description: string;
}

interface DraftCourse {
  key: string;
  id?: string;
  name: string;
  description: string;
  options: DraftOption[];
}

let nextKey = 1;
const key = () => `k${nextKey++}`;

function fromMenu(menu: Menu): DraftCourse[] {
  return menu.courses.map((c) => ({
    key: key(),
    id: c.id,
    name: c.name,
    description: c.description ?? "",
    options: c.options.map((o) => ({ key: key(), id: o.id, name: o.name, description: o.description ?? "" })),
  }));
}

function toUpdate(courses: DraftCourse[]): MenuUpdate {
  return {
    courses: courses.map((c) => ({
      id: c.id,
      name: c.name.trim(),
      description: c.description.trim() || null,
      options: c.options.map((o) => ({ id: o.id, name: o.name.trim(), description: o.description.trim() || null })),
    })),
  };
}

const CLASSIC = ["Starter", "Main", "Dessert"];
const blankOption = (): DraftOption => ({ key: key(), name: "", description: "" });
const blankCourse = (name = ""): DraftCourse => ({ key: key(), name, description: "", options: [blankOption()] });

/** Courses and the dishes on offer for each. Saved as a whole; ids are kept so choices survive. */
export function MenuEditor({ weddingId, eventId, eventName, menu }: { weddingId: string; eventId: string; eventName: string; menu: Menu }) {
  const { canEdit } = useSession();
  const [courses, setCourses] = useState<DraftCourse[]>(() => fromMenu(menu));
  const [dirty, setDirty] = useState(false);
  const save = useSaveMenu(weddingId, eventId);
  const toast = useToast();
  const confirm = useConfirm();
  useUnsavedChanges(dirty, "Your changes to the menu haven't been saved.");

  // A fresh copy from the server (after saving, or from another device) replaces an untouched draft.
  useEffect(() => {
    if (!dirty) setCourses(fromMenu(menu));
    // The draft must not be reset while it is being edited.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu]);

  const update = (fn: (courses: DraftCourse[]) => DraftCourse[]) => {
    setCourses(fn);
    setDirty(true);
  };
  const patchCourse = (k: string, patch: Partial<DraftCourse>) =>
    update((cs) => cs.map((c) => (c.key === k ? { ...c, ...patch } : c)));
  const patchOption = (ck: string, ok: string, patch: Partial<DraftOption>) =>
    update((cs) =>
      cs.map((c) => (c.key === ck ? { ...c, options: c.options.map((o) => (o.key === ok ? { ...o, ...patch } : o)) } : c)),
    );
  const move = (k: string, delta: number) =>
    update((cs) => {
      const i = cs.findIndex((c) => c.key === k);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= cs.length) return cs;
      const next = [...cs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const removeCourse = async (c: DraftCourse) => {
    if (c.id) {
      const ok = await confirm({
        title: `Remove ${c.name || "this course"}?`,
        message: "Any dishes guests have already chosen for it will be forgotten once you save.",
        confirmLabel: "Remove course",
        tone: "danger",
      });
      if (!ok) return;
    }
    update((cs) => cs.filter((x) => x.key !== c.key));
  };

  const removeOption = async (c: DraftCourse, o: DraftOption) => {
    if (o.id) {
      const ok = await confirm({
        title: `Remove ${o.name || "this dish"}?`,
        message: "Guests who chose it will need to choose again once you save.",
        confirmLabel: "Remove dish",
        tone: "danger",
      });
      if (!ok) return;
    }
    patchCourse(c.key, { options: c.options.filter((x) => x.key !== o.key) });
  };

  const problems = courses.flatMap((c) => {
    const out: string[] = [];
    if (!c.name.trim()) out.push("Every course needs a name.");
    if (c.options.length === 0) out.push(`${c.name || "A course"} needs at least one dish.`);
    if (c.options.some((o) => !o.name.trim())) out.push(`Every dish in ${c.name || "a course"} needs a name.`);
    return out;
  });

  const onSave = () => {
    if (problems.length > 0) return;
    save.mutate(toUpdate(courses), {
      onSuccess: () => {
        setDirty(false);
        toast.success(courses.length === 0 ? `${eventName} no longer has a menu.` : "Menu saved.");
      },
      onError: (err) => toast.error(err),
    });
  };

  const saveButton = (
    <Button variant="primary" onClick={onSave} loading={save.isPending} disabled={problems.length > 0}>
      Save menu
    </Button>
  );

  return (
    <section className="card">
      <header className="card-header">
        <div>
          <h2 className="section-title">Menu for {eventName}</h2>
          <div className="small muted">
            Add each course and the dishes guests can pick from. A course with one dish is simply what everyone gets.
          </div>
        </div>
        {canEdit && dirty && saveButton}
      </header>
      <div className="card-body stack">
        {courses.length === 0 && (
          <div className="menu-empty">
            <p className="muted">
              No menu yet, so guests simply reply yes or no. Add courses here and they will be asked what they would
              like when they accept.
            </p>
            {canEdit && (
              <div>
                <Button variant="secondary" icon="plus" onClick={() => update(() => CLASSIC.map((name) => blankCourse(name)))}>
                  Start with starter, main and dessert
                </Button>
              </div>
            )}
          </div>
        )}

        {courses.map((c, index) => (
          <fieldset key={c.key} className="menu-course" disabled={!canEdit}>
            <div className="menu-course-head">
              <TextField
                label={`Course ${index + 1}`}
                placeholder="e.g. Starter"
                maxLength={120}
                required
                value={c.name}
                onChange={(e) => patchCourse(c.key, { name: e.target.value })}
                className="grow"
              />
              {canEdit && (
                <div className="menu-course-tools">
                  <IconButton icon="chevronUp" label="Move course up" disabled={index === 0} onClick={() => move(c.key, -1)} />
                  <IconButton
                    icon="chevronDown"
                    label="Move course down"
                    disabled={index === courses.length - 1}
                    onClick={() => move(c.key, 1)}
                  />
                  <IconButton icon="trash" tone="danger" label={`Remove ${c.name || "course"}`} onClick={() => void removeCourse(c)} />
                </div>
              )}
            </div>
            <TextField
              label="Note (optional)"
              placeholder="e.g. Served with seasonal vegetables"
              maxLength={1000}
              value={c.description}
              onChange={(e) => patchCourse(c.key, { description: e.target.value })}
            />
            <div className="menu-options">
              <div className="small muted menu-options-label">Dishes</div>
              {c.options.map((o, oi) => (
                <div key={o.key} className="menu-option">
                  <TextField
                    label={`${c.name || `Course ${index + 1}`} dish ${oi + 1}`}
                    hideLabel
                    placeholder="Dish"
                    maxLength={200}
                    required
                    value={o.name}
                    onChange={(e) => patchOption(c.key, o.key, { name: e.target.value })}
                    className="grow"
                  />
                  <TextField
                    label={`${c.name || `Course ${index + 1}`} dish ${oi + 1} note`}
                    hideLabel
                    placeholder="Note, e.g. vegetarian"
                    maxLength={1000}
                    value={o.description}
                    onChange={(e) => patchOption(c.key, o.key, { description: e.target.value })}
                    className="grow"
                  />
                  {canEdit && (
                    <IconButton
                      icon="close"
                      label={`Remove ${o.name || "dish"}`}
                      disabled={c.options.length === 1}
                      onClick={() => void removeOption(c, o)}
                    />
                  )}
                </div>
              ))}
              {canEdit && (
                <div>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="plus"
                    onClick={() => patchCourse(c.key, { options: [...c.options, blankOption()] })}
                  >
                    Add a dish
                  </Button>
                </div>
              )}
            </div>
          </fieldset>
        ))}

        {canEdit && courses.length > 0 && (
          <div className="row-between">
            <Button variant="secondary" icon="plus" onClick={() => update((cs) => [...cs, blankCourse()])}>
              Add a course
            </Button>
            {dirty && saveButton}
          </div>
        )}
        {dirty && problems.length > 0 && <Callout tone="warning">{problems[0]}</Callout>}
      </div>
    </section>
  );
}

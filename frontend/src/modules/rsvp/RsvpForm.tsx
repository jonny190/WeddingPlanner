import { useState } from "react";
import { errorMessage } from "../../api/client";
import type { ChoiceMap, MenuCourse, RsvpEvent, RsvpSubmit, RsvpView } from "../../api/types";
import { formatEventWhen, orNull } from "../../lib/format";
import { cx } from "../../lib/utils";
import { useSubmitRsvp } from "./api";

interface Answer {
  attending: boolean | null;
  plusOne: boolean | null;
  plusOneName: string;
  plusOneDietary: string;
  /** course id -> option id, for the guest and for the person they are bringing */
  menu: ChoiceMap;
  plusOneMenu: ChoiceMap;
}

function initialAnswer(e: RsvpEvent): Answer {
  return {
    attending: e.rsvp_status === "attending" ? true : e.rsvp_status === "declined" ? false : null,
    plusOne: e.plus_one_attending,
    plusOneName: e.plus_one_name ?? "",
    plusOneDietary: e.plus_one_dietary ?? "",
    menu: { ...e.menu_choices.guest },
    plusOneMenu: { ...e.menu_choices.plus_one },
  };
}

/** Courses still without a dish. */
function missingCourses(courses: MenuCourse[], picks: ChoiceMap): MenuCourse[] {
  return courses.filter((c) => !picks[c.id]);
}

interface Props {
  token: string;
  view: RsvpView;
  events: RsvpEvent[];
  onDone: () => void;
  onCancel?: () => void;
}

export function RsvpForm({ token, view, events, onDone, onCancel }: Props) {
  const [answers, setAnswers] = useState<Record<string, Answer>>(() =>
    Object.fromEntries(events.map((e) => [e.event_id, initialAnswer(e)])),
  );
  const [dietary, setDietary] = useState(view.dietary_requirements ?? "");
  const [message, setMessage] = useState(view.message ?? "");
  const [showErrors, setShowErrors] = useState(false);
  const submit = useSubmitRsvp(token);

  const set = (eventId: string, patch: Partial<Answer>) =>
    setAnswers((a) => ({ ...a, [eventId]: { ...a[eventId], ...patch } }));

  const unanswered = events.filter((e) => answers[e.event_id]?.attending === null);
  const anyAttending = events.some((e) => answers[e.event_id]?.attending);
  // Events where someone coming has not picked every course yet.
  const unchosen = events.filter((e) => {
    const a = answers[e.event_id];
    if (!a?.attending || e.menu.length === 0) return false;
    if (missingCourses(e.menu, a.menu).length > 0) return true;
    return e.plus_one_allowed && a.plusOne === true && missingCourses(e.menu, a.plusOneMenu).length > 0;
  });

  const onSubmit = () => {
    if (unanswered.length > 0) {
      setShowErrors(true);
      document.getElementById(`rsvp-q-${unanswered[0].event_id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (unchosen.length > 0) {
      setShowErrors(true);
      document.getElementById(`rsvp-menu-${unchosen[0].event_id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const data: RsvpSubmit = {
      responses: events.map((e) => {
        const a = answers[e.event_id];
        const attending = Boolean(a.attending);
        const bringing = attending && e.plus_one_allowed ? Boolean(a.plusOne) : null;
        return {
          event_id: e.event_id,
          attending,
          plus_one_attending: bringing,
          plus_one_name: bringing ? orNull(a.plusOneName) : null,
          plus_one_dietary: bringing ? orNull(a.plusOneDietary) : null,
          menu_choices: attending && e.menu.length > 0 ? { guest: a.menu, plus_one: bringing ? a.plusOneMenu : {} } : null,
        };
      }),
      // An empty string clears previously given requirements.
      dietary_requirements: dietary.trim(),
      message: orNull(message),
    };
    submit.mutate(data, { onSuccess: onDone });
  };

  return (
    <form
      className="rsvp-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      noValidate
    >
      {events.map((e) => {
        const a = answers[e.event_id];
        const missing = showErrors && a.attending === null;
        return (
          <fieldset key={e.event_id} className={cx("rsvp-question", missing && "missing")} id={`rsvp-q-${e.event_id}`}>
            <legend>
              <span className="rsvp-q-name">{e.name}</span>
              {e.starts_at && <span className="rsvp-q-when">{formatEventWhen(e.starts_at, e.ends_at)}</span>}
            </legend>
            <div className="rsvp-choices">
              <label className={cx("rsvp-choice", a.attending === true && "chosen")}>
                <input
                  type="radio"
                  name={`attending-${e.event_id}`}
                  checked={a.attending === true}
                  onChange={() => set(e.event_id, { attending: true })}
                />
                <span>Joyfully accept</span>
              </label>
              <label className={cx("rsvp-choice", a.attending === false && "chosen decline")}>
                <input
                  type="radio"
                  name={`attending-${e.event_id}`}
                  checked={a.attending === false}
                  onChange={() => set(e.event_id, { attending: false })}
                />
                <span>Regretfully decline</span>
              </label>
            </div>
            {missing && (
              <p className="rsvp-missing" role="alert">
                Please let us know if you can come to the {e.name}.
              </p>
            )}

            {a.attending === true && e.plus_one_allowed && (
              <div className="rsvp-plus-one">
                <p className="rsvp-sub-q" id={`po-${e.event_id}`}>
                  Will you bring a guest?
                </p>
                <div className="rsvp-choices small" role="radiogroup" aria-labelledby={`po-${e.event_id}`}>
                  <label className={cx("rsvp-choice", a.plusOne === true && "chosen")}>
                    <input
                      type="radio"
                      name={`plus-one-${e.event_id}`}
                      checked={a.plusOne === true}
                      onChange={() => set(e.event_id, { plusOne: true })}
                    />
                    <span>Yes, I'll bring someone</span>
                  </label>
                  <label className={cx("rsvp-choice", a.plusOne === false && "chosen")}>
                    <input
                      type="radio"
                      name={`plus-one-${e.event_id}`}
                      checked={a.plusOne === false}
                      onChange={() => set(e.event_id, { plusOne: false })}
                    />
                    <span>Just me</span>
                  </label>
                </div>
                {a.plusOne === true && (
                  <div className="rsvp-fields">
                    <label className="rsvp-field">
                      <span>Their name</span>
                      <input
                        className="rsvp-input"
                        value={a.plusOneName}
                        maxLength={200}
                        autoComplete="off"
                        onChange={(ev) => set(e.event_id, { plusOneName: ev.target.value })}
                      />
                    </label>
                    <label className="rsvp-field">
                      <span>Their dietary requirements</span>
                      <input
                        className="rsvp-input"
                        value={a.plusOneDietary}
                        maxLength={2000}
                        placeholder="Leave blank if none"
                        onChange={(ev) => set(e.event_id, { plusOneDietary: ev.target.value })}
                      />
                    </label>
                  </div>
                )}
              </div>
            )}

            {a.attending === true && e.menu.length > 0 && (
              <div className="rsvp-menu" id={`rsvp-menu-${e.event_id}`}>
                <MenuPicker
                  title="What would you like?"
                  courses={e.menu}
                  value={a.menu}
                  namePrefix={`menu-${e.event_id}`}
                  showMissing={showErrors}
                  onChange={(menu) => set(e.event_id, { menu })}
                />
                {e.plus_one_allowed && a.plusOne === true && (
                  <MenuPicker
                    title={a.plusOneName.trim() ? `And for ${a.plusOneName.trim()}?` : "And for your guest?"}
                    courses={e.menu}
                    value={a.plusOneMenu}
                    namePrefix={`plus-one-menu-${e.event_id}`}
                    showMissing={showErrors}
                    onChange={(plusOneMenu) => set(e.event_id, { plusOneMenu })}
                  />
                )}
              </div>
            )}
          </fieldset>
        );
      })}

      {anyAttending && (
        <label className="rsvp-field">
          <span>Your dietary requirements</span>
          <textarea
            className="rsvp-input"
            rows={2}
            maxLength={2000}
            placeholder="Allergies, vegetarian, anything we should know"
            value={dietary}
            onChange={(e) => setDietary(e.target.value)}
          />
        </label>
      )}
      <label className="rsvp-field">
        <span>A message for {view.couple_names}</span>
        <textarea
          className="rsvp-input"
          rows={3}
          maxLength={2000}
          placeholder="Optional"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </label>

      {submit.isError && (
        <p className="rsvp-error" role="alert">
          {errorMessage(submit.error)}
        </p>
      )}
      {showErrors && unanswered.length > 0 && (
        <p className="rsvp-error" role="alert">
          Please answer for {unanswered.map((e) => e.name).join(" and ")}.
        </p>
      )}
      {showErrors && unanswered.length === 0 && unchosen.length > 0 && (
        <p className="rsvp-error" role="alert">
          Please choose a dish for every course for {unchosen.map((e) => e.name).join(" and ")}.
        </p>
      )}

      <div className="rsvp-actions">
        <button type="submit" className="rsvp-btn" disabled={submit.isPending}>
          {submit.isPending ? "Sending…" : "Send my reply"}
        </button>
        {onCancel && (
          <button type="button" className="rsvp-btn-ghost" onClick={onCancel} disabled={submit.isPending}>
            Keep my previous reply
          </button>
        )}
      </div>
    </form>
  );
}

interface MenuPickerProps {
  title: string;
  courses: MenuCourse[];
  value: ChoiceMap;
  namePrefix: string;
  showMissing: boolean;
  onChange: (next: ChoiceMap) => void;
}

/** One person's dishes, course by course. */
function MenuPicker({ title, courses, value, namePrefix, showMissing, onChange }: MenuPickerProps) {
  return (
    <div className="rsvp-menu-person">
      <p className="rsvp-sub-q">{title}</p>
      {courses.map((c) => {
        const missing = showMissing && !value[c.id];
        return (
          <div key={c.id} className={cx("rsvp-menu-course", missing && "missing")} role="radiogroup" aria-label={`${title} ${c.name}`}>
            <p className="rsvp-menu-course-name">
              {c.name}
              {c.description && <span className="rsvp-menu-note"> {c.description}</span>}
            </p>
            <div className="rsvp-choices small">
              {c.options.map((o) => (
                <label key={o.id} className={cx("rsvp-choice", value[c.id] === o.id && "chosen")}>
                  <input
                    type="radio"
                    name={`${namePrefix}-${c.id}`}
                    checked={value[c.id] === o.id}
                    onChange={() => onChange({ ...value, [c.id]: o.id })}
                  />
                  <span>
                    {o.name}
                    {o.description && <span className="rsvp-menu-note"> {o.description}</span>}
                  </span>
                </label>
              ))}
            </div>
            {missing && (
              <p className="rsvp-missing" role="alert">
                Please pick a {c.name.toLowerCase()}.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

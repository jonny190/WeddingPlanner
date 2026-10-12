// Undo/redo for a controlled design. The parent owns `design`; we remember the
// designs we emitted through onChange, and start a fresh history whenever the parent
// swaps in a design we did not produce (e.g. switching drafts).
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { deepEqual } from "./model";
import type { InvitationDesign } from "./types";

export interface CommitOptions {
  /**
   * Consecutive commits with the same key coalesce into one undo step while they
   * arrive within `windowMs` of each other (a drag, a slider, a typing session).
   */
  key?: string;
  /** Default 1000ms. Use Infinity for keys that are unique per gesture. */
  windowMs?: number;
}

export interface DesignHistory {
  commit: (next: InvitationDesign, opts?: CommitOptions) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** The latest design, including changes the parent has not rendered yet. */
  current: () => InvitationDesign;
}

const LIMIT = 100;

export function useDesignHistory(
  design: InvitationDesign,
  onChange: (design: InvitationDesign) => void,
): DesignHistory {
  const stacks = useRef({
    past: [] as InvitationDesign[],
    future: [] as InvitationDesign[],
    lastKey: undefined as string | undefined,
    lastTime: 0,
    lastEmitted: null as InvitationDesign | null,
  });
  const currentRef = useRef(design);
  const emitted = useRef(new WeakSet<InvitationDesign>());
  const onChangeRef = useRef(onChange);
  const [, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  useLayoutEffect(() => {
    onChangeRef.current = onChange;
  });

  useLayoutEffect(() => {
    const s = stacks.current;
    currentRef.current = design;
    if (emitted.current.has(design)) return;
    if (s.lastEmitted && deepEqual(design, s.lastEmitted)) {
      // Same content in a new object (e.g. the saved copy returned by the API).
      emitted.current.add(design);
      s.lastEmitted = design;
      return;
    }
    // A design we did not produce: start a fresh history.
    emitted.current.add(design);
    s.lastEmitted = design;
    s.lastKey = undefined;
    if (s.past.length || s.future.length) {
      s.past = [];
      s.future = [];
      bump();
    }
  }, [design, bump]);

  const emit = useCallback((next: InvitationDesign) => {
    const s = stacks.current;
    s.lastEmitted = next;
    currentRef.current = next;
    emitted.current.add(next);
    onChangeRef.current(next);
  }, []);

  const commit = useCallback(
    (next: InvitationDesign, opts: CommitOptions = {}) => {
      const s = stacks.current;
      const prev = currentRef.current;
      if (next === prev) return;
      const now = Date.now();
      const coalesce =
        opts.key !== undefined && opts.key === s.lastKey && now - s.lastTime <= (opts.windowMs ?? 1000);
      const changedStacks = !coalesce || s.future.length > 0;
      if (!coalesce) {
        s.past.push(prev);
        if (s.past.length > LIMIT) s.past.shift();
      }
      s.future = [];
      s.lastKey = opts.key;
      s.lastTime = now;
      emit(next);
      if (changedStacks) bump();
    },
    [bump, emit],
  );

  const undo = useCallback(() => {
    const s = stacks.current;
    const prev = s.past.pop();
    if (!prev) return;
    s.future.push(currentRef.current);
    s.lastKey = undefined;
    emit(prev);
    bump();
  }, [bump, emit]);

  const redo = useCallback(() => {
    const s = stacks.current;
    const next = s.future.pop();
    if (!next) return;
    s.past.push(currentRef.current);
    s.lastKey = undefined;
    emit(next);
    bump();
  }, [bump, emit]);

  const current = useCallback(() => currentRef.current, []);

  return {
    commit,
    undo,
    redo,
    canUndo: stacks.current.past.length > 0,
    canRedo: stacks.current.future.length > 0,
    current,
  };
}

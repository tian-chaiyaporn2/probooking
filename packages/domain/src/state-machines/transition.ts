/**
 * Generic, data-driven state machine. Each record lifecycle (§6.2) is expressed as
 * an allow-list of transitions. Illegal transitions throw — there is no implicit
 * path between states, which keeps history honest (§6.4 "accepted terms and
 * verification snapshots are immutable"; overlays never overwrite base state §6.2).
 */

export type TransitionMap<S extends string> = Readonly<Record<S, readonly S[]>>;

export class IllegalTransitionError extends Error {
  constructor(
    public readonly machine: string,
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`[${machine}] illegal transition: ${from} -> ${to}`);
    this.name = "IllegalTransitionError";
  }
}

export function canTransition<S extends string>(map: TransitionMap<S>, from: S, to: S): boolean {
  return map[from]?.includes(to) ?? false;
}

export function assertTransition<S extends string>(
  machine: string,
  map: TransitionMap<S>,
  from: S,
  to: S,
): S {
  if (!canTransition(map, from, to)) {
    throw new IllegalTransitionError(machine, from, to);
  }
  return to;
}

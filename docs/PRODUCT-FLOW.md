# Campus Film Hunt product contract

This is the locked interaction model for the onboarding experience. It is the
target for the next implementation pass and takes priority over older visual
or navigation notes.

## Product promise

Help a new joiner learn the campus by solving film-location mysteries quickly,
without handing them a map or revealing the answer too early.

The player should always know one thing: what to do next.

## Core loop

```text
Mystery → subtle nudge → search → discovery → reward → next mystery
```

## Screen and session model

```text
Welcome → Permission setup → Hunt dashboard ↔ Camera search
                                      ↓
                         AR discovery → clue + clip reward
                                      ↓
                            next mystery / finish
```

The camera session is created once and remains alive for the hunt. Opening the
Hunt sheet must not stop XR, reset the world origin, reload video, or lose the
current mystery. `Exit hunt` is the only deliberate way to leave the camera.

## Player-facing rules

- The heat meter is feedback, not a control.
- The default target is the nearest undiscovered mystery.
- Choosing another mystery is secondary and lives in the Hunt sheet.
- Exact location names and movie titles stay hidden until discovery.
- Player language is plain: `Not found`, `Ready`, `Found`.
- Every screen has one primary action.
- Clues nudge without giving away the answer.
- Permissions are requested at the moment they are needed.
- Every camera action has a tap and keyboard equivalent where applicable.
- Reduced-motion and reduced-transparency settings preserve comprehension.

## Clue ladder

1. **Far:** a thematic clue about the scene or campus story.
2. **Warm:** a broad environmental cue.
3. **Close:** a sensory or visual nudge that helps the player search.
4. **Found:** location, film connection, clip, and a campus fact.

Clues must not expose an exact building name, coordinates, or movie title before
the reveal unless the player explicitly requests an optional stronger hint.

## Discovery reward

The reveal contains the discovered place, film connection, world-anchored clip,
split time, one campus fact, and one `Next mystery` action. Dismissal remains
available through outside tap or Escape, with focus restored to the trigger.

## Demo mode

- Starts a fresh hunt.
- Opens on the first mystery immediately.
- Uses the same reveal and completion states as a real hunt.
- Exposes optional jump controls for testing all mysteries.
- Never changes production rules or requires URL parameters.

## Gamification and backend boundary

The first release needs one clock, split times, discovery order, personal best,
and a final verified leaderboard position. Later layers may add streaks,
optional clue bonuses, titles, and campus facts.

The eventual client event stream is:

```text
hunt_started, mystery_selected, clue_unlocked, camera_opened,
location_reached, scene_revealed, hunt_completed
```

The server owns score validation: event order, timestamps, coarse proximity,
GPS accuracy, duplicate events, and impossible completion times. Precise
location should not be retained unless there is a clear product need.

## Success criteria

- A first-time player can start without operator instruction.
- The next action is visible without scrolling or opening a menu.
- Camera ↔ Hunt sheet feels like one continuous session.
- The answer cannot be inferred from the dashboard.
- A discovery feels rewarding within one interaction.
- Demo mode resets and replays quickly.
- Real progress survives reloads and can later sync to a backend.

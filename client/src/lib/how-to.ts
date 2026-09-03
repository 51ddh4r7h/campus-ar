/**
 * The rules, in one place.
 *
 * Shown twice — inline on the briefing before a player starts, and in the
 * sheet they can pull up mid-hunt. Same words both times, because a player
 * checking the rules at level three should read exactly what they agreed to at
 * level zero.
 */
import type {IconName} from './components/Icon.svelte'

export interface HowToRow {
  icon: IconName
  title: string
  body: string
}

export const HOW_TO: readonly HowToRow[] = [
  {icon: 'film', title: 'The clip is the clue.', body: 'It shows a real place on this campus. No map, no arrows.'},
  {icon: 'pin', title: 'Walk there with your phone.', body: "You'll know you've arrived — the scene plays where it was shot."},
  {icon: 'steps', title: 'Five scenes, in order.', body: 'Each one you find unlocks the next.'},
  {icon: 'bulb', title: 'Stuck? Take a hint.', body: 'It costs you time, and it costs everyone the same.'},
  {icon: 'path', title: 'Your route is yours alone.', body: "It won't match anyone else's."},
  {icon: 'timer', title: 'Fastest fair time wins.', body: 'Your score adjusts for how far your route was.'},
]

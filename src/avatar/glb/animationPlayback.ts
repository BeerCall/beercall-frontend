import { LoopOnce, LoopRepeat, type AnimationAction } from 'three';

export type PlaybackCommand = 'crossfade' | 'start' | 'restart' | 'hold';

export interface PlaybackInput {
  /** Le clip demandé est déjà celui qui joue. */
  sameClip: boolean;
  /** Au moins une action existe déjà pour ce mixer. */
  hasAction: boolean;
  /** L'action précédente existe et diffère de la suivante. */
  hasPrevious: boolean;
  /** Le clip boucle (flag `l`) ou non (flag `o`). */
  loop: boolean;
  /** Un nouvel appui a été enregistré depuis le dernier rendu. */
  replayChanged: boolean;
}

/**
 * Décide quoi faire pour le clip actif.
 * - nouveau clip : fondu enchaîné s'il y avait une action, sinon démarrage ;
 * - même clip sur un mixer neuf (avatar reconstruit) : démarrage ;
 * - même clip `o` + nouvel appui : relance depuis le début ;
 * - même clip `l` : on laisse tourner, sans redémarrage.
 */
export function resolvePlaybackCommand({
  sameClip,
  hasAction,
  hasPrevious,
  loop,
  replayChanged,
}: PlaybackInput): PlaybackCommand {
  if (!sameClip) return hasPrevious ? 'crossfade' : 'start';
  if (!hasAction) return 'start';
  if (!loop && replayChanged) return 'restart';
  return 'hold';
}

/** Applique le flag de boucle : `o` = une fois + dernière pose conservée. */
export function applyLoopMode(action: AnimationAction, loop: boolean): void {
  action.setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1);
  action.clampWhenFinished = !loop;
}

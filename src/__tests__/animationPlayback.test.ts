import { describe, expect, it, vi } from 'vitest';
import { LoopOnce, LoopRepeat, type AnimationAction } from 'three';
import { applyLoopMode, resolvePlaybackCommand } from '../avatar/glb/animationPlayback';

function fakeAction() {
  return {
    setLoop: vi.fn(),
    clampWhenFinished: false,
  } as unknown as AnimationAction & { setLoop: ReturnType<typeof vi.fn>; clampWhenFinished: boolean };
}

describe('animationPlayback', () => {
  it('applique LoopOnce + clamp pour un clip o', () => {
    const action = fakeAction();
    applyLoopMode(action, false);
    expect(action.setLoop).toHaveBeenCalledWith(LoopOnce, 1);
    expect(action.clampWhenFinished).toBe(true);
  });

  it('applique LoopRepeat pour un clip l', () => {
    const action = fakeAction();
    applyLoopMode(action, true);
    expect(action.setLoop).toHaveBeenCalledWith(LoopRepeat, Infinity);
    expect(action.clampWhenFinished).toBe(false);
  });

  it('démarre un nouveau clip sans fondu quand aucune action précédente', () => {
    expect(resolvePlaybackCommand({ sameClip: false, hasPrevious: false, loop: true, replayChanged: false })).toBe('start');
  });

  it('enchaîne en fondu un nouveau clip quand une action existe', () => {
    expect(resolvePlaybackCommand({ sameClip: false, hasPrevious: true, loop: false, replayChanged: false })).toBe('crossfade');
  });

  it('relance un clip o déjà actif sur nouvel appui', () => {
    expect(resolvePlaybackCommand({ sameClip: true, hasPrevious: true, loop: false, replayChanged: true })).toBe('restart');
  });

  it('ne relance jamais un clip l sur nouvel appui', () => {
    expect(resolvePlaybackCommand({ sameClip: true, hasPrevious: true, loop: true, replayChanged: true })).toBe('hold');
  });

  it('ne relance pas un clip o sans nouvel appui', () => {
    expect(resolvePlaybackCommand({ sameClip: true, hasPrevious: true, loop: false, replayChanged: false })).toBe('hold');
  });
});

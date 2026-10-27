import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import {
  createAvatarCanvasLoader,
  type AvatarCanvasModule,
  type AvatarCanvasProps,
} from '../components/3D/avatarCanvasLoader';

function createMockComponent(label: string): React.ComponentType<AvatarCanvasProps> {
  const comp = () => React.createElement('div', { 'data-testid': label });
  comp.displayName = `MockComponent(${label})`;
  return comp;
}

describe('avatarCanvasLoader (T35 / VER-03)', () => {
  it('démarre à la génération 0 avec statut idle et résout l\'import nominal', async () => {
    const mockComponent = createMockComponent('nominal');
    const importer = vi.fn().mockResolvedValue({ default: mockComponent });
    const loader = createAvatarCanvasLoader(importer);

    expect(loader.getGeneration()).toBe(0);
    expect(loader.getStatus()).toBe('idle');

    const promise = loader.load();
    expect(loader.getStatus()).toBe('pending');

    const mod = await promise;
    expect(mod.default).toBe(mockComponent);
    expect(loader.getStatus()).toBe('resolved');
    expect(importer).toHaveBeenCalledTimes(1);

    // Les appels ultérieurs réutilisent la promesse résolue sans ré-importer
    const second = await loader.load();
    const preload = await loader.preload();
    expect(second).toBe(mod);
    expect(preload).toBe(mod);
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it('déduplique les appels concurrents à load() et preload() sur un seul import', async () => {
    let resolveImport!: (value: AvatarCanvasModule) => void;
    const importer = vi.fn().mockImplementation(
      () =>
        new Promise<AvatarCanvasModule>(resolve => {
          resolveImport = resolve;
        })
    );
    const loader = createAvatarCanvasLoader(importer);

    const p1 = loader.load();
    const p2 = loader.preload();
    const p3 = loader.load();

    expect(importer).toHaveBeenCalledTimes(1);
    expect(p1).toBe(p2);
    expect(p2).toBe(p3);
    expect(loader.getStatus()).toBe('pending');

    const mockComp = createMockComponent('dedup');
    resolveImport({ default: mockComp });

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(r1.default).toBe(mockComp);
    expect(r2.default).toBe(mockComp);
    expect(r3.default).toBe(mockComp);
    expect(loader.getStatus()).toBe('resolved');
  });

  it('enregistre l\'échec, ne déclenche aucune tentative automatique supplémentaire', async () => {
    const error = new Error('ChunkLoadError: failed to fetch dynamic import');
    const importer = vi.fn().mockRejectedValue(error);
    const loader = createAvatarCanvasLoader(importer);

    await expect(loader.load()).rejects.toThrow('ChunkLoadError');
    expect(loader.getStatus()).toBe('rejected');
    expect(loader.getGeneration()).toBe(0);
    expect(importer).toHaveBeenCalledTimes(1);

    // Aucun import supplémentaire n'est déclenché par un nouvel appel load() ou preload()
    await expect(loader.load()).rejects.toThrow('ChunkLoadError');
    await expect(loader.preload()).rejects.toThrow('ChunkLoadError');
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it('convertit les exceptions synchrones de l\'importer en rejet sans crasher', async () => {
    const importer = vi.fn().mockImplementation(() => {
      throw new Error('Sync error during dynamic import resolution');
    });
    const loader = createAvatarCanvasLoader(importer);

    await expect(loader.load()).rejects.toThrow('Sync error');
    expect(loader.getStatus()).toBe('rejected');
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it('conserve une référence lazy strictement stable au sein d\'une même génération', () => {
    const importer = vi.fn().mockResolvedValue({ default: createMockComponent('stable') });
    const loader = createAvatarCanvasLoader(importer);

    const lazy1 = loader.getLazyComponent();
    const lazy2 = loader.getLazyComponent();
    const lazy3 = loader.getLazyComponent();

    expect(lazy1).toBe(lazy2);
    expect(lazy2).toBe(lazy3);
  });

  it('retry() ne fait rien si le statut n\'est pas rejected', () => {
    const importer = vi.fn().mockResolvedValue({ default: createMockComponent('ok') });
    const loader = createAvatarCanvasLoader(importer);

    // Statut idle : pas de retry
    expect(loader.retry()).toBe(0);
    expect(loader.getGeneration()).toBe(0);

    // Statut pending/resolved
    void loader.load();
    expect(loader.retry(0)).toBe(0);
    expect(loader.getGeneration()).toBe(0);
  });

  it('retry() invalide la génération rejetée, incrémente et déclenche la tentative suivante', async () => {
    const compRetry = createMockComponent('retry-ok');
    const importer = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network error attempt 1'))
      .mockResolvedValueOnce({ default: compRetry });

    const loader = createAvatarCanvasLoader(importer);
    const lazyGen0 = loader.getLazyComponent();

    await expect(loader.load()).rejects.toThrow('Network error attempt 1');
    expect(loader.getStatus()).toBe('rejected');
    expect(loader.getGeneration()).toBe(0);
    expect(importer).toHaveBeenCalledTimes(1);

    // Clic explicite de réessai
    const nextGen = loader.retry(0);
    expect(nextGen).toBe(1);
    expect(loader.getGeneration()).toBe(1);
    expect(loader.getStatus()).toBe('pending');
    expect(importer).toHaveBeenCalledTimes(2);

    // Le composant lazy est renouvelé
    const lazyGen1 = loader.getLazyComponent();
    expect(lazyGen1).not.toBe(lazyGen0);

    const mod = await loader.load();
    expect(mod.default).toBe(compRetry);
    expect(loader.getStatus()).toBe('resolved');
  });

  it('déduplique les clics de plusieurs instances sur la même génération rejetée', async () => {
    const compMulti = createMockComponent('multi-ok');
    const importer = vi
      .fn()
      .mockRejectedValueOnce(new Error('Chunk failure'))
      .mockResolvedValueOnce({ default: compMulti });

    const loader = createAvatarCanvasLoader(importer);

    await expect(loader.load()).rejects.toThrow('Chunk failure');
    expect(loader.getGeneration()).toBe(0);
    expect(importer).toHaveBeenCalledTimes(1);

    // Instance 1 clique sur Réessayer (sur génération rejetée 0)
    const genAfterFirstClick = loader.retry(0);
    expect(genAfterFirstClick).toBe(1);
    expect(importer).toHaveBeenCalledTimes(2);

    // Instance 2 clique également sur Réessayer (alors qu'elle avait échoué sur la génération 0)
    const genAfterSecondClick = loader.retry(0);
    // Comme la génération courante est déjà 1, le retry(0) ne ré-invalide pas et ne refait aucun import
    expect(genAfterSecondClick).toBe(1);
    expect(importer).toHaveBeenCalledTimes(2);

    const mod = await loader.load();
    expect(mod.default).toBe(compMulti);
    expect(loader.getStatus()).toBe('resolved');
  });
});

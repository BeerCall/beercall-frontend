import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { webcrypto } from 'node:crypto';
import { readAnimationResponse, useAvatarAnimations } from '../hooks/useAvatarAnimations';
import type { AnimationManifest } from '../types/animationPack';

let manifest: AnimationManifest;
const bodies = new Map<string, Uint8Array>();
const clients: QueryClient[] = [];
const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;
let holdDeferred: (() => Promise<Response>) | undefined;
const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url === manifest.deferred.url && holdDeferred) return holdDeferred();
  const body = bodies.get(url);
  return new Response(body ? new Uint8Array(body) : null, { status: body ? 200 : 404 });
});
function wrapper() {
  const client = new QueryClient(); clients.push(client);
  return ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
async function advanceFrame() {
  await act(async () => {
    const batch = [...frames]; frames.clear();
    batch.forEach(([, callback]) => callback(performance.now()));
  });
}
const count = (url: string) => fetchMock.mock.calls.filter(([input]) => String(input) === url).length;

beforeAll(async () => {
  const directory = resolve(__dirname, '../../public/animations');
  const manifestBytes = new Uint8Array(await readFile(resolve(directory, 'manifest.json')));
  manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
  bodies.set('/animations/manifest.json', manifestBytes);
  for (const meta of [manifest.critical, manifest.deferred]) bodies.set(meta.url, new Uint8Array(await readFile(resolve(directory, meta.file))));
});
beforeEach(() => {
  fetchMock.mockClear(); holdDeferred = undefined; frames.clear(); nextFrame = 0;
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});
afterEach(() => { clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); });

describe('shared progressive avatar animations', () => {
  it('exposes all 25 names immediately and keeps Idle until a frame AND paint opportunity', async () => {
    const { result } = renderHook(() => useAvatarAnimations(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.activeClip?.name).toBe('Idle'));
    expect(result.current.clipNames).toEqual(manifest.clips);
    expect(count(manifest.deferred.url)).toBe(0);
    const idle = result.current.activeClip;
    act(() => result.current.notifyInitialFrame());
    await advanceFrame();
    expect(count(manifest.deferred.url)).toBe(0);
    await advanceFrame();
    await waitFor(() => expect(result.current.deferredStatus).toBe('ready'));
    expect(result.current.activeClip).toBe(idle);
    expect(count(manifest.deferred.url)).toBe(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/animations/manifest.json');
  });
  it('deduplicates manifest, critical and deferred across two avatars in one QueryClient', async () => {
    const { result } = renderHook(() => [useAvatarAnimations(), useAvatarAnimations()] as const, { wrapper: wrapper() });
    await waitFor(() => expect(result.current[0].activeClip?.name).toBe('Idle'));
    expect(result.current[1].activeClip).toBe(result.current[0].activeClip);
    act(() => { result.current[0].notifyInitialFrame(); result.current[1].notifyInitialFrame(); });
    await advanceFrame(); await advanceFrame();
    await waitFor(() => expect(result.current[1].deferredStatus).toBe('ready'));
    for (const url of ['/animations/manifest.json', manifest.critical.url, manifest.deferred.url]) expect(count(url)).toBe(1);
  });
  it('a non-Idle selection starts the deferred request without waiting for a frame; latest choice wins', async () => {
    let release: ((response: Response) => void) | undefined;
    holdDeferred = () => new Promise(resolveResponse => { release = resolveResponse; });
    const { result, rerender } = renderHook(({ name }) => useAvatarAnimations(name), { initialProps: { name: 'Walk' }, wrapper: wrapper() });
    await waitFor(() => expect(count(manifest.deferred.url)).toBe(1));
    expect(result.current.activeClip?.name).toBe('Idle');
    rerender({ name: 'Death' });
    await act(async () => release?.(new Response(new Uint8Array(bodies.get(manifest.deferred.url)!))));
    await waitFor(() => expect(result.current.activeClip?.name).toBe('Death'));
    expect(count(manifest.deferred.url)).toBe(1);
    const clip = await result.current.getClip('Death');
    expect(clip).toBe(result.current.activeClip);
  });
  it('does not replace Idle when the deferred payload arrives after a changed selection', async () => {
    let release: ((response: Response) => void) | undefined;
    holdDeferred = () => new Promise(resolveResponse => { release = resolveResponse; });
    const { result, rerender } = renderHook(({ name }) => useAvatarAnimations(name), { initialProps: { name: 'Walk' }, wrapper: wrapper() });
    await waitFor(() => expect(count(manifest.deferred.url)).toBe(1));
    const idle = result.current.activeClip;
    rerender({ name: 'Idle' });
    await act(async () => release?.(new Response(new Uint8Array(bodies.get(manifest.deferred.url)!))));
    await waitFor(() => expect(result.current.deferredStatus).toBe('ready'));
    expect(result.current.activeClip).toBe(idle);
  });
  it('retains Idle after bounded retries and recovers only on explicit retry', async () => {
    holdDeferred = async () => new Response(null, { status: 503 });
    const { result } = renderHook(() => useAvatarAnimations('Walk'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.deferredStatus).toBe('error'));
    const idle = result.current.activeClip;
    expect(count(manifest.deferred.url)).toBe(2);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(idle?.name).toBe('Idle');
    holdDeferred = undefined;
    await act(async () => { await result.current.retry(); });
    await waitFor(() => expect(result.current.activeClip?.name).toBe('Walk'));
    expect(count(manifest.deferred.url)).toBe(3);
  });
  it('cancels both follow-up frames on unmount without starting a deferred request', async () => {
    const { result, unmount } = renderHook(() => useAvatarAnimations(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.activeClip?.name).toBe('Idle'));
    act(() => result.current.notifyInitialFrame()); await advanceFrame();
    unmount(); expect(frames.size).toBe(0);
    await advanceFrame(); expect(count(manifest.deferred.url)).toBe(0);
  });
  it('reports an unknown clip explicitly instead of fetching or silently changing the saved choice', async () => {
    const { result } = renderHook(() => useAvatarAnimations('NotAClip'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.error?.message).toMatch(/Unknown animation/));
    expect(result.current.activeClip?.name).toBe('Idle'); expect(count(manifest.deferred.url)).toBe(0);
  });
  it('bounds decoded stream bytes and cancels oversized responses', async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(8)); }, cancel }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    await expect(readAnimationResponse('/animations/manifest.json', 4)).rejects.toThrow(/byte limit/);
    expect(cancel).toHaveBeenCalledOnce();
  });
});

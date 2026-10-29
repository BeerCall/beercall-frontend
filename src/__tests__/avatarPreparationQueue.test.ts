import { describe, expect, it, vi } from 'vitest';
import { AvatarPreparationQueue } from '../lib/avatarPreparationQueue';

describe('session avatar preparation queue', () => {
    it('does no IO on construction, deduplicates URLs and keeps a stable snapshot until a change', () => {
        const queue = new AvatarPreparationQueue();
        const listener = vi.fn();
        queue.subscribe(listener);
        expect(queue.getSnapshot()).toEqual([]);
        expect(listener).not.toHaveBeenCalled();
        queue.request('/models/head.fbx', 'contact');
        const snapshot = queue.getSnapshot();
        queue.request('/models/head.fbx', 'background');
        expect(queue.getSnapshot()).toBe(snapshot);
        expect(snapshot).toMatchObject([{ url: '/models/head.fbx', status: 'reading' }]);
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('allows exactly two unresolved readers and requires real ticket settlement to advance', () => {
        const queue = new AvatarPreparationQueue();
        ['a', 'b', 'c', 'd'].forEach(url => queue.request(url));
        expect(queue.getSnapshot().map(entry => entry.status)).toEqual(['reading', 'reading', 'queued', 'queued']);
        expect(queue.ready('a', 999)).toBe(false);
        expect(queue.ready('c', 3)).toBe(false);
        const first = queue.getSnapshot()[0];
        expect(queue.ready(first.url, first.ticket)).toBe(true);
        expect(queue.getSnapshot().map(entry => entry.status)).toEqual(['ready', 'reading', 'reading', 'queued']);
        expect(queue.ready(first.url, first.ticket)).toBe(false);
    });

    it('promotes waiting visible/player resources without cancelling an already shared reader', () => {
        const queue = new AvatarPreparationQueue();
        ['a', 'b', 'c', 'd', 'e'].forEach(url => queue.request(url));
        queue.request('d', 'visible');
        queue.request('e', 'player');
        const [a, b] = queue.getSnapshot();
        queue.ready(a.url, a.ticket);
        expect(queue.getSnapshot().find(entry => entry.url === 'e')?.status).toBe('reading');
        expect(queue.getSnapshot().find(entry => entry.url === 'b')).toBe(b);
        queue.ready(b.url, b.ticket);
        expect(queue.getSnapshot().find(entry => entry.url === 'd')?.status).toBe('reading');
        expect(queue.getSnapshot().find(entry => entry.url === 'c')?.status).toBe('queued');
    });

    it('an error frees a reader without auto-retry, and an explicit retry rejects its old ticket', () => {
        const queue = new AvatarPreparationQueue();
        ['a', 'b', 'c'].forEach(url => queue.request(url));
        const first = queue.getSnapshot()[0];
        expect(queue.fail('a', first.ticket)).toBe(true);
        expect(queue.getSnapshot().find(entry => entry.url === 'c')?.status).toBe('reading');
        queue.request('a', 'player');
        expect(queue.getSnapshot()[0].status).toBe('error');
        expect(queue.retry('a')).toBe(true);
        expect(queue.retry('a')).toBe(false);
        expect(queue.ready('a', first.ticket)).toBe(false);
        const b = queue.getSnapshot()[1];
        queue.ready('b', b.ticket);
        const retried = queue.getSnapshot()[0];
        expect(retried.status).toBe('reading');
        expect(retried.error).toBeUndefined();
        expect(queue.ready('a', retried.ticket)).toBe(true);
    });

    it('cancels all session state/listeners and ignores late work without affecting a new account', () => {
        const old = new AvatarPreparationQueue();
        const next = new AvatarPreparationQueue();
        const listener = vi.fn();
        const unsubscribe = old.subscribe(listener);
        old.request('a');
        const entry = old.getSnapshot()[0];
        old.cancelSession();
        expect(old.getSnapshot()).toEqual([]);
        expect(listener).toHaveBeenCalledTimes(2);
        expect(old.ready('a', entry.ticket)).toBe(false);
        expect(old.fail('a', entry.ticket)).toBe(false);
        old.request('b');
        old.cancelSession();
        unsubscribe();
        old.subscribe(listener);
        expect(listener).toHaveBeenCalledTimes(2);
        next.request('a');
        expect(next.getSnapshot()).toHaveLength(1);
        expect(old.getSnapshot()).toEqual([]);
    });
});

import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sha256Hex } from '../lib/loadFbxModel';

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('sha256Hex', () => {
    it('hashes the source bytes as a lowercase SHA-256 digest', async () => {
        vi.stubGlobal('crypto', webcrypto);
        await expect(sha256Hex(new TextEncoder().encode('abc').buffer)).resolves.toBe(
            'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        );
    });

    it('returns null without subtle crypto on insecure origins', async () => {
        vi.stubGlobal('crypto', {});
        await expect(sha256Hex(new ArrayBuffer(0))).resolves.toBeNull();
    });

    it('keeps hashing optional when the digest fails', async () => {
        vi.stubGlobal('crypto', { subtle: { digest: vi.fn().mockRejectedValue(new Error('unavailable')) } });
        await expect(sha256Hex(new ArrayBuffer(0))).resolves.toBeNull();
    });
});

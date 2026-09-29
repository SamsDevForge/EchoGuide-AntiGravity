import { afterEach, describe, expect, it, vi } from 'vitest';
import { VideoProvider } from './vision';

afterEach(() => vi.unstubAllGlobals());

describe('camera permission cancellation', () => {
  it('stops a late camera stream without playing after Stop during the permission prompt', async () => {
    let grantPermission!: (stream: MediaStream) => void;
    const permission = new Promise<MediaStream>(resolve => { grantPermission = resolve; });
    const stopTrack = vi.fn();
    const stream = { active: true, getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
    const getUserMedia = vi.fn(() => permission);
    vi.stubGlobal('window', { isSecureContext: true });
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    const play = vi.fn(async () => undefined);
    const video = { srcObject: null, play, readyState: 2, videoWidth: 960, videoHeight: 720 } as unknown as HTMLVideoElement;
    const provider = new VideoProvider();
    const starting = provider.start(video);
    // Attach the rejection assertion before resolving the permission promise.
    const cancelled = expect(starting).rejects.toMatchObject({ name: 'AbortError' });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    provider.stop();
    grantPermission(stream);
    await cancelled;
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(play).not.toHaveBeenCalled();
    expect(video.srcObject).toBeNull();
    expect(provider.frame()).toBeNull();
  });
});

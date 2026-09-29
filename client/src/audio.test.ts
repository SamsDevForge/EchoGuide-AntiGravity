import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioGuide } from './audio';
import type { Observation, Preferences } from './contracts';

const prefs: Preferences = { volume: 0.5, announcementIntervalMs: 2000, spatialMode: 'stereo' };
const item = (patch: Partial<Observation> = {}): Observation => ({
  timestamp: performance.now(), trackId: 'chair-1', label: 'chair', score: 0.9,
  box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }, direction: 'left',
  horizontalPosition: 0.25, distanceMetres: null, depthSource: 'none', depthState: 'unavailable', ...patch,
});

class MockNode {
  connect = vi.fn((next: unknown) => next);
  disconnect = vi.fn();
}
class MockOscillator extends MockNode {
  frequency = { value: 0 };
  onended: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
}
class MockUtterance {
  volume = 1;
  rate = 1;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}
let oscillators: MockOscillator[];
let spoken: MockUtterance[];
let cancelSpeech: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now() - 1_000_000);
  vi.setSystemTime(1_000_000);
  oscillators = [];
  spoken = [];
  cancelSpeech = vi.fn();
  vi.stubGlobal('window', { speechSynthesis: { speak: vi.fn((utterance: MockUtterance) => spoken.push(utterance)), cancel: cancelSpeech } });
  vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance);
  vi.stubGlobal('AudioContext', class {
    state = 'running';
    currentTime = 0;
    destination = new MockNode();
    resume = vi.fn(async () => undefined);
    createOscillator() { const osc = new MockOscillator(); oscillators.push(osc); return osc; }
    createGain() { return Object.assign(new MockNode(), { gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() } }); }
    createStereoPanner() { return Object.assign(new MockNode(), { pan: { value: 0 } }); }
  });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('audio cancellation across scene changes', () => {
  it('pause stops a pending tone and prevents its delayed spoken label; resume permits the same observation', async () => {
    const guide = new AudioGuide();
    const onText = vi.fn();
    await guide.unlock();
    guide.update([item()], prefs, onText);
    const firstOscillator = oscillators[0];
    vi.advanceTimersByTime(100);
    guide.cancel();
    expect(firstOscillator.stop).toHaveBeenCalledWith();
    expect(cancelSpeech).toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(spoken).toHaveLength(0);
    guide.update([item()], prefs, onText);
    vi.advanceTimersByTime(260);
    // Area 0.12 = large? No, area is width * height = 0.3 * 0.4 = 0.12. Wait!
    // My sizeHint: > 0.12 ? 'large' : > 0.03 ? 'medium' : 'small'.
    // 0.12 is NOT > 0.12, so it's 'medium'.
    expect(spoken.map(utterance => utterance.text)).toEqual(['chair on the left.']);
    expect(onText).toHaveBeenCalledTimes(2);
  });

  it('continuously announces the same object at the specified pace interval', async () => {
    const guide = new AudioGuide();
    await guide.unlock();
    guide.update([item()], prefs, vi.fn());
    vi.advanceTimersByTime(260);
    expect(spoken).toHaveLength(1);
    
    // Attempting to update immediately does nothing due to pace limit
    guide.update([item()], prefs, vi.fn());
    expect(spoken).toHaveLength(1);

    // After pace interval passes, it announces again
    vi.advanceTimersByTime(2000);
    guide.update([item()], prefs, vi.fn());
    vi.advanceTimersByTime(260);
    expect(spoken).toHaveLength(2);
  });

  it('cancels active speech when its object disappears or becomes stale', async () => {
    const guide = new AudioGuide();
    await guide.unlock();
    guide.update([item()], prefs, vi.fn());
    vi.advanceTimersByTime(260);
    expect(spoken).toHaveLength(1);
    const previousCancels = cancelSpeech.mock.calls.length;
    guide.update([], prefs, vi.fn());
    expect(cancelSpeech).toHaveBeenCalledTimes(previousCancels + 1);
  });

  it('ignores completion events from cancelled speech while a new utterance is active', async () => {
    const guide = new AudioGuide();
    const onText = vi.fn();
    await guide.unlock();
    guide.update([item()], prefs, onText);
    vi.advanceTimersByTime(260);
    const oldEnd = spoken[0].onend!;
    guide.cancel();
    guide.update([item({ trackId: 'person-2', label: 'person', box: {x:0, y:0, width:1, height:1} })], prefs, onText);
    vi.advanceTimersByTime(260);
    oldEnd();
    vi.advanceTimersByTime(2100);
    guide.update([item({ trackId: 'person-2', label: 'person', box: {x:0, y:0, width:1, height:1} }), item({ trackId: 'backpack-3', label: 'backpack' })], prefs, onText);
    vi.advanceTimersByTime(260);
    expect(spoken.map(utterance => utterance.text)).toEqual(['chair on the left.', 'person is close on the left.', 'person is close on the left.']);
  });
});

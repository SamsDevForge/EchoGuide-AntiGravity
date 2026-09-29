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
    expect(spoken.map(utterance => utterance.text)).toEqual(['chair, left.']);
    expect(onText).toHaveBeenCalledTimes(2);
  });

  it('cancels an outdated pending label when the tracked object changes direction', async () => {
    const guide = new AudioGuide();
    await guide.unlock();
    guide.update([item()], prefs, vi.fn());
    vi.advanceTimersByTime(100);
    guide.update([item({ direction: 'right' })], prefs, vi.fn());
    vi.advanceTimersByTime(300);
    expect(spoken).toHaveLength(0);
    // Scene changes preserve the pace limit; the correct label arrives after it.
    vi.advanceTimersByTime(1600);
    guide.update([item({ direction: 'right' })], prefs, vi.fn());
    vi.advanceTimersByTime(260);
    expect(spoken.map(utterance => utterance.text)).toEqual(['chair, right.']);
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
    guide.cancel();
    const observation = item();
    guide.update([observation], prefs, vi.fn());
    vi.advanceTimersByTime(1600);
    const staleCancels = cancelSpeech.mock.calls.length;
    guide.update([observation], prefs, vi.fn());
    expect(cancelSpeech).toHaveBeenCalledTimes(staleCancels + 1);
    vi.advanceTimersByTime(3000);
    expect(spoken).toHaveLength(2);
  });

  it('still announces the original direction after left-right-left changes cancel its pending label', async () => {
    const guide = new AudioGuide();
    await guide.unlock();
    guide.update([item()], prefs, vi.fn());
    vi.advanceTimersByTime(100);
    guide.update([item({ direction: 'right' })], prefs, vi.fn());
    vi.advanceTimersByTime(100);
    guide.update([item({ direction: 'left' })], prefs, vi.fn());
    vi.advanceTimersByTime(1800);
    expect(spoken).toHaveLength(0);
    guide.update([item({ direction: 'left' })], prefs, vi.fn());
    vi.advanceTimersByTime(260);
    expect(spoken.map(utterance => utterance.text)).toEqual(['chair, left.']);
  });

  it('ignores completion events from cancelled speech while a new utterance is active', async () => {
    const guide = new AudioGuide();
    const onText = vi.fn();
    await guide.unlock();
    guide.update([item()], prefs, onText);
    vi.advanceTimersByTime(260);
    const oldEnd = spoken[0].onend!;
    guide.cancel();
    guide.update([item({ trackId: 'person-2', label: 'person' })], prefs, onText);
    vi.advanceTimersByTime(260);
    oldEnd();
    vi.advanceTimersByTime(2100);
    guide.update([item({ trackId: 'person-2', label: 'person' }), item({ trackId: 'backpack-3', label: 'backpack' })], prefs, onText);
    vi.advanceTimersByTime(260);
    expect(spoken.map(utterance => utterance.text)).toEqual(['chair, left.', 'person, left.']);
    expect(onText).toHaveBeenCalledTimes(2);
  });
});

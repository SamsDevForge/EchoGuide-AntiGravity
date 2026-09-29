import { describe,it,expect } from 'vitest';
import { directionFor,depthMedian,axialToRange,Tracker,TRACK_TTL } from './vision';
import { AnnouncementGate,phraseFor } from './audio';
import type { Observation } from './contracts';
const item=(patch:Partial<Observation>={}):Observation=>({timestamp:1000,trackId:'a',label:'chair',score:.8,box:{x:.1,y:.2,width:.3,height:.4},direction:'left',horizontalPosition:.25,distanceMetres:null,depthSource:'none',depthState:'unavailable',...patch});
describe('camera coordinates and depth validity',()=>{
  it('keeps camera-left negative and centres the middle zone',()=>{expect(directionFor(.1)).toBe('left');expect(directionFor(.5)).toBe('centre');expect(directionFor(.9)).toBe('right');});
  it('rejects invalid, sparse, and mixed-surface depth',()=>{expect(depthMedian([0,NaN,Infinity,-1,2])).toBeNull();expect(depthMedian([1,1,1,1,4,4,4,4,4])).toBeNull();expect(depthMedian([0,0,0,0,1,1,1,1,1])).toBeNull();});
  it('accepts a consistent majority, keeping axial depth separate from range',()=>{expect(depthMedian([2,2.01,2.02,2.03,2,0,2,2,2])).toBeCloseTo(2);expect(axialToRange(2,0,0)).toBe(2);expect(axialToRange(2,1,0)).toBeCloseTo(Math.sqrt(8));});
});
describe('tracking and speech freshness',()=>{
  it('associates overlapping objects without assigning duplicate IDs',()=>{const t=new Tracker();const first=t.update([item()],1000);const next=t.update([item({timestamp:1100}),item({timestamp:1100,box:{x:.8,y:.2,width:.1,height:.2}})],1100);expect(next[0].trackId).toBe(first[0].trackId);expect(next[1].trackId).not.toBe(first[0].trackId);});
  it('expires stale tracks and immediately drops absent objects',()=>{const t=new Tracker();const a=t.update([item()],1000)[0];expect(t.update([],1100)).toEqual([]);expect(t.update([item({timestamp:3000})],3000)[0].trackId).not.toBe(a.trackId);});
  it('suppresses unchanged announcements but permits direction changes',()=>{const g=new AnnouncementGate();expect(g.choose([item()],1000,2000)).not.toBeNull();expect(g.choose([item({timestamp:4000})],4000,2000)).toBeNull();expect(g.choose([item({timestamp:5000,direction:'right'})],5000,2000)?.direction).toBe('right');});
  it('rejects stale observations and resets after pause',()=>{const g=new AnnouncementGate();expect(g.choose([item()],1001+TRACK_TTL,2000)).toBeNull();g.choose([item()],1000,2000);g.reset();expect(g.choose([item()],1100,2000)).not.toBeNull();});
  it('speaks rounded distances only when explicitly valid',()=>{expect(phraseFor(item())).not.toContain('metres');expect(phraseFor(item({distanceMetres:2.24,depthState:'invalid'}))).not.toContain('metres');expect(phraseFor(item({distanceMetres:2.24,depthState:'valid'}))).toContain('2.0 metres');});
});

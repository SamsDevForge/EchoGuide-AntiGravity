import type { Observation, Preferences, Direction } from './contracts';
import { TRACK_TTL, sizeHint } from './vision';
export function phraseFor(o:Observation) {
  const size = sizeHint(o.box);
  let phrase = '';
  
  if (o.label === 'object') {
    // For generic objects (the other 67 COCO classes)
    const prefix = size === 'large' ? 'big ' : size === 'small' ? 'small ' : 'medium ';
    phrase = `${prefix}object on the ${o.direction}`;
  } else {
    // For specific known objects
    const closeText = size === 'large' ? ' is close' : size === 'small' ? ' is far' : '';
    const dirText = o.direction === 'centre' ? 'in the centre' : `on the ${o.direction}`;
    phrase = `${o.label}${closeText} ${dirText}`;
  }
  
  if (o.depthState === 'valid' && o.distanceMetres !== null) {
    phrase += `, about ${(Math.round(o.distanceMetres*2)/2).toFixed(1)} metres`;
  }
  
  return phrase + '.';
}
export function signature(o:Observation) {return `${o.trackId}:${o.direction}:${o.depthState}:${o.distanceMetres===null?'none':Math.round(o.distanceMetres*2)}`;}
export class AnnouncementGate {
  private lastAt=-Infinity;
  choose(items:Observation[],now:number,interval:number) {
    const fresh=items.filter(o=>now-o.timestamp<=TRACK_TTL);
    if(now-this.lastAt<interval || fresh.length===0) return null;
    // Continuously pick the object closest to the centre of the camera
    const item=fresh.sort((a,b)=>Math.abs(a.horizontalPosition - 0.5) - Math.abs(b.horizontalPosition - 0.5))[0];
    this.lastAt=now;
    return item;
  }
  reset(){this.lastAt=-Infinity;}
  forget(trackId:string){}
}
export class AudioGuide {
  private context:AudioContext|null=null; private oscillator:OscillatorNode|null=null; private timer:ReturnType<typeof setTimeout>|null=null;
  private generation=0; private busy=false; private activeTrack:string|null=null; private activeSignature:string|null=null;
  gate=new AnnouncementGate();
  async unlock(){this.context??=new AudioContext();await this.context.resume();}
  tone(direction:Direction,prefs:Preferences) {
    if(!this.context||this.context.state!=='running')return;
    this.oscillator?.stop();
    const ctx=this.context;const osc=ctx.createOscillator();const gain=ctx.createGain();const x=direction==='left'?-1:direction==='right'?1:0;
    if(prefs.spatialMode==='hrtf'){const pan=ctx.createPanner();pan.panningModel='HRTF';pan.positionX.value=x;pan.positionZ.value=-1;osc.connect(gain).connect(pan).connect(ctx.destination);}
    else {const pan=ctx.createStereoPanner();pan.pan.value=x;osc.connect(gain).connect(pan).connect(ctx.destination);}
    osc.frequency.value=direction==='centre'?660:520;gain.gain.setValueAtTime(0,ctx.currentTime);gain.gain.linearRampToValueAtTime(prefs.volume*.22,ctx.currentTime+.02);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.2);osc.start();osc.stop(ctx.currentTime+.22);this.oscillator=osc;osc.onended=()=>{osc.disconnect();gain.disconnect();if(this.oscillator===osc)this.oscillator=null;};
  }
  say(item:Observation,prefs:Preferences,onText:(text:string)=>void) {
    this.cancel(false);this.busy=true;this.activeTrack=item.trackId;this.activeSignature=signature(item);const generation=this.generation;this.tone(item.direction,prefs);const phrase=phraseFor(item);onText(phrase);
    this.timer=setTimeout(()=>{if(generation!==this.generation)return;if(!('speechSynthesis' in window)){this.busy=false;return;}const utterance=new SpeechSynthesisUtterance(phrase);utterance.volume=prefs.volume;utterance.rate=1;utterance.onend=utterance.onerror=()=>{if(generation===this.generation)this.busy=false;};window.speechSynthesis.speak(utterance);},260);
  }
  update(items:Observation[],prefs:Preferences,onText:(text:string)=>void) {
    // Only cancel speech when the tracked object disappears entirely ?" not on direction/signature changes.
    // This prevents speech from being cut off mid-word every detection frame.
    if(this.activeTrack&&!items.some(o=>o.trackId===this.activeTrack&&performance.now()-o.timestamp<=TRACK_TTL)) this.cancel(false);
    if(this.busy)return;const item=this.gate.choose(items,performance.now(),prefs.announcementIntervalMs);if(item)this.say(item,prefs,onText);
  }
  cancel(reset=true){if(this.busy&&this.activeTrack)this.gate.forget(this.activeTrack);this.generation++;if(this.timer)clearTimeout(this.timer);this.timer=null;this.oscillator?.stop();this.oscillator=null;window.speechSynthesis?.cancel();this.busy=false;this.activeTrack=null;this.activeSignature=null;if(reset)this.gate.reset();}
}

import type { Box, CameraProvider, Direction, Observation } from './contracts';
import { FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision';
export const TRACK_TTL = 1500;
export const directionFor = (x:number):Direction => x < 0.38 ? 'left' : x > 0.62 ? 'right' : 'centre';
export const depthMedian = (samples:number[]):number|null => {
  const valid = samples.filter(v=>Number.isFinite(v)&&v>0.15&&v<8).sort((a,b)=>a-b);
  if(valid.length<5 || valid.length < samples.length*0.6) return null;
  const med = valid[Math.floor(valid.length/2)];
  const deviations=valid.map(v=>Math.abs(v-med)).sort((a,b)=>a-b);
  return deviations[Math.floor(deviations.length/2)] > Math.max(0.12,med*0.12) || valid[Math.floor(valid.length*0.8)]-valid[Math.floor(valid.length*0.2)] > Math.max(.3,med*.3) ? null : med;
};
export const axialToRange = (z:number,x:number,y:number):number => z*Math.sqrt(1+x*x+y*y);
export function iou(a:Box,b:Box) { const w=Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x));const h=Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));return w*h/(a.width*a.height+b.width*b.height-w*h || 1); }
export class Tracker {
  private tracks:Observation[]=[]; private serial=0;
  update(items:Omit<Observation,'trackId'>[],now:number) {
    const candidates=this.tracks.filter(t=>now-t.timestamp<=TRACK_TTL);const used=new Set<string>();
    this.tracks=items.map(item=>{const match=candidates.filter(t=>!used.has(t.trackId)&&t.label===item.label&&iou(t.box,item.box)>.2).sort((a,b)=>iou(b.box,item.box)-iou(a.box,item.box))[0];const trackId=match?.trackId??`object-${++this.serial}`;used.add(trackId);return {...item,trackId};});
    return this.tracks;
  }
  clear(){this.tracks=[];}
}
export class VideoProvider implements CameraProvider {
  private stream:MediaStream|null=null; private video:HTMLVideoElement|null=null; private generation=0;
  async start(video:HTMLVideoElement) {
    this.stop();const token=this.generation;
    if(!window.isSecureContext) throw new Error('Camera access needs HTTPS or localhost.');
    if(!navigator.mediaDevices?.getUserMedia) throw new Error('This browser does not support camera access. Try Chrome on your phone.');
    this.video=video;
    const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:960},height:{ideal:720}},audio:false});
    if(token!==this.generation){stream.getTracks().forEach(t=>t.stop());throw new DOMException('Camera start cancelled.','AbortError');}
    this.stream=stream; video.srcObject=stream;
    try {await video.play();} catch(error){if(token===this.generation)this.stop();throw error;}
    if(token!==this.generation){stream.getTracks().forEach(t=>t.stop());throw new DOMException('Camera start cancelled.','AbortError');}
  }
  frame(){const v=this.video;return v&&v.readyState>=2&&this.stream?.active?{image:v,timestamp:performance.now(),width:v.videoWidth,height:v.videoHeight,depthSource:'none' as const}:null;}
  stop(){this.generation++;this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;if(this.video)this.video.srcObject=null;this.video=null;}
}
let detectorPromise:Promise<ObjectDetector>|null=null;
export function getDetector() {
  if(!detectorPromise) detectorPromise=FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}vision`).then(files=>ObjectDetector.createFromOptions(files,{baseOptions:{modelAssetPath:`${import.meta.env.BASE_URL}models/efficientdet-lite0.tflite`,delegate:'CPU'},runningMode:'VIDEO',scoreThreshold:.5,maxResults:8,categoryAllowlist:['person','chair','backpack']})).catch(e=>{detectorPromise=null;throw e;});
  return detectorPromise;
}
export function detect(detector:ObjectDetector,frame:NonNullable<ReturnType<VideoProvider['frame']>>,tracker:Tracker) {
  const started=performance.now();
  const result=detector.detectForVideo(frame.image,frame.timestamp);
  const items=result.detections.flatMap(d=>{
    const b=d.boundingBox;const c=d.categories[0];if(!b||!c) return [];
    const box={x:b.originX/frame.width,y:b.originY/frame.height,width:b.width/frame.width,height:b.height/frame.height};
    const horizontalPosition=Math.min(1,Math.max(0,box.x+box.width/2));
    return [{timestamp:frame.timestamp,label:c.categoryName,score:c.score,box,horizontalPosition,direction:directionFor(horizontalPosition),distanceMetres:null,depthSource:'none' as const,depthState:'unavailable' as const}];
  });
  return {observations:tracker.update(items,frame.timestamp),inferenceMs:performance.now()-started};
}

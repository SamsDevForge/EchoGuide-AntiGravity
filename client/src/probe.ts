import { depthMedian } from './vision';
export interface ProbeReport {secure:boolean; camera:string; xr:string; depth:string; pixels:string; simultaneousFrames:number; validDepthFrames:number; centreDepthMetres:number|null; dimensions:string; note:string; userAgent:string; checkedAt:string}
export const newReport=():ProbeReport=>({secure:window.isSecureContext,camera:'Not tested',xr:'Not tested',depth:'Not tested',pixels:'Not tested',simultaneousFrames:0,validDepthFrames:0,centreDepthMetres:null,dimensions:'—',note:'Run camera and XR tests separately. Earbud output needs your listening check.',userAgent:navigator.userAgent,checkedAt:new Date().toISOString()});
interface CameraView extends XRView {camera?:{width:number;height:number}}
interface RawBinding {getCameraImage(camera:NonNullable<CameraView['camera']>):WebGLTexture|null}
export class XRProbe {
  private session:XRSession|null=null;
  async start(report:ProbeReport,update:(r:ProbeReport)=>void,overlay:HTMLElement) {
    if(!navigator.xr)throw new Error('WebXR is unavailable in this browser. Live camera detection can still work.');
    if(!await navigator.xr.isSessionSupported('immersive-ar'))throw new Error('Immersive AR is unavailable on this browser/device.');
    report={...report,xr:'Supported; requesting session',depth:'Waiting for readings',pixels:'Waiting for readable pixels',simultaneousFrames:0,validDepthFrames:0};update({...report});
    // Request BOTH features in one session. A separate camera stream is never paired with this depth.
    const session=await navigator.xr.requestSession('immersive-ar',{requiredFeatures:['depth-sensing','camera-access'],optionalFeatures:['dom-overlay'],domOverlay:{root:overlay},depthSensing:{usagePreference:['cpu-optimized'],dataFormatPreference:['luminance-alpha','float32']}} as XRSessionInit);
    this.session=session;
    const canvas=document.createElement('canvas');const gl=canvas.getContext('webgl2',{xrCompatible:true});
    if(!gl){await session.end();throw new Error('WebGL2 unavailable.');}
    try {
      await gl.makeXRCompatible(); session.updateRenderState({baseLayer:new XRWebGLLayer(session,gl)});
      const Binding=(window as unknown as {XRWebGLBinding:new(s:XRSession,g:WebGL2RenderingContext)=>RawBinding}).XRWebGLBinding;
      if(!Binding)throw new Error('Raw camera binding unavailable.');
      const binding=new Binding(session,gl);const space=await session.requestReferenceSpace('local');
      const shader=(type:number,source:string)=>{const s=gl.createShader(type)!;gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)??'Shader failed');return s;};
      const program=gl.createProgram()!;
      gl.attachShader(program,shader(gl.VERTEX_SHADER,'#version 300 es\nin vec2 p;out vec2 uv;void main(){uv=(p+1.)*.5;gl_Position=vec4(p,0.,1.);}'));
      gl.attachShader(program,shader(gl.FRAGMENT_SHADER,'#version 300 es\nprecision mediump float;uniform sampler2D camera;in vec2 uv;out vec4 color;void main(){color=texture(camera,uv);}'));
      gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Camera shader link failed.');
      gl.useProgram(program);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);const loc=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
      const target=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,target);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,64,64,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      const fb=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,target,0);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Camera readback framebuffer failed.');
      const bytes=new Uint8Array(64*64*4);let last=0;let lastReport=0;let ended=false;
      report.xr='Session running';update({...report});
      const loop=(time:number,frame:XRFrame)=>{
        if(ended)return;session.requestAnimationFrame(loop);if(time-last<250)return;last=time;
        try{
          const pose=frame.getViewerPose(space);if(!pose){report.note='Tracking unavailable. Move the phone slowly toward a textured surface.';return;}
          const view=pose.views[0] as CameraView;let pixels=false;
          if(view.camera){const texture=binding.getCameraImage(view.camera);if(texture){gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.viewport(0,0,64,64);gl.useProgram(program);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(gl.getUniformLocation(program,'camera'),0);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);gl.readPixels(0,0,64,64,gl.RGBA,gl.UNSIGNED_BYTE,bytes);let min=255,max=0;for(let i=0;i<bytes.length;i+=4){min=Math.min(min,bytes[i]);max=Math.max(max,bytes[i]);}pixels=gl.getError()===gl.NO_ERROR&&max-min>3;report.pixels=pixels?'Readable image pixels (variation detected)':'Readback lacks useful variation; aim at a lit scene';report.dimensions=`${view.camera.width} × ${view.camera.height}`;}}
          else report.pixels='No raw camera returned';
          const depth=frame.getDepthInformation?.(view);
          if(depth){const samples:number[]=[];for(const x of [.4,.5,.6])for(const y of [.4,.5,.6])samples.push(depth.getDepthInMeters(x,y));const med=depthMedian(samples);report.centreDepthMetres=med;if(med!==null){report.validDepthFrames++;report.depth='Actual CPU depth received';if(pixels)report.simultaneousFrames++;}else report.depth='Depth buffer received; centre samples invalid or mixed';}
          else {report.depth='No depth buffer yet';report.centreDepthMetres=null;}
          report.note='Probe only: centre depth is optical-axis depth, not an object distance. Move slowly for 10–20 seconds. Verify image orientation and measured distances before enabling live depth.';
        }catch(e){report.note=e instanceof Error?e.message:String(e);}
        finally{gl.bindFramebuffer(gl.FRAMEBUFFER,session.renderState.baseLayer?.framebuffer??null);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);if(time-lastReport>500){update({...report});lastReport=time;}}
      };
      const timeout=setTimeout(()=>void session.end(),25000);
      session.addEventListener('end',()=>{ended=true;clearTimeout(timeout);this.session=null;gl.getExtension('WEBGL_lose_context')?.loseContext();report.xr='Session ended';report.checkedAt=new Date().toISOString();update({...report});},{once:true});session.requestAnimationFrame(loop);
    }catch(e){await session.end();this.session=null;throw e;}
  }
  stop(){void this.session?.end();}
}

import { mkdir, copyFile, readdir, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const wasm = path.join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const out = path.join(root, 'client/public/vision');
await mkdir(out, {recursive:true});
for (const file of await readdir(wasm)) await copyFile(path.join(wasm, file), path.join(out, file));
const models = path.join(root, 'client/public/models');
await mkdir(models, {recursive:true});
const modelPath = path.join(models,'efficientdet-lite0.tflite');
const existing = await stat(modelPath).catch(()=>null);
if (!existing || existing.size < 1000000) {
  const response = await fetch('https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite');
  if (!response.ok) throw new Error(`Model download failed: ${response.status}`);
  await writeFile(modelPath, Buffer.from(await response.arrayBuffer()));
}
console.log('MediaPipe WASM and EfficientDet-Lite0 ready in client/public.');

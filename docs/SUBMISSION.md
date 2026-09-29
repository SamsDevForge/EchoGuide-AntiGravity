# EchoGuide demonstration

EchoGuide is a guest-first browser prototype for awareness of selected visible objects. It detects people, chairs, and backpacks locally and plays a camera-relative directional tone followed by a spoken label. The intended demonstration is stationary and supervised indoors, using a phone with its rear camera facing forward and paired open-ear earbuds.

## Two-minute demo script

1. Open the app over HTTPS on the phone. Keep the phone and the listener facing the same direction. Start at a low listening volume.
2. Tap **Calibrate earbuds**. Play left, centre, and right. Ask the listener to identify each direction. Verify that phone mono audio is off.
3. Tap **Start sensing** and allow camera access. Place a chair, a person, or a backpack in the left, centre, and right parts of the camera image. Show the detection card and listen for a directional tone followed by the object label.
4. Leave an object still to demonstrate reduced repetition. Change its direction or introduce another selected object to demonstrate a new announcement. Show the pace and volume controls.
5. Remove the objects. Explain that no selected objects detected does not establish a clear path. Show **Distance unavailable**: standard camera mode does not provide aligned metric depth.
6. Tap **Pause** and confirm that capture and sound stop. Optionally open **Device check** to inspect camera and experimental XR/depth capability.

If camera permissions or model startup prevent live sensing, **Try the audio demo** provides explicitly labelled sample objects for cue demonstration. It is not evidence of live recognition. Optional **Describe scene** requires a backend Gemini key and sends one selected JPEG only after a tap; local detection needs no key or account.

## Submission contents and claims

- React/TypeScript client with local object detection, tracking, speech, stereo cues, local listening preferences, and device diagnostics.
- Express/TypeScript backend with health checks and optional Gemini scene descriptions. Optional PostgreSQL account endpoints exist but are outside the single-device demonstration.
- Reproducible project setup and asset preparation instructions in the root README; automated checks and a physical validation checklist in `TESTING.md`.

Physical phone recognition, audio routing, end-to-end latency, and usable XR depth remain unverified until the checklist is completed on the target phone. This prototype provides neither navigation instructions nor obstacle avoidance, head tracking, road-crossing guidance, or verified distances.

## Device results to attach

Record the phone model, Android and Chrome versions, earbud model, test date, and copied **Device check** JSON. Include physical recognition and audio observations plus a short supervised demonstration recording. Keep unsupported or untested results explicitly marked; do not substitute the audio demo for live sensing results.

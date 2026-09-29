# EchoGuide validation

## Automated checks

Run from the repository root after installing dependencies:

```sh
npm run typecheck
npm test
npm run build
```

The server suite validates guest health without credentials, clear missing-integration errors, JPEG/request-size validation, scene rate limiting, Gemini REST payload construction, upstream error privacy, and optional account hashing/authentication/preference isolation. Gemini replies and the account repository are test doubles: these tests do not establish cloud availability or actual PostgreSQL connectivity.

Server TypeScript checking, production compilation, and all **9 server API tests** passed on the development computer on 29 September 2026. The password-hashing integration test permits 30 seconds to accommodate slower hosts; the successful run completed the suite in about 7 seconds. Browser and physical device checks are separate from automated checks; record the final root-workspace check output alongside this checklist.

## Physical checklist

Use a stationary, supervised indoor setup on the target OnePlus Nord CE5 with paired open-ear earbuds. Run each relevant case on the actual phone, record the outcome, and retain copied device diagnostics. All physical results below are **pending**, not passed.

| Check | Procedure and evidence | Current result |
| --- | --- | --- |
| Secure context and camera | Open the HTTPS app in Chrome; allow rear camera; verify a forward-facing live preview and record its reported resolution/facing mode. | Pending |
| Permission rejection/recovery | Deny camera access, confirm an understandable error, restore permission, and retry Start sensing. | Pending |
| Local model startup | Prepare the model/assets, start sensing, and verify that actual recognition begins. Repeat with the backend offline to establish local detection independence. | Pending |
| Selected classes | Present a person, chair, and backpack separately, then together. Record misses/false detections and confidence across well-lit, dim, partially occluded, and cluttered scenes. | Pending |
| Direction and tracking | Move each object between image left, centre, and right while phone/head orientation stays aligned. Confirm directional labels and coherent tracking. Image direction is not a world bearing. | Pending |
| Earbud stereo routing | Turn mono audio off; play calibration left/centre/right at comfortable volume. Confirm perceived direction on the paired earbuds and repeat after reconnecting. | Pending |
| Tone/speech ordering | Confirm that a brief directional tone precedes a comprehensible spoken label. Check volume zero, moderate volume, and supported speech voice. | Pending |
| Announcement pacing | Select each pace. Check that stable observations do not repeatedly announce and changed observations wait for the configured minimum spacing. | Pending |
| Stale observations | Remove an object and interrupt the stream; verify old cards and queued speech clear. Check a change while speech is active. | Pending |
| Pause/background/recovery | Pause, switch apps, lock the phone, then return. Confirm camera/audio stop and a deliberate Start resumes cleanly. Repeat Start/Pause several times. | Pending |
| End-to-end latency | Record an object entering the frame and the resulting audio on a second device/video. Measure frame-entry-to-tone onset and frame-entry-to-spoken-label onset across at least 20 trials; report median and worst observed delay, selected pace, and device conditions. Diagnostics inference time is only model execution time. | Pending |
| Sustained operation | Run a supervised stationary session for 10 minutes. Record heat, battery change, freezes, speech overlap, and recovery behavior. | Pending |
| Experimental XR/depth | Run Device check's XR + depth test for its full duration. Copy JSON; inspect readable pixels, valid depth frames, and simultaneous frames. API availability alone is insufficient. | Pending |
| Depth alignment/accuracy | If XR yields data, compare known measured targets and camera/depth coordinates under near/far, edge, occlusion, and invalid-depth cases. Live distance stays unavailable until a valid aligned provider is integrated and validated. | Pending |
| Missing Gemini configuration | With no key, confirm optional scene control explains its unavailability and local sensing continues. | Pending |
| Optional Gemini | If configured, tap Describe scene and check a visible-content-only short response; test timeout/service errors and ensure no distances or navigability claims. A single JPEG is sent to the backend and Gemini. | Pending |

## Result record

```text
Date/time:
Phone / Android / Chrome:
Earbuds / mono audio setting:
App revision and HTTPS URL:
Selected audio mode / pace / volume:
Camera / XR / depth copied JSON:
Recognition observations and failures:
Latency trials, median, worst observed:
Pause/background/stale-data results:
Sustained-session results:
Optional Gemini result or Not configured:
Unresolved issues:
Tester:
```

Do not use an empty detection list, one working cue, or an XR feature flag as evidence of route safety, dependable audio routing, or valid depth measurements.

# EchoGuide project status

Started: 2026-09-29 11:56 IST. Workspace was empty.

## Decisions and ownership
- Lead: root manifests/lockfile, client, camera/depth contracts, probe, integration and delivery.
- GPT-6 Sol (medium), backend worker: server/** only. No nested delegation.
- Live mode uses local MediaPipe EfficientDet-Lite0; guest access works without accounts.
- Default camera provider has no metric distance. Experimental XR requires same-session readable camera pixels and actual CPU depth. No unverified alignment is presented as distance.
- Stereo tones precede ordinary browser speech. Directions are camera-relative.
- No competing native implementation; target phone must be tested before claiming XR depth support.

## Commands
- npm install
- npm run models
- npm run dev
- npm run typecheck && npm test && npm run build

## Blockers
- GitHub CLI saved token invalid; user asked to reauthenticate.
- No PostgreSQL, Gemini, Vercel/Netlify, or Render/Railway credentials configured.
- Physical phone and earbud tests await user.

## Next steps
Build probe and live provider, integrate backend, run automated and browser checks, prepare deployment and submission materials.

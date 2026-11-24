# Multi-Peer Collaborative Rooms, P2P Chat, Voice Notes & Optical Pairing Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Drooit from a 1-to-1 file pipe into a high-performance multi-peer collaborative room supporting up to 8 peers with instant optical QR pairing, peer reconnection controls, live P2P text chat, folder-context file sharing, and voice memos.

**Architecture:** Full-mesh WebRTC topology over existing Socket.IO signaling infrastructure. Each room maintains an active peer roster (`host` + `members`). Signaling routes targeted SDP/ICE signals between peer pairs (`targetPeerId`). P2P DataChannels handle binary chunk streaming for files and JSON control framing for real-time text and voice messaging (Opus audio blobs). The UI adopts Drooit's Industrial Titanium Grayscale design with Signal Yellow accents.

**Tech Stack:** TypeScript, React 18, Tailwind CSS, Lucide Icons, Socket.IO / WebRTC DataChannel, Web Audio / MediaRecorder API, QRCode / html5-qrcode, Vitest.

---

## Global Constraints

- **Theme Compliance**: Industrial Titanium Grayscale (`#0D0D0F` dark, `#F4F4F6` light) with **Signal Yellow (`#FFE600` / `#FACC15`)** abstract accent. Strict ban on blue and generic AI gradients.
- **Hardware Digital Tiles**: Pairing code must retain the segmented 6-digit hardware tiles.
- **Non-Breaking Protocol**: Maintain backward compatibility for existing 1-to-1 transfer tests while introducing multi-peer message schemas.
- **Test Integrity**: Every task ends with verifiable vitest tests proving its functionality.
- **Zero Account / Zero Server Storage**: Peer-to-peer data channel transmission for voice memos and chat; server only acts as ephemeral signaling router.

---

## Review Focus

1. **Multi-Peer WebRTC Signaling Collision**: Perfect offer/answer state machine ensuring no glare when multiple peers connect simultaneously.
2. **Audio Recorder Compatibility**: Safe fallback for browsers/mobile environments without `MediaRecorder` or microphone permissions.
3. **QR Code Optical Scanning Reliability**: Standard high-contrast rendering (dark `#0D0D0F` on `#FFFFFF`) with robust query/hash/code parsing in scanner.
4. **Graceful Reconnection**: Survives network drops and browser refreshes with peer tokens, keeping room state intact for remaining peers.
5. **Memory Management**: Revoke Object URLs for audio blobs and downloaded file buffers to prevent browser memory leaks during prolonged sessions.

---

## File Structure

```
shared/
  types.ts                    <- Multi-peer SessionSnapshot, PeerSnapshot, ChatMessage types
  protocol.ts                 <- Extended control messages (chat, voice, peer leave, targeted signaling)
server/src/
  sessions/
    sessionManager.ts         <- Multi-peer session records (host + peers map, max 8)
  signaling/
    signalingService.ts       <- Targeted signaling relay (targetPeerId) & peer lifecycle broadcasts
client/src/
  lib/
    signaling/
      client.ts               <- Multi-peer signaling events & targeted signal dispatch
    webrtc/
      meshManager.ts          <- WebRTC mesh coordinator (manages PeerConnection per peer)
    audio/
      recorder.ts             <- MediaRecorder wrapper for voice notes with waveform audio metrics
  store/
    transferStore.ts          <- Updated Zustand store managing peer roster, chat stream & transfers
  components/
    pairing/
      QrCodeDisplay.tsx       <- High-contrast optical QR display with direct join link
      QrScannerModal.tsx      <- Universal scanner parsing query params, hash tokens & codes
    room/
      RoomWorkspace.tsx       <- Unified room interface (Files, Folder tree, Peer roster)
      PeerRoster.tsx          <- Live list of connected devices with ping/disconnect actions
      ChatStream.tsx          <- Real-time text & voice conversation timeline
      VoiceRecorderButton.tsx <- Push-to-record voice note button with live recording HUD
      VoiceMessagePlayer.tsx  <- Inline waveform player for voice notes
```

---

## Task Decomposition

### Task 1: Protocol & Shared Type Extensions for Multi-Peer and Chat

**Files:**
- Modify: `shared/src/types.ts`
- Modify: `shared/src/protocol.ts`
- Test: `tests/shared/protocol.test.ts`

- [ ] **Step 1: Write failing tests in `tests/shared/protocol.test.ts`**
  - Verify encoding and decoding of `chat:message` control message.
  - Verify encoding and decoding of `chat:voice` control message with base64 audio payload.
  - Verify targeted signaling payload validation (`targetPeerId`).
  - Run `npx vitest run tests/shared/protocol.test.ts` and confirm failure.

- [ ] **Step 2: Extend `shared/src/types.ts`**
  - Add `PeerSnapshot`: `{ peerId: string; device: DeviceInfo; role: 'host' | 'member'; joinedAt: number }`.
  - Extend `SessionSnapshot` with `peers: PeerSnapshot[]`, `maxPeers: number`, and `host: PeerSnapshot`.
  - Define `ChatMessage`:
    ```ts
    export interface ChatMessage {
      id: string;
      senderPeerId: string;
      senderName: string;
      timestamp: number;
      kind: 'text' | 'voice' | 'file';
      text?: string;
      audioUrl?: string;
      audioDuration?: number;
      files?: SharedFileMeta[];
      folderRef?: string;
    }
    ```

- [ ] **Step 3: Extend `shared/src/protocol.ts`**
  - Add `chat:message` and `chat:voice` schemas to `controlMessageSchema`.
  - Add `peer:leave` schema to `controlMessageSchema`.
  - Export helper type guards and parsers.

- [ ] **Step 4: Verify tests pass**
  - Run `npx vitest run tests/shared/protocol.test.ts` and ensure all tests pass.
  - Commit: `git commit -m "feat(shared): add multi-peer and chat protocol schemas"`.

---

### Task 2: Server Multi-Peer Session Manager & Targeted Signaling

**Files:**
- Modify: `server/src/sessions/sessionManager.ts`
- Modify: `server/src/signaling/signalingService.ts`
- Test: `tests/server/sessionManager.test.ts`
- Test: `tests/server/signaling.test.ts`

- [ ] **Step 1: Write failing tests for multi-peer sessions**
  - Test multiple peers (3+) joining the same session using code and invite token.
  - Test peer disconnection and removal without destroying the session for remaining peers.
  - Test targeted signaling between specific peer IDs.
  - Run `npx vitest run tests/server/sessionManager.test.ts` to confirm failure.

- [ ] **Step 2: Update `server/src/sessions/sessionManager.ts`**
  - Change `receiver: PeerRecord | null` to `peers: Map<string, PeerRecord>` with maximum capacity of 8 peers.
  - Update `create()`: creator becomes `host` with a generated `peerId`.
  - Update `joinByCode()`: adds new peer into `session.peers`, returns unique `peerId` and `peerToken`. Keep invite token reusable until `maxPeers` reached or session expires.
  - Add `removePeer(sessionId, peerId, callerToken)`: allows a peer to leave or host to remove a peer.
  - Add `reconnectPeer()`: binds new socket ID to existing `peerId` using stored `peerToken`.

- [ ] **Step 3: Update `server/src/signaling/signalingService.ts`**
  - Add handler for `signal:send`: takes `{ targetPeerId, signal }` and forwards to target socket as `signal:receive { fromPeerId, signal }`.
  - Broadcast `peer:joined` with `{ peer, session }` to all other room sockets.
  - Broadcast `peer:left` with `{ peerId, reason }` when a socket disconnects or leaves.
  - Add `session:leave` event allowing a peer to explicitly exit.

- [ ] **Step 4: Verify tests pass**
  - Run `npx vitest run tests/server/sessionManager.test.ts tests/server/signaling.test.ts`.
  - Commit: `git commit -m "feat(server): support multi-peer sessions and targeted signaling relay"`.

---

### Task 3: Optical QR Code Generation & Accurate Scanner Fix

**Files:**
- Modify: `client/src/store/transferStore.ts`
- Modify: `client/src/components/pairing/QrCodeDisplay.tsx`
- Modify: `client/src/components/pairing/QrScannerModal.tsx`
- Modify: `client/src/pages/ReceivePage.tsx`
- Test: `tests/client/pairing.test.ts` (create)

- [ ] **Step 1: Write tests for QR URL generation and scanner parsing**
  - Verify QR URL parser correctly extracts 6-digit code and invite token from queries, hashes, and raw codes.
  - Confirm optical contrast defaults for `QRCode.toDataURL`.

- [ ] **Step 2: Fix QR Code rendering in `transferStore.ts` and `QrCodeDisplay.tsx`**
  - Change `color: { dark: '#0D0D0F', light: '#FFFFFF' }` with error correction level `'M'`.
  - Standardize `inviteUrl`: `${origin}/?join=${session.code}&token=${inviteToken}` (clean query params compatible with all scanners).
  - Add a "Test In New Tab / Open Direct Link" action to `QrCodeDisplay.tsx` for easy local testing.

- [ ] **Step 3: Fix QR Scanner in `QrScannerModal.tsx` and `ReceivePage.tsx`**
  - Update `handleScanResult(decodedText)`:
    - Parse using standard `URL` parser for `?join=` or `#join=` or `#invite=`.
    - Extract `join` parameter as code and `token` parameter as inviteToken.
    - Match 6-digit standalone code `/\b\d{6}\b/`.
    - Automatically trigger `joinByInvite(token)` or `joinByCode(code)` without manual steps.
  - Add torch/flashlight toggle if supported by mobile camera track.

- [ ] **Step 4: Verify tests and run lint/typecheck**
  - Run `npm run typecheck && npm test`.
  - Commit: `git commit -m "fix(pairing): fix QR optical contrast and universal scan parsing"`.

---

### Task 4: WebRTC Full-Mesh Manager & Disconnect/Reconnect Engine

**Files:**
- Create: `client/src/lib/webrtc/meshManager.ts`
- Modify: `client/src/lib/signaling/client.ts`
- Modify: `client/src/store/transferStore.ts`
- Test: `tests/client/mesh.test.ts` (create)

- [ ] **Step 1: Implement `MeshManager` in `client/src/lib/webrtc/meshManager.ts`**
  - Manage a pool of `RTCPeerConnection`s indexed by `peerId`.
  - For each peer, negotiate a `control` DataChannel (ordered, reliable) and a `chunk` DataChannel (binary).
  - Handle polite/impolite glare resolution using peer ID comparison (`isPolite = myPeerId < remotePeerId`).
  - Broadcast control messages (chat, pause, resume) to all peers or send to specific peer.
  - Forward incoming data frames to store listeners.

- [ ] **Step 2: Add Connection Management (Disconnect & Reconnect)**
  - Implement `disconnect()`: cleanly tears down RTCPeerConnections, emits `session:leave` to signaling, and updates UI to disconnected state.
  - Implement `reconnect()`: reuses stored `sessionId`, `sessionCode`, and `peerToken` to resume session without re-typing.
  - Provide UI hooks for host to disconnect a specific peer or terminate the room.

- [ ] **Step 3: Verify mesh connection tests**
  - Run `npm test`.
  - Commit: `git commit -m "feat(webrtc): implement full-mesh WebRTC coordinator with clean reconnect"`.

---

### Task 5: Audio Recording Hook & Waveform Voice Message Player

**Files:**
- Create: `client/src/lib/audio/recorder.ts`
- Create: `client/src/components/room/VoiceRecorderButton.tsx`
- Create: `client/src/components/room/VoiceMessagePlayer.tsx`
- Test: `tests/client/audio.test.ts` (create)

- [ ] **Step 1: Implement `AudioRecorder` in `client/src/lib/audio/recorder.ts`**
  - Wrap `navigator.mediaDevices.getUserMedia({ audio: true })`.
  - Record audio in `audio/webm;codecs=opus` (with fallback to `audio/ogg` or `audio/mp4`).
  - Compute live decibel levels via `AudioContext` and `AnalyserNode` for dynamic waveform visualization.
  - Return base64 string or binary buffer with duration in seconds.

- [ ] **Step 2: Build `VoiceRecorderButton.tsx`**
  - Signal Yellow pulsing HUD when recording is active.
  - Recording timer (`0:04 / 2:00 max`).
  - "Cancel" (trash icon) and "Send Voice Note" (send icon) actions.
  - Keyboard shortcut or press-and-hold option.

- [ ] **Step 3: Build `VoiceMessagePlayer.tsx`**
  - SVG audio waveform with played/unplayed progress bar in Signal Yellow (`#FACC15`).
  - Play/Pause toggle with duration countdown (`0:12`).
  - Speed multiplier toggle (`1x`, `1.5x`, `2x`).
  - Download voice memo button.

- [ ] **Step 4: Verify component compilation and tests**
  - Run `npm run typecheck`.
  - Commit: `git commit -m "feat(audio): add voice note recorder and waveform player component"`.

---

### Task 6: Unified Collaborative Room Workspace (Chat + Folders + Files)

**Files:**
- Create: `client/src/components/room/RoomWorkspace.tsx`
- Create: `client/src/components/room/ChatStream.tsx`
- Create: `client/src/components/room/PeerRoster.tsx`
- Create: `client/src/components/room/FolderExplorer.tsx`
- Modify: `client/src/pages/SendPage.tsx`
- Modify: `client/src/pages/ReceivePage.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Build `PeerRoster.tsx`**
  - Live list of connected devices in the room (e.g. "Atharva's MacBook (Host)", "Chrome on Windows", "iPhone 15").
  - Status indicator dot (green = WebRTC direct connected, yellow = signaling only).
  - Host action: "Remove" button with confirmation.
  - Self action: "Disconnect / Leave Room" and "Reconnect" buttons.

- [ ] **Step 2: Build `ChatStream.tsx` & `FolderExplorer.tsx`**
  - Message bubble stream displaying:
    - Text messages with sender device tag and timestamp.
    - Voice notes with integrated `VoiceMessagePlayer`.
    - File sharing cards with file type icon, name, size, sender, and quick download/accept buttons.
    - System announcements (e.g. "Pixel 8 joined the room").
  - Folder reference tagging: click a shared folder to reference it in chat (e.g. "Check the `/Assets` folder").
  - Input footer with:
    - Text input area (`Type a message or drop files...`).
    - Paperclip / File attach button.
    - `VoiceRecorderButton` for instant voice notes.

- [ ] **Step 3: Integrate `RoomWorkspace.tsx` into Send/Receive Pages**
  - Once paired (whether 2 peers or 8 peers), transition into the unified `RoomWorkspace`.
  - Top navigation bar displays Room Code with copy button, QR modal button, connected peer count pill, and Disconnect button.
  - Tabbed or split-pane view (Files on left, Chat on right on desktop; toggleable tabs on mobile).

- [ ] **Step 4: Run full verification suite & e2e smoke test**
  - Run `npm run typecheck && npm test && npm run build`.
  - Commit: `git commit -m "feat(ui): add unified room workspace with peer roster, chat, and files"`.

---

### Task 7: Final Verification & Git Push

- [ ] **Step 1: Run comprehensive tests**
  - Ensure all vitest unit and integration tests pass (100% passing).
  - Verify build produces clean bundles without TypeScript warnings.

- [ ] **Step 2: Push to GitHub repository**
  - Push to `https://github.com/CrazAr374/drooit` on `main`.
  - Confirm Render auto-deploy triggers and runs successfully.

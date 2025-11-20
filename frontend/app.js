/**
 * 100% SDK-Compliant Gemini Live Avatar Frontend
 * Communicates with SDK-compliant Python backend
 */

import { AudioRecorder } from './audio-recorder.js';
import { AudioPlayer } from './audio-player.js';

class GeminiLiveClient {
    constructor() {
        this.ws = null;
        this.audioRecorder = null;
        this.audioPlayer = null;
        this.isConnected = false;
        this.isRecording = false;

        // SDK-COMPLIANT: Audio specifications from official docs
        this.SAMPLE_RATE_INPUT = 16000;  // 16kHz input
        this.SAMPLE_RATE_OUTPUT = 24000; // 24kHz output

        // Avatar state
        this.currentAvatarState = 'idle';
        this.videoSources = null;
        this.videoCycleTimers = [];
        this.videoCycleAnimationFrame = null;
        this.isSpeaking = false;
        this.pendingTurnComplete = false;  // Track if turn_complete arrived while audio playing
        this.isInterrupted = false;  // Track if we're in interrupted/barge-in state
        this.interruptTimeout = null;  // Track timeout for clearing interrupted state
        this.lastInterruptTime = 0;  // Timestamp of last interrupt (for debouncing)

        // Speaking cycle configuration (loaded from config.json)
        this.speakingCycleConfig = {
            enabled: true,
            initialForwardDuration: 3.0,
            reverseDuration: 2.0,
            forwardDuration: 2.0
        };

        // DOM elements
        this.statusEl = document.getElementById('status');
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.textInput = document.getElementById('textInput');
        this.sendTextBtn = document.getElementById('sendTextBtn');
        this.logEl = document.getElementById('log');
        this.audioIndicator = document.getElementById('audioIndicator');

        // Pre-loaded video elements for instant state switching (no load delay)
        this.avatarVideos = {
            idle: document.getElementById('video-idle'),
            listening: document.getElementById('video-listening'),
            speaking: document.getElementById('video-speaking')
        };

        // Current active video reference
        this.avatarVideo = null;  // Will be set in initialization

        this.setupEventListeners();
    }

    setupEventListeners() {
        this.startBtn.addEventListener('click', () => this.start());
        this.stopBtn.addEventListener('click', () => this.stop());
        this.sendTextBtn.addEventListener('click', () => this.sendText());

        // Enter to send text
        this.textInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendText();
            }
        });
    }

    async start() {
        try {
            this.log('Starting connection...', 'info');
            this.setStatus('connecting', 'Connecting...');

            // Read config
            const config = await this.loadConfig();

            // Environment-aware WebSocket URL selection
            const wsUrl = this.getWebSocketUrl(config);
            console.log(`🌐 Environment: ${this.isLocalEnvironment() ? 'Local Development' : 'Cloud Production'}`);
            console.log(`🔌 WebSocket URL: ${wsUrl}`);

            // Connect WebSocket
            await this.connectWebSocket(wsUrl);

            // Start audio recording
            await this.startAudio();

            this.isConnected = true;
            this.startBtn.disabled = true;
            this.stopBtn.disabled = false;
            this.sendTextBtn.disabled = false;

            // Set avatar to listening state
            this.setAvatarState('listening');

            this.log('✅ Connected and ready!', 'success');

        } catch (error) {
            this.log(`❌ Error: ${error.message}`, 'error');
            this.setStatus('disconnected', 'Connection Failed');
            this.cleanup();
        }
    }

    /**
     * Detect if running in local development or cloud production.
     * @returns {boolean} true if local, false if cloud
     */
    isLocalEnvironment() {
        const hostname = window.location.hostname;
        return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '';
    }

    /**
     * Get environment-aware WebSocket URL from config.
     * @param {Object} config - Configuration object
     * @returns {string} WebSocket URL appropriate for current environment
     */
    getWebSocketUrl(config) {
        const isLocal = this.isLocalEnvironment();

        // Handle both old format (string) and new format (object with local/cloud)
        const wsConfig = config.backend?.wsUrl;

        if (typeof wsConfig === 'string') {
            // Old format: just a string URL (fallback for backward compatibility)
            return wsConfig;
        } else if (typeof wsConfig === 'object') {
            // New format: object with local and cloud URLs
            return isLocal ? wsConfig.local : wsConfig.cloud;
        }

        // Fallback default
        return isLocal ? 'ws://localhost:8080' : 'wss://YOUR-BACKEND.run.app';
    }

    /**
     * Get environment-aware video URL from config.
     * @param {string} videoKey - Video key (idle, listening, speaking)
     * @returns {string} Video URL appropriate for current environment
     */
    getVideoUrl(videoKey) {
        const isLocal = this.isLocalEnvironment();

        // Handle both old format (flat sources) and new format (local/cloud sources)
        if (this.videoSources.local && this.videoSources.cloud) {
            // New format: separate local and cloud sources
            return isLocal ? this.videoSources.local[videoKey] : this.videoSources.cloud[videoKey];
        } else {
            // Old format: flat sources (backward compatibility)
            return this.videoSources[videoKey];
        }
    }

    async loadConfig() {
        try {
            const response = await fetch('config.json');
            const config = await response.json();

            // Load video sources from config (supports both old and new formats)
            if (config.video && config.video.sources) {
                this.videoSources = config.video.sources;
                console.log('✅ Video sources loaded:', this.videoSources);
            }

            // Load speaking cycle configuration
            if (config.speakingCycle) {
                this.speakingCycleConfig = { ...this.speakingCycleConfig, ...config.speakingCycle };

                // Validate configuration
                const { initialForwardDuration, reverseDuration, forwardDuration } = this.speakingCycleConfig;
                const minRequired = Math.max(initialForwardDuration, reverseDuration + forwardDuration);

                console.log('✅ Speaking cycle config loaded:', this.speakingCycleConfig);
                console.log(`   Min video duration required: ${minRequired}s`);
                console.log(`   Oscillation range: ${initialForwardDuration - reverseDuration}s to ${initialForwardDuration}s`);
            }

            // Note: Videos are pre-loaded in the initialization code (lines 740-750)
            // No need for separate preloading here

            return config;
        } catch (error) {
            console.error('Config load error:', error);
            // Default config
            const defaultConfig = {
                backend: {
                    wsUrl: {
                        local: 'ws://localhost:8080',
                        cloud: 'wss://YOUR-BACKEND.run.app'
                    }
                },
                video: {
                    displayWidth: 768,
                    displayHeight: 768,
                    sources: {
                        local: {
                            idle: 'media/video/idle.mp4',
                            listening: 'media/video/idle.mp4',
                            speaking: 'media/video/talking.mp4'
                        }
                    }
                }
            };
            this.videoSources = defaultConfig.video.sources;
            return defaultConfig;
        }
    }

    connectWebSocket(url) {
        return new Promise((resolve, reject) => {
            this.log(`Connecting to ${url}...`, 'info');

            this.ws = new WebSocket(url);

            const timeout = setTimeout(() => {
                reject(new Error('Connection timeout'));
            }, 5000);

            this.ws.onopen = () => {
                clearTimeout(timeout);
                this.log('WebSocket connected', 'success');
            };

            this.ws.onmessage = (event) => {
                this.handleMessage(event.data);
            };

            this.ws.onerror = (error) => {
                clearTimeout(timeout);
                this.log('WebSocket error', 'error');
                reject(error);
            };

            this.ws.onclose = (event) => {
                this.log(`WebSocket closed: ${event.code}`, 'info');
                this.setStatus('disconnected', 'Disconnected');
                this.cleanup();
            };

            // Wait for ready message
            const readyHandler = (event) => {
                const data = JSON.parse(event.data);
                if (data.ready) {
                    clearTimeout(timeout);
                    this.ws.removeEventListener('message', readyHandler);
                    resolve();
                }
            };

            this.ws.addEventListener('message', readyHandler);
        });
    }

    async startAudio() {
        // Initialize audio player for output (24kHz)
        this.audioPlayer = new AudioPlayer(this.SAMPLE_RATE_OUTPUT);

        // Set up callback for when all audio finishes
        this.audioPlayer.onAllAudioEnded = () => {
            console.log('🔇 All audio playback complete');
            // Stop barge-in monitoring when audio finishes
            if (this.audioRecorder) {
                this.audioRecorder.stopBargeInMonitoring();
            }
            // If turn_complete arrived while audio was playing, handle it now
            if (this.pendingTurnComplete) {
                console.log('   Processing pending turn_complete');
                this.pendingTurnComplete = false;
                this.setAvatarState('listening');
            }
        };

        // Resume AudioContext (required on some browsers)
        if (this.audioPlayer.audioContext.state === 'suspended') {
            await this.audioPlayer.audioContext.resume();
        }

        // Initialize audio recorder for input (16kHz)
        this.audioRecorder = new AudioRecorder(this.SAMPLE_RATE_INPUT);

        // Handle audio data from microphone
        this.audioRecorder.onData = (base64Audio) => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                // SDK-COMPLIANT: Send audio as base64 via WebSocket to backend
                this.ws.send(JSON.stringify({
                    type: 'audio',
                    data: base64Audio
                }));
            }
        };

        // Handle client-side barge-in detection
        this.audioRecorder.onBargeInDetected = () => {
            console.log('🎤 CLIENT-SIDE BARGE-IN: User speaking while audio playing');
            this.handleLocalBargeIn();
        };

        // Start recording
        await this.audioRecorder.start();
        this.isRecording = true;
        this.audioIndicator.classList.add('active');
        this.log('🎤 Microphone active', 'info');
    }

    handleLocalBargeIn() {
        const now = Date.now();

        // Debounce: If last interrupt was less than 50ms ago, extend the existing timeout
        if (this.isInterrupted && (now - this.lastInterruptTime) < 50) {
            console.log('   🔄 Extending interrupt (rapid barge-in)');
            this.lastInterruptTime = now;

            // Clear existing timeout and set a new one
            if (this.interruptTimeout) {
                clearTimeout(this.interruptTimeout);
            }
            this.interruptTimeout = setTimeout(() => this.clearInterruptState(), 150);
            return;
        }

        // Fresh interrupt or first interrupt
        if (this.isInterrupted) {
            console.log('   ⚠️ Already interrupted, forcing cleanup');
            this.forceCleanupInterrupt();
        }

        console.log('⚡ LOCAL BARGE-IN: Immediately halting audio');
        this.lastInterruptTime = now;

        // 1. Set interrupted flag to block incoming audio
        this.isInterrupted = true;

        // 2. Send interrupt signal to backend to stop sending audio
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'interrupt'
            }));
            console.log('   📤 Interrupt signal sent to backend');
        }

        // 3. Stop monitoring for more barge-ins (will restart when needed)
        if (this.audioRecorder) {
            this.audioRecorder.stopBargeInMonitoring();
        }

        // 4. Immediately stop ALL audio and clear pending flags
        if (this.audioPlayer) {
            this.audioPlayer.stop();
        }
        this.pendingTurnComplete = false;
        console.log('   🛑 Audio halted');

        // 5. Return to idle
        this.setAvatarState('idle');

        // 6. Schedule transition to listening after brief pause
        if (this.interruptTimeout) {
            clearTimeout(this.interruptTimeout);
        }
        this.interruptTimeout = setTimeout(() => this.clearInterruptState(), 150);
    }

    clearInterruptState() {
        console.log('   ✅ Clearing interrupt state, ready for response');
        this.setAvatarState('listening');
        this.isInterrupted = false;
        this.interruptTimeout = null;
    }

    forceCleanupInterrupt() {
        // Aggressive cleanup when multiple interrupts happen
        console.log('   🧹 Force cleanup interrupt state');

        if (this.interruptTimeout) {
            clearTimeout(this.interruptTimeout);
            this.interruptTimeout = null;
        }

        if (this.audioRecorder) {
            this.audioRecorder.stopBargeInMonitoring();
        }

        if (this.audioPlayer) {
            this.audioPlayer.stop();
        }

        this.pendingTurnComplete = false;
    }

    handleMessage(data) {
        try {
            const message = JSON.parse(data);
            const type = message.type;

            // Fast path for audio (most common message)
            if (type === 'audio') {
                // BARGE-IN GUARD: Ignore audio if we're in interrupted state
                if (this.isInterrupted) {
                    console.log('   ⏭️ Skipping audio chunk (interrupted state)');
                    return;
                }

                // Clear any pending turn_complete since we're receiving new audio
                this.pendingTurnComplete = false;

                // Clear any pending interrupt timeout (we're getting a real response)
                if (this.interruptTimeout) {
                    clearTimeout(this.interruptTimeout);
                    this.interruptTimeout = null;
                }

                // ASYNC COORDINATION: Start video first, then audio
                // This prevents interference between video decoder initialization and audio processing
                this.setAvatarState('speaking');

                // Start barge-in monitoring when audio starts playing
                if (this.audioRecorder && !this.isInterrupted) {
                    this.audioRecorder.startBargeInMonitoring();
                }

                // Resume video if it was paused during sentence break
                if (this.avatarVideo && this.avatarVideo.paused) {
                    this.avatarVideo.play();
                    console.log('   📹 Talking video resumed');
                }

                // Defer audio playback to next tick to avoid blocking video
                // This ensures video element state changes complete before audio decode starts
                requestAnimationFrame(() => {
                    this.audioPlayer.play(message.data);
                });
                return;
            }

            switch (type) {
                case 'setup_complete':
                    console.log('✅ SDK setup complete');
                    this.setStatus('connected', 'Connected & Ready');
                    break;

                case 'text':
                    console.log(`💬 Gemini: ${message.data}`);
                    break;

                case 'turn_complete':
                    console.log('✅ Turn complete received (sentence boundary)');
                    // NATURAL PAUSING: Pause the talking video between sentences
                    // - If audio still queued: Pause talking video (natural pause)
                    // - If no audio: Return to listening (conversation ended)
                    if (this.audioPlayer && this.audioPlayer.sources.length > 0) {
                        console.log('   Audio still queued, pausing talking video between sentences');
                        // Pause the speaking video for natural sentence break
                        if (this.currentAvatarState === 'speaking' && this.avatarVideo) {
                            this.avatarVideo.pause();
                            console.log('   📹 Talking video paused');
                        }
                        this.pendingTurnComplete = true;
                        // Will be handled by audioPlayer.onAllAudioEnded callback
                    } else {
                        console.log('   No audio playing, returning to listening');
                        // Stop barge-in monitoring when returning to listening
                        if (this.audioRecorder) {
                            this.audioRecorder.stopBargeInMonitoring();
                        }
                        this.setAvatarState('listening');
                    }
                    break;

                case 'interrupted':
                    console.log('⚠️ Server-side interruption detected');
                    // If we're already handling a client-side interrupt, skip this
                    if (this.isInterrupted) {
                        console.log('   Already handling client-side interrupt');
                        return;
                    }

                    // BARGE-IN FLOW (server-detected):
                    // 1. Set interrupted flag to block incoming audio
                    this.isInterrupted = true;

                    // 2. Stop monitoring for more barge-ins
                    if (this.audioRecorder) {
                        this.audioRecorder.stopBargeInMonitoring();
                    }

                    // 3. Immediately stop ALL audio and clear pending flags
                    this.audioPlayer.stop();
                    this.pendingTurnComplete = false;
                    this.setAvatarState('idle');
                    console.log('   🛑 Audio halted, avatar to idle');

                    // 4. Schedule transition to listening after brief pause
                    if (this.interruptTimeout) {
                        clearTimeout(this.interruptTimeout);
                    }
                    this.interruptTimeout = setTimeout(() => this.clearInterruptState(), 150);
                    break;

                case 'tool_call':
                    this.log(`🔧 Tool call: ${message.data.name}`, 'info');
                    break;

                case 'error':
                    this.log(`❌ Error: ${message.data.message}`, 'error');
                    break;

                case 'go_away':
                    this.log('🚪 Server closing connection', 'info');
                    this.stop();
                    break;
            }

        } catch (error) {
            console.error('Error parsing message:', error);
        }
    }

    sendText() {
        const text = this.textInput.value.trim();
        if (!text || !this.isConnected) return;

        try {
            // SDK-COMPLIANT: Send text message to backend
            this.ws.send(JSON.stringify({
                type: 'text',
                data: text
            }));

            this.log(`📤 Sent: ${text}`, 'info');
            this.textInput.value = '';

        } catch (error) {
            this.log(`Error sending text: ${error.message}`, 'error');
        }
    }

    stop() {
        this.log('Stopping...', 'info');
        this.cleanup();
    }

    cleanup() {
        // Stop video cycling
        this.stopVideoSpeakingCycle();

        // Clear any pending interrupt timeout
        if (this.interruptTimeout) {
            clearTimeout(this.interruptTimeout);
            this.interruptTimeout = null;
        }

        // Stop audio
        if (this.audioRecorder) {
            this.audioRecorder.stopBargeInMonitoring();
            this.audioRecorder.stop();
            this.audioRecorder = null;
        }

        if (this.audioPlayer) {
            this.audioPlayer.stop();
            this.audioPlayer = null;
        }

        // Close WebSocket
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this.isConnected = false;
        this.isRecording = false;
        this.isInterrupted = false;  // Clear interrupted state
        this.pendingTurnComplete = false;  // Clear pending flags
        this.lastInterruptTime = 0;  // Reset interrupt timestamp

        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
        this.sendTextBtn.disabled = true;
        this.audioIndicator.classList.remove('active');

        // Set avatar back to idle
        this.setAvatarState('idle');

        this.setStatus('disconnected', 'Disconnected');
        this.log('Stopped', 'info');
    }

    setStatus(state, text) {
        this.statusEl.className = `status ${state}`;
        this.statusEl.textContent = text;
    }


    /**
     * VIDEO SPEAKING CYCLE ALGORITHM
     *
     * Mathematical Model:
     * ------------------
     * Position sequence: P₀ → P₁ → P₂ → P₃ → P₂ → P₃ → ...
     *
     * Phase 1 (Initial): P₀=0 → P₁=F1 (forward F1 seconds)
     * Phase 2 (Reverse): P₁=F1 → P₂=(F1-R) (backward R seconds)
     * Phase 3 (Forward): P₂ → P₃=(P₂+F2) (forward F2 seconds)
     * Loop: P₃ → P₂ → P₃ → P₂ ... (stable oscillation)
     *
     * Example with F1=3, R=2, F2=2:
     *   P₀ = 0s
     *   P₁ = 3s (after initial forward)
     *   P₂ = 1s (after reverse: 3-2)
     *   P₃ = 3s (after forward: 1+2)
     *   Oscillates: {3, 1, 3, 1, 3, 1, ...}
     *
     * Stability: P₃ = P₁ → perfect loop with no drift
     *
     * Key Features:
     * - Forced position corrections prevent cumulative drift
     * - requestAnimationFrame for smooth reverse playback
     * - Three end conditions: time, target, floor (safety)
     * - Detailed logging for debugging and verification
     */
    startVideoSpeakingCycle() {
        // Check if enabled in config
        if (!this.speakingCycleConfig.enabled) return;

        // Stop any existing cycle
        this.stopVideoSpeakingCycle();

        if (!this.avatarVideo) return;

        this.isSpeaking = true;
        const video = this.avatarVideo;

        // Note: Video is already playing from setAvatarState()
        // loop and playbackRate already set in setAvatarState()

        // PROBLEM 1: Validate video duration
        const F1 = this.speakingCycleConfig.initialForwardDuration;
        const R = this.speakingCycleConfig.reverseDuration;
        const F2 = this.speakingCycleConfig.forwardDuration;
        const minRequired = Math.max(F1, R + F2);

        // Check video duration (if available)
        if (video.duration && video.duration < minRequired) {
            console.warn(`⚠️ Video too short! Duration: ${video.duration.toFixed(1)}s, Required: ${minRequired}s`);
            console.warn(`   Cycle may not work correctly. Consider using a longer video or reducing cycle durations.`);
        }

        console.log(`🎬 Starting cycle: F1=${F1}s, R=${R}s, F2=${F2}s (min required: ${minRequired}s)`);
        if (video.duration) {
            console.log(`   Video duration: ${video.duration.toFixed(1)}s`);
        }

        // PROBLEM 2, 3: Phase 1 - Initial forward play
        // P₀ = 0 → P₁ = F1
        // Note: Video is already playing from setAvatarState(), we just manage timing

        const phase1Timer = setTimeout(() => {
            if (!this.isSpeaking) return;

            // PROBLEM 3: Force exact position to prevent drift
            const expectedPosition = F1;
            const actualPosition = video.currentTime;
            const drift = Math.abs(actualPosition - expectedPosition);

            console.log(`🔄 Phase 1 complete: expected=${expectedPosition.toFixed(3)}s, actual=${actualPosition.toFixed(3)}s, drift=${drift.toFixed(3)}s`);

            // Correct any drift
            video.currentTime = expectedPosition;
            video.pause();

            // Start oscillation cycle
            this.startReverseCycle();
        }, F1 * 1000);

        this.videoCycleTimers.push(phase1Timer);
    }

    startReverseCycle() {
        if (!this.isSpeaking || !this.avatarVideo) return;

        const video = this.avatarVideo;
        const R = this.speakingCycleConfig.reverseDuration;
        const F2 = this.speakingCycleConfig.forwardDuration;

        let isReverse = true;
        let cycleCount = 0;
        const positionHistory = [];  // Track positions for stability verification

        const cycle = () => {
            if (!this.isSpeaking) return;

            if (isReverse) {
                cycleCount++;

                // PROBLEM 4: Calculate target position
                // V_target = max(0, V_start - R)
                const V_start = video.currentTime;  // Should be ~3.0 after initial or forward
                const V_target = Math.max(0, V_start - R);

                console.log(`⏪ Cycle ${cycleCount}: Reverse ${R}s: ${V_start.toFixed(3)}s → ${V_target.toFixed(3)}s`);

                // PROBLEM 5: Reverse frame calculation setup
                const T_start = Date.now();
                video.pause();  // Ensure paused for manual control

                const reverseFrame = () => {
                    if (!this.isSpeaking) return;

                    // PROBLEM 5: Linear reverse calculation
                    // V(t) = V_start - elapsed
                    const elapsed = (Date.now() - T_start) / 1000;
                    const newTime = V_start - elapsed;

                    // PROBLEM 6: Three end conditions
                    const timeExpired = elapsed >= R;
                    const reachedTarget = newTime <= V_target;
                    const hitFloor = newTime <= 0;

                    if (timeExpired || reachedTarget || hitFloor) {
                        // PROBLEM 7: Force exact final position
                        video.currentTime = V_target;

                        const actualElapsed = elapsed.toFixed(3);
                        const drift = Math.abs(video.currentTime - V_target).toFixed(3);
                        console.log(`  ✅ Reverse done: elapsed=${actualElapsed}s, position=${video.currentTime.toFixed(3)}s, drift=${drift}s`);

                        // Track position for stability analysis
                        positionHistory.push({ cycle: cycleCount, phase: 'reverse_end', position: video.currentTime });

                        // Switch to forward
                        isReverse = false;
                        const timer = setTimeout(cycle, 0);
                        this.videoCycleTimers.push(timer);
                    } else {
                        // PROBLEM 5: Update position for this frame
                        video.currentTime = newTime;
                        this.videoCycleAnimationFrame = requestAnimationFrame(reverseFrame);
                    }
                };

                reverseFrame();

            } else {
                // PROBLEM 8, 9: Forward phase
                // V₃ = V₂ + F2
                const V_start = video.currentTime;  // Should be ~1.0
                const V_expected = V_start + F2;    // Should reach ~3.0

                console.log(`▶️  Cycle ${cycleCount}: Forward ${F2}s: ${V_start.toFixed(3)}s → ${V_expected.toFixed(3)}s`);

                // Play forward naturally
                video.play().catch(e => console.log('Video play failed:', e));

                const T_forward_start = Date.now();

                const timer = setTimeout(() => {
                    if (!this.isSpeaking) return;

                    // PROBLEM 9: Verify end position
                    const V_actual = video.currentTime;
                    const drift = Math.abs(V_actual - V_expected);
                    const timeElapsed = (Date.now() - T_forward_start) / 1000;

                    console.log(`  ✅ Forward done: elapsed=${timeElapsed.toFixed(3)}s, expected=${V_expected.toFixed(3)}s, actual=${V_actual.toFixed(3)}s, drift=${drift.toFixed(3)}s`);

                    // Pause and correct position
                    video.pause();
                    video.currentTime = V_expected;  // Force exact position

                    // Track position for stability analysis
                    positionHistory.push({ cycle: cycleCount, phase: 'forward_end', position: video.currentTime });

                    // PROBLEM 10: Stability verification (every 5 cycles)
                    if (cycleCount % 5 === 0) {
                        const recent = positionHistory.slice(-10);  // Last 10 positions
                        const avgPos = recent.reduce((sum, p) => sum + p.position, 0) / recent.length;
                        const maxDrift = Math.max(...recent.map(p => Math.abs(p.position - avgPos)));

                        console.log(`📊 Cycle ${cycleCount} Stability Check:`);
                        console.log(`   Average position: ${avgPos.toFixed(3)}s`);
                        console.log(`   Max drift from avg: ${maxDrift.toFixed(3)}s`);
                        console.log(`   Status: ${maxDrift < 0.1 ? '✅ Stable' : '⚠️ Drifting'}`);
                    }

                    // PROBLEM 10: Loop back to reverse
                    isReverse = true;
                    cycle();
                }, F2 * 1000);

                this.videoCycleTimers.push(timer);
            }
        };

        // Start the oscillation
        cycle();
    }

    stopVideoSpeakingCycle() {
        if (!this.isSpeaking) return;  // Already stopped

        this.isSpeaking = false;

        // Clear all timers
        const timerCount = this.videoCycleTimers.length;
        for (const timer of this.videoCycleTimers) {
            clearTimeout(timer);
        }
        this.videoCycleTimers = [];

        // Clear animation frame
        if (this.videoCycleAnimationFrame) {
            cancelAnimationFrame(this.videoCycleAnimationFrame);
            this.videoCycleAnimationFrame = null;
        }

        if (this.avatarVideo) {
            this.avatarVideo.loop = true;
            this.avatarVideo.playbackRate = 1.0;
            console.log(`⏹️ Video cycle stopped (cleared ${timerCount} timers)`);
        }
    }

    setAvatarState(state) {
        if (!this.videoSources) return;

        const videoSrc = this.videoSources[state];
        if (!videoSrc) return;

        // Get the target video element for this state
        const targetVideo = this.avatarVideos[state];
        if (!targetVideo) {
            console.error(`❌ Video element not found for state: ${state}`);
            return;
        }

        // CRITICAL FIX: Don't restart video if already in this state
        // This prevents audio chunks from repeatedly resetting the video to frame 0
        if (this.currentAvatarState === state && this.avatarVideo === targetVideo) {
            // Already in this state with this video, nothing to do
            return;
        }

        const previousState = this.currentAvatarState;
        this.currentAvatarState = state;

        console.log(`🎭 Avatar state: ${previousState} -> ${state}`);

        // Store reference to previous video for crossfade
        const previousVideo = this.avatarVideo;

        // Switch to the new video element
        this.avatarVideo = targetVideo;

        // Handle speaking state with video cycling
        if (state === 'speaking') {
            // Prepare video for cycle control
            this.avatarVideo.loop = false;
            this.avatarVideo.playbackRate = 1.0;

            // Reset to beginning (video should already be playing from pre-warm)
            // Use requestAnimationFrame to avoid blocking
            requestAnimationFrame(() => {
                this.avatarVideo.currentTime = 0;
            });

            // Video is already playing from pre-warm, just ensure it's not paused
            if (this.avatarVideo.paused) {
                this.avatarVideo.play().then(() => {
                    console.log('⚡ Speaking video resumed from pre-warm state');
                    this.startVideoSpeakingCycle();
                }).catch(e => {
                    console.error('❌ Failed to play speaking video:', e);
                });
            } else {
                // Already playing! Just start the cycle
                console.log('⚡ Speaking video already warm, starting cycle');
                this.startVideoSpeakingCycle();
            }
        } else {
            // Stop cycling when returning to idle or listening
            this.stopVideoSpeakingCycle();

            // Stop barge-in monitoring when returning to idle or listening
            if (state === 'idle' || state === 'listening') {
                if (this.audioRecorder) {
                    this.audioRecorder.stopBargeInMonitoring();
                }
            }

            // Ensure idle/listening videos loop normally and are playing
            this.avatarVideo.loop = true;
            this.avatarVideo.playbackRate = 1.0;

            // Start playing BEFORE the crossfade to ensure smooth transition
            if (this.avatarVideo.paused) {
                this.avatarVideo.play().catch(e => {
                    console.log('Video autoplay blocked, will play on user interaction');
                });
            }
        }

        // SMOOTH CROSSFADE: Add .active to new video FIRST, then remove from old
        // This creates a seamless transition with no flicker
        // The new video is already playing (started above), so the transition is butter-smooth

        // Start fading IN the new video
        this.avatarVideo.classList.add('active');

        // Then fade OUT the previous video (if different)
        if (previousVideo && previousVideo !== targetVideo) {
            // Use requestAnimationFrame to ensure the new video's transition starts first
            requestAnimationFrame(() => {
                previousVideo.classList.remove('active');
            });
        }
    }

    log(message, type = 'info') {
        // Batch DOM updates to reduce reflows
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;

        // Use DocumentFragment to batch updates
        if (this.logEl.children.length >= 50) {
            this.logEl.removeChild(this.logEl.firstChild);
        }

        this.logEl.appendChild(entry);
        // Only scroll if already at bottom (avoid forced reflows)
        if (this.logEl.scrollHeight - this.logEl.scrollTop <= this.logEl.clientHeight + 50) {
            this.logEl.scrollTop = this.logEl.scrollHeight;
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    window.geminiClient = new GeminiLiveClient();

    // Load config and initialize avatar video
    try {
        const config = await window.geminiClient.loadConfig();

        // Set CSS variables from config
        if (config.video) {
            const root = document.documentElement;
            if (config.video.displayWidth) {
                root.style.setProperty('--video-width', `${config.video.displayWidth}px`);
                root.style.setProperty('--container-width', `${config.video.displayWidth + 80}px`);
            }
            if (config.video.displayHeight) {
                root.style.setProperty('--video-height', `${config.video.displayHeight}px`);
            }

            // Set video sources
            if (config.video.sources) {
                window.geminiClient.videoSources = config.video.sources;
                console.log('Video sources:', config.video.sources);

                // Load all videos into their respective elements
                const videos = window.geminiClient.avatarVideos;

                if (videos.idle && videos.listening && videos.speaking) {
                    // Set sources for all three video elements (environment-aware URLs)
                    videos.idle.src = window.geminiClient.getVideoUrl('idle');
                    videos.listening.src = window.geminiClient.getVideoUrl('listening');
                    videos.speaking.src = window.geminiClient.getVideoUrl('speaking');

                    console.log(`📹 Video URLs (${window.geminiClient.isLocalEnvironment() ? 'local' : 'cloud'}):`);
                    console.log(`   Idle: ${videos.idle.src}`);
                    console.log(`   Listening: ${videos.listening.src}`);
                    console.log(`   Speaking: ${videos.speaking.src}`);

                    // Pre-load all videos for instant state switching (no loading delays!)
                    Object.values(videos).forEach(video => {
                        video.muted = true;
                        video.loop = true;
                        video.preload = 'auto';  // Force preloading
                        video.load();  // Start loading immediately
                    });

                    console.log('✅ All videos pre-loaded and ready');

                    // PRE-WARM VIDEO DECODERS: Play all videos silently in background
                    // This ensures decoders are initialized and ready for instant switching
                    // Critical for smooth audio/video coordination
                    Object.values(videos).forEach(video => {
                        video.play().catch(e => {
                            console.log('Video pre-warm play blocked (will work after user interaction)');
                        });
                    });

                    console.log('⚡ Video decoders pre-warmed for instant playback');

                    // Set initial idle state
                    window.geminiClient.setAvatarState('idle');
                } else {
                    console.error('❌ Video elements not found');
                }
            }
        }
    } catch (error) {
        console.error('Error loading initial config:', error);
    }
});

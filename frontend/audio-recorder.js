/**
 * SDK-COMPLIANT Audio Recorder
 * Records 16kHz mono 16-bit PCM audio for Gemini Live API
 */

export class AudioRecorder {
    constructor(sampleRate = 16000) {
        this.sampleRate = sampleRate;
        this.audioContext = null;
        this.mediaStream = null;
        this.workletNode = null;
        this.analyserNode = null;
        this.onData = null;
        this.onBargeInDetected = null;  // Callback for client-side barge-in detection

        // Barge-in detection settings
        this.bargeInThreshold = 0.02;  // RMS threshold for speech detection
        this.bargeInCheckInterval = 50; // Check every 50ms
        this.bargeInCheckTimer = null;
        this.isMonitoringBargeIn = false;
    }

    async start() {
        try {
            // Request microphone access
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: this.sampleRate,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            // Create audio context
            this.audioContext = new AudioContext({ sampleRate: this.sampleRate });

            // Create source from microphone
            const source = this.audioContext.createMediaStreamSource(this.mediaStream);

            // Create analyser for barge-in detection
            this.analyserNode = this.audioContext.createAnalyser();
            this.analyserNode.fftSize = 256;
            this.analyserNode.smoothingTimeConstant = 0.3;

            // Load audio worklet
            await this.audioContext.audioWorklet.addModule('audio-worklet-processor.js');

            // Create worklet node
            this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-recorder-processor');

            // Handle audio data from worklet
            this.workletNode.port.onmessage = (event) => {
                const audioData = event.data;
                if (audioData && this.onData) {
                    // Convert Float32Array to Int16Array (PCM16)
                    const pcm16 = this.float32ToInt16(audioData);

                    // Convert to base64
                    const base64 = this.arrayBufferToBase64(pcm16.buffer);

                    this.onData(base64);
                }
            };

            // Connect audio graph: source -> analyser -> worklet
            source.connect(this.analyserNode);
            this.analyserNode.connect(this.workletNode);

            console.log('✅ Audio recorder started (with barge-in detection)');

        } catch (error) {
            console.error('Failed to start audio recorder:', error);
            throw error;
        }
    }

    stop() {
        // Stop barge-in monitoring
        this.stopBargeInMonitoring();

        if (this.workletNode) {
            this.workletNode.disconnect();
            this.workletNode = null;
        }

        if (this.analyserNode) {
            this.analyserNode.disconnect();
            this.analyserNode = null;
        }

        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }

        console.log('Audio recorder stopped');
    }

    /**
     * Start monitoring for barge-in (user speaking while audio is playing)
     */
    startBargeInMonitoring() {
        // Stop any existing monitoring first
        if (this.isMonitoringBargeIn) {
            this.stopBargeInMonitoring();
        }

        if (!this.analyserNode) {
            console.warn('Cannot start barge-in monitoring: analyser not initialized');
            return;
        }

        this.isMonitoringBargeIn = true;
        console.log('🎙️ Barge-in monitoring started');

        const dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);

        const checkAudioLevel = () => {
            if (!this.isMonitoringBargeIn || !this.analyserNode) {
                return;
            }

            // Get current audio data
            this.analyserNode.getByteTimeDomainData(dataArray);

            // Calculate RMS (Root Mean Square) for audio level
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
                const normalized = (dataArray[i] - 128) / 128;
                sum += normalized * normalized;
            }
            const rms = Math.sqrt(sum / dataArray.length);

            // If audio level exceeds threshold, trigger barge-in
            if (rms > this.bargeInThreshold) {
                console.log(`🎤 BARGE-IN detected! RMS: ${rms.toFixed(3)}`);
                this.isMonitoringBargeIn = false;  // Stop monitoring
                this.bargeInCheckTimer = null;  // Clear timer reference
                if (this.onBargeInDetected) {
                    this.onBargeInDetected();
                }
                return;  // Don't schedule next check
            }

            // Schedule next check
            this.bargeInCheckTimer = setTimeout(checkAudioLevel, this.bargeInCheckInterval);
        };

        // Start checking
        checkAudioLevel();
    }

    /**
     * Stop monitoring for barge-in
     */
    stopBargeInMonitoring() {
        if (this.bargeInCheckTimer) {
            clearTimeout(this.bargeInCheckTimer);
            this.bargeInCheckTimer = null;
        }
        if (this.isMonitoringBargeIn) {
            this.isMonitoringBargeIn = false;
            console.log('🎙️ Barge-in monitoring stopped');
        }
    }

    float32ToInt16(float32Array) {
        const int16Array = new Int16Array(float32Array.length);
        for (let i = 0; i < float32Array.length; i++) {
            // Clamp to [-1, 1] and convert to 16-bit PCM
            const s = Math.max(-1, Math.min(1, float32Array[i]));
            int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return int16Array;
    }

    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }
}

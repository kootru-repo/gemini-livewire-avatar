/**
 * SDK-COMPLIANT Audio Player
 * Plays 24kHz mono 16-bit PCM audio from Gemini Live API
 */

export class AudioPlayer {
    constructor(sampleRate = 24000) {
        this.sampleRate = sampleRate;
        // OFFICIAL GOOGLE SPEC: 24kHz, explicit sample rate
        this.audioContext = new AudioContext({
            sampleRate: sampleRate,
            latencyHint: 'interactive'
        });
        this.nextPlayTime = 0;
        this.sources = [];
        this.onAllAudioEnded = null;  // Callback when all audio finishes
        this.onAcknowledgmentEnded = null;  // Callback when acknowledgment finishes

        console.log(`🔊 AudioContext created: ${this.audioContext.sampleRate}Hz`);
    }

    play(base64Audio) {
        try {
            // OFFICIAL GOOGLE PATTERN: Decode base64 → PCM16 → Float32 → Play
            // Reference: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/live-api/streamed-conversations

            // Step 1: Decode base64 to ArrayBuffer
            const audioData = this.base64ToArrayBuffer(base64Audio);

            // Step 2: Convert to Int16Array (16-bit PCM)
            const int16Data = new Int16Array(audioData);

            // Step 3: Convert PCM16 to Float32 for WebAudio
            const float32Data = this.int16ToFloat32(int16Data);

            // Step 4: Create AudioBuffer (NO MERGING - play each chunk individually)
            const audioBuffer = this.audioContext.createBuffer(
                1,  // mono (official spec)
                float32Data.length,
                this.sampleRate  // 24000 Hz (official spec)
            );

            // Copy data to buffer
            audioBuffer.getChannelData(0).set(float32Data);

            // Step 5: Schedule for seamless playback
            this.scheduleBuffer(audioBuffer);

        } catch (error) {
            console.error('❌ Audio playback error:', error);
        }
    }

    scheduleBuffer(audioBuffer) {
        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.audioContext.destination);

        // Precise scheduling on AudioContext timeline
        const currentTime = this.audioContext.currentTime;

        // Reset timeline if it's in the past (first chunk or after pause)
        if (this.nextPlayTime < currentTime) {
            this.nextPlayTime = currentTime;
        }

        // Schedule exactly when previous chunk ends
        source.start(this.nextPlayTime);

        // Update next play time (seamless continuation)
        this.nextPlayTime += audioBuffer.duration;

        // Cleanup
        source.onended = () => {
            const index = this.sources.indexOf(source);
            if (index > -1) {
                this.sources.splice(index, 1);
            }

            // Trigger callback when all audio finishes
            if (this.sources.length === 0 && this.onAllAudioEnded) {
                this.onAllAudioEnded();
            }
        };

        this.sources.push(source);
    }

    stop() {
        // AGGRESSIVE STOP: Immediately halt all audio sources
        const sourceCount = this.sources.length;
        if (sourceCount > 0) {
            console.log(`🛑 Stopping ${sourceCount} audio source${sourceCount > 1 ? 's' : ''}`);
        }

        // Stop all playing sources immediately (iterate backwards to safely remove)
        for (let i = this.sources.length - 1; i >= 0; i--) {
            const source = this.sources[i];
            try {
                // Stop with immediate time (0) to halt right now
                source.stop(0);
                source.disconnect();
            } catch (e) {
                // Ignore if already stopped (can happen with scheduled sources)
                // This is normal for sources that haven't started yet or already ended
            }
        }

        // Clear the sources array completely
        this.sources.length = 0;

        // Reset the playback timeline to current time
        // This ensures any new audio starts fresh
        this.nextPlayTime = this.audioContext.currentTime;

        if (sourceCount > 0) {
            console.log('🛑 All audio stopped and cleared');
        }
    }

    /**
     * Play a brief acknowledgment sound for barge-in interruptions.
     * Generates a short "oh ok!" style acknowledgment using synthesized audio.
     */
    async playAcknowledgment() {
        try {
            // Generate a short, friendly beep pattern (two quick tones)
            // Duration: ~0.3 seconds total
            const duration = 0.3;
            const sampleCount = Math.floor(this.sampleRate * duration);
            const audioBuffer = this.audioContext.createBuffer(1, sampleCount, this.sampleRate);
            const channelData = audioBuffer.getChannelData(0);

            // Create two quick tones: "oh" (220Hz) + "ok" (330Hz)
            const tone1Freq = 220; // A3 note
            const tone2Freq = 330; // E4 note
            const tone1Duration = 0.12; // 120ms
            const tone2Duration = 0.12; // 120ms
            const gapDuration = 0.02; // 20ms gap
            const fadeTime = 0.01; // 10ms fade in/out

            for (let i = 0; i < sampleCount; i++) {
                const t = i / this.sampleRate;
                let sample = 0;

                // First tone ("oh")
                if (t < tone1Duration) {
                    const phase = 2 * Math.PI * tone1Freq * t;
                    const envelope = Math.min(t / fadeTime, (tone1Duration - t) / fadeTime, 1);
                    sample = Math.sin(phase) * envelope * 0.3; // 30% volume
                }
                // Second tone ("ok")
                else if (t > tone1Duration + gapDuration && t < tone1Duration + gapDuration + tone2Duration) {
                    const t2 = t - (tone1Duration + gapDuration);
                    const phase = 2 * Math.PI * tone2Freq * t2;
                    const envelope = Math.min(t2 / fadeTime, (tone2Duration - t2) / fadeTime, 1);
                    sample = Math.sin(phase) * envelope * 0.3; // 30% volume
                }

                channelData[i] = sample;
            }

            // Play the acknowledgment immediately (bypass normal queue)
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.audioContext.destination);

            // Play immediately, resetting the timeline
            const currentTime = this.audioContext.currentTime;
            this.nextPlayTime = currentTime;
            source.start(this.nextPlayTime);
            this.nextPlayTime += audioBuffer.duration;

            // Cleanup and callback
            source.onended = () => {
                console.log('🔔 Acknowledgment complete');
                if (this.onAcknowledgmentEnded) {
                    this.onAcknowledgmentEnded();
                }
            };

            console.log('🔔 Playing barge-in acknowledgment');

        } catch (error) {
            console.error('❌ Acknowledgment playback error:', error);
        }
    }

    base64ToArrayBuffer(base64) {
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        // Faster: avoid repeated .length lookups
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }

    int16ToFloat32(int16Array) {
        const len = int16Array.length;
        const float32Array = new Float32Array(len);
        // Faster: precompute divisors, avoid conditionals in loop
        const SCALE_POS = 1 / 0x7FFF;
        const SCALE_NEG = 1 / 0x8000;
        for (let i = 0; i < len; i++) {
            const sample = int16Array[i];
            float32Array[i] = sample * (sample < 0 ? SCALE_NEG : SCALE_POS);
        }
        return float32Array;
    }
}

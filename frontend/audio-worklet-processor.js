/**
 * SDK-COMPLIANT Audio Worklet Processor
 * Captures audio in real-time for Gemini Live API (16kHz mono)
 */

class AudioRecorderProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.bufferSize = 3200; // 100ms at 16kHz (recommended chunk size)
        this.buffer = new Float32Array(this.bufferSize);
        this.bufferIndex = 0;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];

        if (input && input.length > 0) {
            const channelData = input[0]; // Mono channel

            // Accumulate audio data
            for (let i = 0; i < channelData.length; i++) {
                this.buffer[this.bufferIndex++] = channelData[i];

                // When buffer is full, send it to main thread
                if (this.bufferIndex >= this.bufferSize) {
                    // Create a copy to send
                    const chunk = new Float32Array(this.buffer);

                    this.port.postMessage(chunk);

                    // Reset buffer
                    this.bufferIndex = 0;
                }
            }
        }

        return true; // Keep processor alive
    }
}

registerProcessor('audio-recorder-processor', AudioRecorderProcessor);

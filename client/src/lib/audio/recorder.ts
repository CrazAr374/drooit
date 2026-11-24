export interface AudioRecordingResult {
  blob: Blob;
  base64: string;
  durationSeconds: number;
  mime: string;
}

export class AudioRecorder {
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private startTime = 0;
  private durationSeconds = 0;
  private isRecording = false;

  static isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices !== 'undefined' &&
      typeof navigator.mediaDevices.getUserMedia === 'function' &&
      typeof window.MediaRecorder !== 'undefined'
    );
  }

  async start(): Promise<void> {
    if (this.isRecording) return;
    this.audioChunks = [];

    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    const mimeType = this.getSupportedMimeType();
    this.mediaRecorder = new MediaRecorder(this.mediaStream, {
      mimeType: mimeType || undefined,
    });

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };

    this.startTime = Date.now();
    this.mediaRecorder.start(100);
    this.isRecording = true;
  }

  async stop(): Promise<AudioRecordingResult> {
    if (!this.isRecording || !this.mediaRecorder) {
      throw new Error('Audio recorder is not running');
    }

    return new Promise((resolve, reject) => {
      const recorder = this.mediaRecorder!;
      recorder.onstop = async () => {
        try {
          this.durationSeconds = Math.max(1, Math.round((Date.now() - this.startTime) / 1000));
          const mime = recorder.mimeType || 'audio/webm';
          const blob = new Blob(this.audioChunks, { type: mime });
          const base64 = await this.blobToBase64(blob);

          this.cleanup();
          resolve({
            blob,
            base64,
            durationSeconds: this.durationSeconds,
            mime,
          });
        } catch (err) {
          this.cleanup();
          reject(err);
        }
      };

      try {
        recorder.stop();
      } catch (err) {
        this.cleanup();
        reject(err);
      }
    });
  }

  cancel(): void {
    if (this.mediaRecorder && this.isRecording) {
      try {
        this.mediaRecorder.stop();
      } catch {
        // ignore
      }
    }
    this.cleanup();
  }

  private cleanup(): void {
    this.isRecording = false;
    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) {
        track.stop();
      }
      this.mediaStream = null;
    }
    this.mediaRecorder = null;
    this.audioChunks = [];
  }

  private getSupportedMimeType(): string {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/mp4',
    ];
    for (const candidate of candidates) {
      if (MediaRecorder.isTypeSupported(candidate)) {
        return candidate;
      }
    }
    return '';
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64 = result.includes(',') ? result.split(',')[1]! : result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}

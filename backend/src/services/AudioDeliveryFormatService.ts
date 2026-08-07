import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface AudioDeliveryFormatResult {
  sampleRate: 44100;
  channels: 2;
  bitDepth: 16;
  codec: 'pcm_s16le';
  resampler: 'soxr-28bit';
  bytes: number;
}

export class AudioDeliveryFormatService {
  public static async writeProductionWav(
    inputBuffer: Buffer,
    outputPath: string
  ): Promise<AudioDeliveryFormatResult> {
    const outputDirectory = path.dirname(outputPath);
    fs.mkdirSync(outputDirectory, { recursive: true });

    const sourcePath = path.join(
      outputDirectory,
      `.${path.basename(outputPath)}.${process.pid}.${Date.now()}.source.wav`
    );
    fs.writeFileSync(sourcePath, inputBuffer);

    try {
      await new Promise<void>((resolve, reject) => {
        execFile(
          'ffmpeg',
          [
            '-y',
            '-hide_banner',
            '-loglevel', 'error',
            '-i', sourcePath,
            '-af', 'aresample=resampler=soxr:precision=28',
            '-ar', '44100',
            '-ac', '2',
            '-c:a', 'pcm_s16le',
            outputPath
          ],
          { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 },
          (error, _stdout, stderr) => {
            if (error) {
              reject(new Error(`DELIVERY_FORMAT_FAILED: ${stderr.trim() || error.message}`));
              return;
            }
            resolve();
          }
        );
      });
    } finally {
      if (fs.existsSync(sourcePath)) fs.unlinkSync(sourcePath);
    }

    if (!fs.existsSync(outputPath)) {
      throw new Error('DELIVERY_FORMAT_FAILED: FFmpeg produced no output WAV');
    }

    const header = fs.readFileSync(outputPath).subarray(0, 44);
    const valid = header.length >= 44
      && header.toString('ascii', 0, 4) === 'RIFF'
      && header.toString('ascii', 8, 12) === 'WAVE'
      && header.readUInt16LE(22) === 2
      && header.readUInt32LE(24) === 44_100
      && header.readUInt16LE(34) === 16;
    if (!valid) {
      throw new Error('DELIVERY_FORMAT_FAILED: output is not stereo PCM16 WAV at 44.1 kHz');
    }

    return {
      sampleRate: 44_100,
      channels: 2,
      bitDepth: 16,
      codec: 'pcm_s16le',
      resampler: 'soxr-28bit',
      bytes: fs.statSync(outputPath).size
    };
  }
}

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  attachMediaStreamToVideo,
  getMediaStartErrorMessage,
  isMediaPermissionDenied,
} from './mediaUtils';

describe('getMediaStartErrorMessage', () => {
  it('explains camera and microphone permission denial', () => {
    const error = new DOMException('Permission denied', 'NotAllowedError');

    assert.equal(
      getMediaStartErrorMessage(error, 'video'),
      '浏览器拒绝了摄像头和麦克风权限。请允许权限后重新进入视频对话。'
    );
  });
});

describe('isMediaPermissionDenied', () => {
  it('detects browser permission denial errors', () => {
    assert.equal(isMediaPermissionDenied(new DOMException('Permission denied', 'NotAllowedError')), true);
    assert.equal(isMediaPermissionDenied(new Error('other')), false);
  });
});

describe('attachMediaStreamToVideo', () => {
  it('assigns the stream and starts playback', async () => {
    let playCalled = false;
    const stream = {} as MediaStream;
    const video = {
      srcObject: null,
      play: async () => {
        playCalled = true;
      },
    } as Pick<HTMLVideoElement, 'srcObject' | 'play'>;

    await attachMediaStreamToVideo(video, stream);

    assert.equal(video.srcObject, stream);
    assert.equal(playCalled, true);
  });

  it('does not reload the video element when the same stream is already attached', async () => {
    const stream = {} as MediaStream;
    let assignmentCount = 0;
    let currentStream: MediaStream | null = stream;
    const video = {
      get srcObject() {
        return currentStream;
      },
      set srcObject(value: MediaProvider | null) {
        assignmentCount += 1;
        currentStream = value as MediaStream | null;
      },
      play: async () => {},
    } as Pick<HTMLVideoElement, 'srcObject' | 'play'>;

    await attachMediaStreamToVideo(video, stream);

    assert.equal(assignmentCount, 0);
  });

  it('does not warn when playback is interrupted by a stream reload', async () => {
    const stream = {} as MediaStream;
    const video = {
      srcObject: null,
      play: async () => {
        throw new DOMException('The play() request was interrupted by a new load request.', 'AbortError');
      },
    } as Pick<HTMLVideoElement, 'srcObject' | 'play'>;

    const originalWarn = console.warn;
    let warned = false;
    console.warn = () => {
      warned = true;
    };

    try {
      await attachMediaStreamToVideo(video, stream);
    } finally {
      console.warn = originalWarn;
    }

    assert.equal(warned, false);
  });
});

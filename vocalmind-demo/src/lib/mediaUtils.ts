type MediaMode = 'video' | 'audio';

export function getMediaStartErrorMessage(error: unknown, mode: MediaMode): string {
  const name = error instanceof DOMException ? error.name : '';
  const label = mode === 'video' ? '摄像头和麦克风' : '麦克风';

  if (isMediaPermissionDenied(error)) {
    return `浏览器拒绝了${label}权限。请允许权限后重新进入${mode === 'video' ? '视频' : '语音'}对话。`;
  }

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return `没有找到可用的${label}设备。`;
  }

  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return `${label}正在被其他应用占用，请关闭占用设备的应用后重试。`;
  }

  return `${label}启动失败，请检查浏览器权限和设备状态后重试。`;
}

export function isMediaPermissionDenied(error: unknown): boolean {
  const name = error instanceof DOMException ? error.name : '';
  return name === 'NotAllowedError' || name === 'PermissionDeniedError';
}

export async function attachMediaStreamToVideo(
  video: Pick<HTMLVideoElement, 'srcObject' | 'play'>,
  stream: MediaStream
): Promise<void> {
  if (video.srcObject !== stream) {
    video.srcObject = stream;
  }

  try {
    await video.play();
  } catch (err) {
    if (isInterruptedPlaybackError(err)) {
      return;
    }
    console.warn('Failed to start video playback', err);
  }
}

function isInterruptedPlaybackError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

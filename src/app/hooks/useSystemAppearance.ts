import { useEffect, useState } from "react";

/** Track whether the window is in full screen, to adjust top-bar insets. */
export function useFullScreen(): boolean {
  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    if (!window.electron?.onFullScreenChange) return;
    return window.electron.onFullScreenChange(setIsFullScreen);
  }, []);

  return isFullScreen;
}

export function isIOS(): boolean {
  const iPadOnDesktopMode = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || iPadOnDesktopMode;
}

export function isStandalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches;
}

// Installed iOS apps do not share storage with Safari, so data saved in Safari stays behind.
export const isIOSBrowser = () => isIOS() && !isStandalone();

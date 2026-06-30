export function disableIosPageZoom() {
  if (typeof window === "undefined") return;

  const preventDefault = (event: Event) => {
    event.preventDefault();
  };

  const preventMultiTouchZoom = (event: TouchEvent) => {
    if (event.touches.length > 1) {
      event.preventDefault();
    }
  };

  document.addEventListener("gesturestart", preventDefault, { passive: false });
  document.addEventListener("gesturechange", preventDefault, { passive: false });
  document.addEventListener("gestureend", preventDefault, { passive: false });
  document.addEventListener("touchmove", preventMultiTouchZoom, { passive: false });
}

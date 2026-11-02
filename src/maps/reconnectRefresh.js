/**
 * Reload the globe's surface tiles when the browser comes back online.
 *
 * A network drop can leave Cesium's quadtree with child tiles marked as
 * loading whose imagery is never queued again. After the connection returns,
 * the ground stays on the coarsest whole-world tile, so a low camera (the
 * cockpit, street level) sees a blurry or blank smear instead of imagery.
 * Resetting the quadtree is what Cesium itself does when the terrain provider
 * changes; doing it once on `online` lets every tile load again.
 *
 * @param {object} viewer Cesium viewer.
 * @param {object} [options]
 * @param {{addEventListener: Function, removeEventListener: Function}} [options.target]
 *   Event source for `online` (the window by default).
 * @param {(reason?: string) => void} [options.requestRender] Wakes the render loop.
 * @returns {() => void} Removes the listener.
 */
export function installReconnectRefresh(
  viewer,
  { target = globalThis.window, requestRender } = {},
) {
  if (typeof target?.addEventListener !== 'function') return () => {};
  const onOnline = () => {
    if (viewer?.isDestroyed?.()) return;
    const globe = viewer?.scene?.globe;
    if (!globe?.show) return;
    // Cesium exposes no public reset for the surface quadtree.
    const surface = globe._surface;
    if (typeof surface?.invalidateAllTiles !== 'function') return;
    surface.invalidateAllTiles();
    console.info('[Map] Connection restored; reloading globe tiles');
    requestRender?.('connection restored');
  };
  target.addEventListener('online', onOnline);
  return () => target.removeEventListener('online', onOnline);
}

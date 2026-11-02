import assert from 'node:assert/strict';
import test from 'node:test';
import { installReconnectRefresh } from './reconnectRefresh.js';

function fakeTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) {
      listeners.set(type, fn);
    },
    removeEventListener(type, fn) {
      if (listeners.get(type) === fn) listeners.delete(type);
    },
    fire(type) {
      listeners.get(type)?.();
    },
    has(type) {
      return listeners.has(type);
    },
  };
}

function fakeViewer({ show = true, destroyed = false } = {}) {
  const calls = { invalidate: 0 };
  return {
    calls,
    isDestroyed: () => destroyed,
    scene: {
      globe: {
        show,
        _surface: {
          invalidateAllTiles() {
            calls.invalidate += 1;
          },
        },
      },
    },
  };
}

test('coming back online reloads the globe tiles and wakes rendering', () => {
  const target = fakeTarget();
  const viewer = fakeViewer();
  const reasons = [];
  const remove = installReconnectRefresh(viewer, {
    target,
    requestRender: (reason) => reasons.push(reason),
  });
  target.fire('online');
  assert.equal(viewer.calls.invalidate, 1);
  assert.deepEqual(reasons, ['connection restored']);
  remove();
  assert.equal(target.has('online'), false);
  target.fire('online');
  assert.equal(viewer.calls.invalidate, 1);
});

test('a hidden globe or a destroyed viewer is left alone', () => {
  for (const viewer of [
    fakeViewer({ show: false }),
    fakeViewer({ destroyed: true }),
  ]) {
    const target = fakeTarget();
    installReconnectRefresh(viewer, { target });
    target.fire('online');
    assert.equal(viewer.calls.invalidate, 0);
  }
});

test('without an event target the install is a no-op', () => {
  const remove = installReconnectRefresh(fakeViewer(), { target: null });
  assert.equal(typeof remove, 'function');
  remove();
});

import { render, act } from '@testing-library/react';
import { createElement, useEffect } from 'react';
import { vi } from 'vitest';
import { useContainerHeight } from '../useContainerHeight';

// --- ResizeObserver mock ---

type ResizeCallback = (entries: ResizeObserverEntry[]) => void;
const resizeCallbacks = new Map<Element, ResizeCallback>();

class MockResizeObserver {
  private callback: ResizeCallback;

  constructor(callback: ResizeCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    resizeCallbacks.set(target, this.callback);
  }

  unobserve(target: Element) {
    resizeCallbacks.delete(target);
  }

  disconnect() {
    resizeCallbacks.clear();
  }
}

beforeAll(() => {
  globalThis.ResizeObserver =
    MockResizeObserver as unknown as typeof ResizeObserver;
});

function triggerResizeObserver(
  target: Element,
  contentRect: Partial<DOMRectReadOnly>,
) {
  const callback = resizeCallbacks.get(target);
  if (callback) {
    callback([
      {
        target,
        contentRect: {
          x: 0,
          y: 0,
          width: 800,
          height: 0,
          top: 0,
          right: 800,
          bottom: 0,
          left: 0,
          ...contentRect,
        } as DOMRectReadOnly,
        borderBoxSize: [],
        contentBoxSize: [],
        devicePixelContentBoxSize: [],
      },
    ]);
  }
}

// --- getBoundingClientRect mock ---

let mockHeight = 0;

beforeEach(() => {
  mockHeight = 0;
  resizeCallbacks.clear();
  vi.spyOn(
    HTMLDivElement.prototype,
    'getBoundingClientRect',
  ).mockImplementation(
    () =>
      ({
        x: 0,
        y: 0,
        width: 800,
        height: mockHeight,
        top: 0,
        right: 800,
        bottom: mockHeight,
        left: 0,
        toJSON: vi.fn(),
      }) as DOMRect,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --- Test helper component ---

// Renders a div with the useContainerHeight hook and exposes the height
// via a data attribute so tests can assert against the real DOM.
function HeightReporter({ onHeight }: { onHeight: (h: number) => void }) {
  const { containerRef, height } = useContainerHeight();

  useEffect(() => {
    onHeight(height);
  }, [height, onHeight]);

  return createElement('div', {
    ref: containerRef,
    'data-testid': 'container',
    'data-height': height,
  });
}

it('measures container height on mount', () => {
  mockHeight = 600;
  let reportedHeight = -1;

  render(
    createElement(HeightReporter, {
      onHeight: (h: number) => {
        reportedHeight = h;
      },
    }),
  );

  expect(reportedHeight).toBe(600);
});

it('updates height when the container resizes', async () => {
  // Start with height 0 — simulates Timeline mounting before the browser
  // has resolved the flex layout, which can happen on first mount when
  // the container switches from EmptyTimeline to Scrubber > Timeline.
  mockHeight = 0;
  let reportedHeight = -1;

  const { getByTestId } = render(
    createElement(HeightReporter, {
      onHeight: (h: number) => {
        reportedHeight = h;
      },
    }),
  );

  expect(reportedHeight).toBe(0);

  // Simulate the container gaining height after layout resolves
  const container = getByTestId('container');
  await act(async () => {
    triggerResizeObserver(container, { height: 500 });
  });

  // The hook must re-measure and update. Without a ResizeObserver, the
  // hook stays at 0 because it only measures once on mount, preventing
  // Timeline from ever rendering tracks for the first recording.
  expect(reportedHeight).toBe(500);
});

it('updates height when fullscreen changes the container size', async () => {
  // Simulate a container that starts at normal viewport height and then
  // expands when fullscreen is entered (and later shrinks when exited).
  mockHeight = 400;
  let reportedHeight = -1;

  const { getByTestId } = render(
    createElement(HeightReporter, {
      onHeight: (h: number) => {
        reportedHeight = h;
      },
    }),
  );

  expect(reportedHeight).toBe(400);

  // Simulate entering fullscreen — container height increases
  const container = getByTestId('container');
  await act(async () => {
    triggerResizeObserver(container, { height: 900 });
  });

  expect(reportedHeight).toBe(900);

  // Simulate exiting fullscreen — container height returns to original
  await act(async () => {
    triggerResizeObserver(container, { height: 400 });
  });

  expect(reportedHeight).toBe(400);
});

import { render, act } from '@testing-library/react';
import { vi } from 'vitest';
import AudioService from '../../audio/AudioService';
import { useClassificationService } from '../useClassificationService';

type MockWorker = {
  postMessage: ReturnType<typeof vi.fn>;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  terminate: ReturnType<typeof vi.fn>;
};

let mockWorker: MockWorker;

// Must be a regular function (not arrow) to support `new` in Vitest v4
vi.stubGlobal(
  'Worker',
  vi.fn().mockImplementation(function () {
    mockWorker = {
      postMessage: vi.fn(),
      onmessage: null,
      onerror: null,
      terminate: vi.fn(),
    };
    return mockWorker;
  }),
);

function createAudioBuffer(): AudioBuffer {
  const data = new Float32Array(144000);
  return {
    numberOfChannels: 1,
    length: 144000,
    sampleRate: 48000,
    duration: 3,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
}

function lastPostedMessageId(): number {
  const calls = mockWorker.postMessage.mock.calls;
  return calls[calls.length - 1][0].id;
}

// Test component that renders classification state from the hook
function ClassificationDisplay({ trackId }: { trackId: string }) {
  const { getClassificationState, getClassification } =
    useClassificationService();
  const state = getClassificationState(trackId);
  const label = getClassification(trackId)?.label ?? '';
  return (
    <div>
      <span data-testid="state">{state}</span>
      <span data-testid="label">{label}</span>
    </div>
  );
}

const service = AudioService.getInstance().classificationService;

afterEach(() => {
  service.reset();
});

it('re-renders when classification transitions from idle to classifying', () => {
  const { getByTestId } = render(
    <ClassificationDisplay trackId="react-test-1" />,
  );

  expect(getByTestId('state').textContent).toBe('idle');

  // classify() synchronously sets state to 'classifying' before posting
  // to the worker. The hook should subscribe to the signal so the
  // component re-renders.
  act(() => {
    service.classify('react-test-1', createAudioBuffer());
  });

  expect(getByTestId('state').textContent).toBe('classifying');
});

it('re-renders when classification transitions from classifying to done', async () => {
  const { getByTestId } = render(
    <ClassificationDisplay trackId="react-test-2" />,
  );

  expect(getByTestId('state').textContent).toBe('idle');

  // Start classification
  let classifyPromise: Promise<string>;
  act(() => {
    classifyPromise = service.classify('react-test-2', createAudioBuffer());
  });

  expect(getByTestId('state').textContent).toBe('classifying');

  // Simulate worker completing classification using the actual message id
  const messageId = lastPostedMessageId();
  await act(async () => {
    mockWorker.onmessage!({
      data: {
        id: messageId,
        type: 'result',
        label: 'electricguitar',
        score: 0.85,
      },
    } as MessageEvent);
    await classifyPromise!;
  });

  expect(getByTestId('state').textContent).toBe('done');
  expect(getByTestId('label').textContent).toBe('guitar');
});

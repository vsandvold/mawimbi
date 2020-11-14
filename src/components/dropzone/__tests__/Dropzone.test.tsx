import { act, createEvent, fireEvent, render } from '@testing-library/react';
import React from 'react';
import Dropzone from '../Dropzone';

const defaultProps = {
  setIsDragActive: jest.fn(),
  setRootProps: jest.fn(),
  uploadFile: jest.fn(),
};

it('exposes root props to dropzone wrapper', () => {
  render(<Dropzone {...defaultProps} />);

  expect(defaultProps.setRootProps).toHaveBeenCalledTimes(1);
});

xit('activates drag on drag enter', async () => {
  // FIXME: jest-environment-jsdom-sixteen was added for this test to pass, please remove when
  // upgrading create-react-app https://github.com/testing-library/dom-testing-library/issues/477

  const { container, rerender } = render(
    <div data-testid="wrapper">
      <Dropzone {...defaultProps} />
    </div>
  );
  // const dropzone = container.querySelector('div');

  expect(defaultProps.setRootProps).toHaveBeenCalledTimes(1);
  const rootProps = defaultProps.setRootProps.mock.calls[0][0];

  rerender(
    <div data-testid="wrapper" {...rootProps}>
      <Dropzone {...defaultProps} />
    </div>
  );

  const event = createEventFoo(container);
  await act(async () => {
    fireEvent(container as Element, event);
  });

  await new Promise((resolve) =>
    setImmediate(() => {
      render(
        <div data-testid="wrapper" {...rootProps}>
          <Dropzone {...defaultProps} />
        </div>,
        { container }
      );
      resolve(container);
    })
  );

  expect(defaultProps.setIsDragActive).toHaveBeenCalledWith(true);
});

function createEventFoo(node: any) {
  const file = new File([JSON.stringify({ ping: true })], 'ping.json', {
    type: 'application/json',
  });
  const files = [file];
  const event = createEvent.dragEnter(node, {
    bubbles: true,
  });
  Object.assign(event, {
    dataTransfer: {
      files,
      items: files.map((file) => ({
        kind: 'file',
        type: file.type,
        getAsFile: () => file,
      })),
      types: ['Files'],
    },
  });
  return event;
}

it('rerenders with updated styles for drag active, accepted and rejected', () => {});

it('uploads multiple files on drop', () => {});

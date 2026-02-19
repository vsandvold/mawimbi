import { message as antdMessage } from 'antd';
import { vi } from 'vitest';
import message from '../message';

vi.spyOn(antdMessage, 'success');

it('renders message with given content and key', () => {
  const msg = message({ key: 'messageKey' });

  msg.success('it works!');

  expect(antdMessage.success).toHaveBeenCalledWith({
    content: 'it works!',
    key: 'messageKey',
  });
});

it('has fallback to default message key', () => {
  const msg = message();

  msg.success('it works!');

  expect(antdMessage.success).toHaveBeenCalledWith(
    expect.objectContaining({
      content: 'it works!',
    }),
  );
});

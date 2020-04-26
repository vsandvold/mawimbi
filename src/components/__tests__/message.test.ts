import message from '../message';
import { message as antdMessage } from 'antd';

jest.spyOn(antdMessage, 'success');

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
    })
  );
});

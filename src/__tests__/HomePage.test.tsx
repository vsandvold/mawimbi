import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import HomePage from '../HomePage';

// TODO: read up on react testing https://create-react-app.dev/docs/running-tests

const mockHistoryPush = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useHistory: () => ({
    push: mockHistoryPush
  })
}));

it('renders create new wave button', () => {
  const { getByText } = render(<HomePage />);
  const buttonElement = getByText(/Create new wave/i);
  expect(buttonElement).toBeInTheDocument();

  fireEvent.click(buttonElement);
  expect(mockHistoryPush).toHaveBeenCalledWith('/wave');
});

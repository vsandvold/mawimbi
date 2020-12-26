import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import { useHistory } from 'react-router-dom';
import HomePage from '../HomePage';

const mockHistoryPush = jest.fn();

jest.mock('react-router-dom', () => ({
  useHistory: () => ({
    push: mockHistoryPush,
  }),
}));

it('renders create project button', () => {
  const { getByText } = render(<HomePage />);

  const buttonElement = getByText('Create Project');
  expect(buttonElement).toBeInTheDocument();

  fireEvent.click(buttonElement);

  const history = useHistory();
  expect(history.push).toHaveBeenCalledWith('/project');
});

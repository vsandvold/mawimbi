import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import { useHistory } from 'react-router-dom';
import HomePage from '../HomePage';

it('renders create project button', () => {
  const { getByText } = render(<HomePage />);
  const buttonElement = getByText(/Create Project/i);
  expect(buttonElement).toBeInTheDocument();

  fireEvent.click(buttonElement);

  const history = useHistory();
  expect(history.push).toHaveBeenCalledWith('/project');
});

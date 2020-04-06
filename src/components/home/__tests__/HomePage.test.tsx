import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import { useHistory } from 'react-router-dom';
import HomePage from '../HomePage';

it('renders create new wave button', () => {
  const { getByText } = render(<HomePage />);
  const buttonElement = getByText(/Create new wave/i);
  expect(buttonElement).toBeInTheDocument();

  fireEvent.click(buttonElement);

  const history = useHistory();
  expect(history.push).toHaveBeenCalledWith('/wave');
});

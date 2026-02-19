import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import HomePage from '../HomePage';

it('renders create project button', () => {
  const { getByText } = render(<HomePage />);

  const buttonElement = getByText('Create Project');
  expect(buttonElement).toBeInTheDocument();

  fireEvent.click(buttonElement);

  const navigate = useNavigate();
  expect(navigate).toHaveBeenCalledWith('/project');
});

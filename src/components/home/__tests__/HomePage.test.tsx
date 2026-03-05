import { fireEvent, render } from '@testing-library/react';
import { useNavigate } from 'react-router-dom';
import HomePage from '../HomePage';

it('navigates to project page with UUID on create', () => {
  const { getByText } = render(<HomePage />);

  const buttonElement = getByText('Create Project');
  expect(buttonElement).toBeInTheDocument();

  fireEvent.click(buttonElement);

  const navigate = useNavigate();
  expect(navigate).toHaveBeenCalledWith(
    expect.stringMatching(
      /^\/project\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    ),
  );
});

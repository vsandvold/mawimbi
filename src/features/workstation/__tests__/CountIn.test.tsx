import { render } from '@testing-library/react';
import CountIn from '../CountIn';

it('renders the beat number', () => {
  const { getByText } = render(<CountIn beat={3} />);

  expect(getByText('3')).toBeInTheDocument();
});

it('renders the overlay container', () => {
  const { container } = render(<CountIn beat={1} />);

  expect(container.querySelector('.count-in')).toBeInTheDocument();
  expect(container.querySelector('.count-in__beat')).toBeInTheDocument();
});

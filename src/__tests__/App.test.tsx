import React from 'react';
import { render } from '@testing-library/react';
import App from '../App';

// TODO: read up on react testing https://create-react-app.dev/docs/running-tests

it('renders learn react link', () => {
  const { getByText } = render(<App />);
  const linkElement = getByText(/learn react/i);
  expect(linkElement).toBeInTheDocument();
});

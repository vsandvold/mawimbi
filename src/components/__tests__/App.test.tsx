import { render } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import App, { NoMatch } from '../App';

vi.mock('../home/HomePage', () => ({
  default: () => <div data-testid="home-page"></div>,
}));
vi.mock('../project/ProjectPage', () => ({
  default: () => <div data-testid="project-page"></div>,
}));

it('renders route to home page', () => {
  const { getByTestId } = render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>,
  );

  expect(getByTestId('home-page')).toBeInTheDocument();
});

it('renders route to project page', () => {
  const { getByTestId } = render(
    <MemoryRouter initialEntries={['/project']}>
      <App />
    </MemoryRouter>,
  );

  expect(getByTestId('project-page')).toBeInTheDocument();
});

it('renders unknown route', () => {
  const { container: appContainer } = render(
    <MemoryRouter initialEntries={['/unknown/route']}>
      <App />
    </MemoryRouter>,
  );

  const { container: componentContainer } = render(<NoMatch />);

  expect(appContainer).toEqual(componentContainer);
});

import { mount } from 'enzyme';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import AppRouter, { NoMatch } from '../AppRouter';
import HomePage from '../HomePage';

it('renders route to home page', () => {
  const wrapper = mount(
    <MemoryRouter initialEntries={['/']}>
      <AppRouter />
    </MemoryRouter>
  );

  expect(wrapper).toContainReact(<HomePage />);
});

it('renders route to app page', () => {
  const wrapper = mount(
    <MemoryRouter initialEntries={['/wave']}>
      <AppRouter />
    </MemoryRouter>
  );

  expect(wrapper).toContainReact(<App />);
});

it('renders unknown route', () => {
  const wrapper = mount(
    <MemoryRouter initialEntries={['/unknown/route']}>
      <AppRouter />
    </MemoryRouter>
  );

  expect(wrapper).toContainReact(<NoMatch />);
});

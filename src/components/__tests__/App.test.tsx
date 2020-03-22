import { mount } from 'enzyme';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import App, { NoMatch } from '../App';
import HomePage from '../HomePage';
import ProjectPage from '../ProjectPage';

it('renders route to home page', () => {
  const wrapper = mount(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>
  );

  expect(wrapper).toContainReact(<HomePage />);
});

it('renders route to app page', () => {
  const wrapper = mount(
    <MemoryRouter initialEntries={['/wave']}>
      <App />
    </MemoryRouter>
  );

  expect(wrapper).toContainReact(<ProjectPage />);
});

it('renders unknown route', () => {
  const wrapper = mount(
    <MemoryRouter initialEntries={['/unknown/route']}>
      <App />
    </MemoryRouter>
  );

  expect(wrapper).toContainReact(<NoMatch />);
});

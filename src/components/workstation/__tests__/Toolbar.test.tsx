import { CaretRightOutlined, PauseOutlined } from '@ant-design/icons';
import { fireEvent, render } from '@testing-library/react';
import { mount } from 'enzyme';
import React from 'react';
import Toolbar from '../Toolbar';
import { TOGGLE_DRAWER, TOGGLE_PLAYBACK } from '../workstationReducer';

const mockDispatch = jest.fn();

jest.mock('../useWorkstationDispatch', () => {
  return () => {
    return mockDispatch;
  };
});

const defaultProps = {
  isDrawerOpen: false,
  isEmpty: false,
  isPlaying: false,
};

it('renders all buttons', () => {
  const wrapper = mount(<Toolbar {...defaultProps} />);

  expect(wrapper.find('button')).toHaveLength(2);
});

it('disables buttons when tracks are empty', () => {
  const wrapper = mount(<Toolbar {...{ ...defaultProps, isEmpty: true }} />);

  expect(wrapper.find('button').every({ disabled: true })).toEqual(true);
});

it('enables buttons when tracks are not empty', () => {
  const wrapper = mount(<Toolbar {...{ ...defaultProps, isEmpty: false }} />);

  expect(wrapper.find('button').some({ disabled: true })).toEqual(false);
});

it('renders play icon when paused', () => {
  const wrapper = mount(<Toolbar {...{ ...defaultProps, isPlaying: false }} />);

  expect(wrapper.find('button[title="Play"]')).toHaveLength(1);
  expect(wrapper).toContainReact(<CaretRightOutlined />);
});

it('renders pause icon when playing', () => {
  const wrapper = mount(<Toolbar {...{ ...defaultProps, isPlaying: true }} />);

  expect(wrapper.find('button[title="Pause"]')).toHaveLength(1);
  expect(wrapper).toContainReact(<PauseOutlined />);
});

it('applies animation class to mixer icon when drawer is open', () => {
  const wrapper = mount(
    <Toolbar {...{ ...defaultProps, isDrawerOpen: true }} />
  );

  expect(wrapper.find('button[title="Hide mixer"]').childAt(0)).toHaveClassName(
    'show-mixer'
  );
});

it('toggles playback when play/pause button is clicked', () => {
  const wrapper = mount(<Toolbar {...{ ...defaultProps, isPlaying: true }} />);

  wrapper.find('button').filter({ title: 'Pause' }).simulate('click');

  expect(mockDispatch).toBeCalledTimes(1);
  expect(mockDispatch).toHaveBeenCalledWith([TOGGLE_PLAYBACK]);
});

it('toggles drawer when mixer show/hide is clicked', () => {
  const { getByTitle } = render(
    <Toolbar {...{ ...defaultProps, isDrawerOpen: false }} />
  );

  const mixerButton = getByTitle('Show mixer');
  expect(mixerButton).toBeInTheDocument();

  fireEvent.click(mixerButton);

  expect(mockDispatch).toBeCalledTimes(1);
  expect(mockDispatch).toHaveBeenCalledWith([TOGGLE_DRAWER]);
});

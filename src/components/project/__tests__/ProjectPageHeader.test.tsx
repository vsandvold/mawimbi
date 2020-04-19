import { fireEvent, render } from '@testing-library/react';
import { mount, shallow } from 'enzyme';
import React from 'react';
import { useHistory } from 'react-router-dom';
import ProjectPageHeader from '../ProjectPageHeader';

const mockUploadFile = jest.fn();

const defaultProps = {
  title: 'Mawimbi No. 5',
  uploadFile: mockUploadFile,
};

it('renders without crashing', () => {
  shallow(<ProjectPageHeader {...defaultProps} />);
});

it('renders project title', () => {
  const wrapper = mount(<ProjectPageHeader {...defaultProps} />);

  expect(wrapper.text()).toContain(defaultProps.title);
});

it('navigates back from project page', () => {
  const wrapper = mount(<ProjectPageHeader {...defaultProps} />);

  wrapper
    .find('div[role="button"]')
    .filter({ 'aria-label': 'Back' })
    .simulate('click');

  const history = useHistory();
  expect(history.goBack).toHaveBeenCalledTimes(1);
});

it('accepts multiple audio files for upload', () => {
  const wrapper = mount(<ProjectPageHeader {...defaultProps} />);

  expect(wrapper.find('input[type="file"]')).toHaveProp('accept', 'audio/*');
  expect(wrapper.find('input[type="file"]')).toHaveProp('multiple', true);
});

it('submits uploaded files', () => {
  const { getByText } = render(<ProjectPageHeader {...defaultProps} />);

  const uploadButton = getByText('Upload files');
  expect(uploadButton).toBeInTheDocument();

  fireEvent.click(uploadButton);

  expect(mockUploadFile).toHaveBeenCalledTimes(0);
});

import { UploadOutlined, EllipsisOutlined } from '@ant-design/icons';
import { Button, PageHeader, Upload, Dropdown, Menu } from 'antd';
import React from 'react';
import { useHistory } from 'react-router-dom';
import './ProjectPageHeader.css';

type ProjectPageHeaderProps = {
  title: string;
  uploadFile: (file: File) => void;
  isFullscreen: boolean;
  toggleFullscreen: (state?: boolean) => void;
};

const ProjectPageHeader = (props: ProjectPageHeaderProps) => {
  const history = useHistory();

  return (
    <PageHeader
      ghost={false}
      onBack={() => history.goBack()}
      title={props.title}
      extra={[
        <UploadButton key="upload-button" uploadFile={props.uploadFile} />,
        <OverflowMenu
          key="overflow-menu"
          isFullscreen={props.isFullscreen}
          toggleFullscreen={props.toggleFullscreen}
        />,
      ]}
    />
  );
};

type UploadButtonProps = {
  uploadFile: (file: File) => void;
};

const UploadButton = (props: UploadButtonProps) => {
  const { uploadFile } = props;

  const uploadProps = {
    accept: 'audio/*',
    multiple: true,
    showUploadList: false,
    beforeUpload: () => false,
    onChange(info: any) {
      if (info.file) {
        uploadFile(info.file);
      }
      // TODO: force fullscreen if already enabled
    },
  };

  return (
    <Upload {...uploadProps}>
      <Button type="link" className="button">
        <UploadOutlined />
        <span className="hidden-lt768">Upload files</span>
      </Button>
    </Upload>
  );
};

type OverflowMenuProps = {
  isFullscreen: boolean;
  toggleFullscreen: (state?: boolean) => void;
};

const OverflowMenu = (props: OverflowMenuProps) => {
  const { isFullscreen, toggleFullscreen } = props;

  const menu = (
    <Menu>
      <Menu.Item onClick={() => toggleFullscreen()}>
        {isFullscreen ? 'Exit Full Screen' : 'Enter Full Screen'}
      </Menu.Item>
    </Menu>
  );

  return (
    <Dropdown overlay={menu} trigger={['click']}>
      <Button type="link" className="button overflow-button">
        <EllipsisOutlined />
      </Button>
    </Dropdown>
  );
};

export default ProjectPageHeader;

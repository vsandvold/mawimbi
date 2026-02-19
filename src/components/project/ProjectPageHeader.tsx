import {
  ArrowLeftOutlined,
  EllipsisOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { Button, Dropdown, Typography, Upload } from 'antd';
import type { MenuProps } from 'antd';
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
    <div className="project-page-header">
      <Button
        type="link"
        className="button back-button"
        icon={<ArrowLeftOutlined />}
        aria-label="Back"
        onClick={() => history.goBack()}
      />
      <Typography.Title level={5} className="project-page-header__title">
        {props.title}
      </Typography.Title>
      <div className="project-page-header__extra">
        <UploadButton uploadFile={props.uploadFile} />
        <OverflowMenu
          isFullscreen={props.isFullscreen}
          toggleFullscreen={props.toggleFullscreen}
        />
      </div>
    </div>
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

  const items: MenuProps['items'] = [
    {
      key: 'fullscreen',
      label: isFullscreen ? 'Exit Full Screen' : 'Enter Full Screen',
      onClick: () => toggleFullscreen(),
    },
  ];

  return (
    <Dropdown menu={{ items }} trigger={['click']}>
      <Button type="link" className="button overflow-button">
        <EllipsisOutlined />
      </Button>
    </Dropdown>
  );
};

export default ProjectPageHeader;

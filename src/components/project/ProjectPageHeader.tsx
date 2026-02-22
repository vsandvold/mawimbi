import {
  ArrowLeftOutlined,
  EllipsisOutlined,
  RedoOutlined,
  UndoOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { Button, Dropdown, Typography, Upload } from 'antd';
import type { MenuProps, UploadProps } from 'antd';
import { useNavigate } from 'react-router-dom';
import './ProjectPageHeader.css';

type ProjectPageHeaderProps = {
  title: string;
  uploadFile: (file: File) => void;
  isFullscreen: boolean;
  toggleFullscreen: (state?: boolean) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

const ProjectPageHeader = (props: ProjectPageHeaderProps) => {
  const navigate = useNavigate();

  return (
    <div className="project-page-header">
      <Button
        type="link"
        className="button back-button"
        icon={<ArrowLeftOutlined />}
        aria-label="Back"
        onClick={() => navigate(-1)}
      />
      <Typography.Title level={5} className="project-page-header__title">
        {props.title}
      </Typography.Title>
      <div className="project-page-header__extra">
        <Button
          type="link"
          className="button"
          icon={<UndoOutlined />}
          aria-label="Undo"
          disabled={!props.canUndo}
          onClick={props.undo}
        />
        <Button
          type="link"
          className="button"
          icon={<RedoOutlined />}
          aria-label="Redo"
          disabled={!props.canRedo}
          onClick={props.redo}
        />
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

  const uploadProps: UploadProps = {
    accept: 'audio/*',
    multiple: true,
    showUploadList: false,
    beforeUpload: (file) => {
      uploadFile(file);
      return false;
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

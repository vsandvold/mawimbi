import {
  ArrowLeftOutlined,
  EllipsisOutlined,
  RedoOutlined,
  UndoOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { Button, Dropdown, Input, Modal, Typography, Upload } from 'antd';
import type { MenuProps, UploadProps } from 'antd';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
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
  renameProject: (title: string) => void;
};

const ProjectPageHeader = (props: ProjectPageHeaderProps) => {
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState(props.title);
  const [wasFullscreen, setWasFullscreen] = useState(false);

  const openRenameModal = () => {
    setNewTitle(props.title);
    if (props.isFullscreen) {
      props.toggleFullscreen(false);
      setWasFullscreen(true);
    }
    setIsRenameModalOpen(true);
  };

  const closeRenameModal = () => {
    setIsRenameModalOpen(false);
    if (wasFullscreen) {
      props.toggleFullscreen(true);
      setWasFullscreen(false);
    }
  };

  const handleRename = () => {
    const trimmed = newTitle.trim();
    if (trimmed) {
      props.renameProject(trimmed);
    }
    closeRenameModal();
  };

  const handleCancel = () => {
    closeRenameModal();
  };

  return (
    <div className="project-page-header">
      <Link to="/" className="back-link" aria-label="Back">
        <Button
          type="link"
          className="button back-button"
          icon={<ArrowLeftOutlined />}
          tabIndex={-1}
        />
      </Link>
      <Typography.Title
        level={4}
        className="project-page-header__title"
        onClick={openRenameModal}
      >
        {props.title}
      </Typography.Title>
      <Modal
        title="Rename project"
        open={isRenameModalOpen}
        onOk={handleRename}
        onCancel={handleCancel}
        okText="Update"
      >
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onPressEnter={handleRename}
          autoFocus
        />
      </Modal>
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
  const containerRef = useRef<HTMLDivElement>(null);

  const items: MenuProps['items'] = [
    {
      key: 'fullscreen',
      label: isFullscreen ? 'Exit Full Screen' : 'Enter Full Screen',
      onClick: () => toggleFullscreen(),
    },
  ];

  return (
    <div ref={containerRef}>
      <Dropdown
        menu={{ items }}
        trigger={['click']}
        getPopupContainer={() => containerRef.current!}
      >
        <Button
          type="link"
          className="button overflow-button"
          icon={<EllipsisOutlined />}
          aria-label="More"
          onClick={(e) => e.stopPropagation()}
        />
      </Dropdown>
    </div>
  );
};

export default ProjectPageHeader;

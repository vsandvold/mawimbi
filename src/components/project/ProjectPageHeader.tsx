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
  const containerRef = useRef<HTMLDivElement>(null);

  const openRenameModal = () => {
    setNewTitle(props.title);
    setIsRenameModalOpen(true);
  };

  const handleRename = () => {
    const trimmed = newTitle.trim();
    if (trimmed) {
      props.renameProject(trimmed);
    }
    setIsRenameModalOpen(false);
  };

  const handleCancel = () => {
    setIsRenameModalOpen(false);
  };

  return (
    <div className="project-page-header" ref={containerRef}>
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
        getContainer={() => containerRef.current!}
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
          getPopupContainer={() => containerRef.current!}
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
  getPopupContainer: () => HTMLElement;
};

const OverflowMenu = (props: OverflowMenuProps) => {
  const { isFullscreen, toggleFullscreen, getPopupContainer } = props;

  const items: MenuProps['items'] = [
    {
      key: 'fullscreen',
      label: isFullscreen ? 'Exit Full Screen' : 'Enter Full Screen',
      onClick: () => toggleFullscreen(),
    },
  ];

  return (
    <Dropdown
      menu={{ items }}
      trigger={['click']}
      getPopupContainer={getPopupContainer}
    >
      <Button
        type="link"
        className="button overflow-button"
        icon={<EllipsisOutlined />}
        aria-label="More"
        onClick={(e) => e.stopPropagation()}
      />
    </Dropdown>
  );
};

export default ProjectPageHeader;

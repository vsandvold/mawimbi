import { UploadOutlined } from '@ant-design/icons';
import { Button, PageHeader, Upload } from 'antd';
import React from 'react';
import { useHistory } from 'react-router-dom';

type ProjectPageHeaderProps = {
  title: string;
  uploadFile: (file: File) => void;
};

const ProjectPageHeader = ({ title, uploadFile }: ProjectPageHeaderProps) => {
  console.log('ProjectPageHeader render');

  const history = useHistory();

  const uploadProps = {
    accept: 'audio/*',
    multiple: true,
    showUploadList: false,
    beforeUpload: () => false,
    onChange(info: any) {
      if (info.file) {
        uploadFile(info.file);
      }
    },
  };

  return (
    <PageHeader
      ghost={false}
      onBack={() => history.goBack()}
      title={title}
      extra={[
        <Upload key="upload-button" {...uploadProps}>
          <Button type="link" className="button">
            <UploadOutlined />
            <span className="hidden-lt768">Upload files</span>
          </Button>
        </Upload>,
      ]}
    />
  );
};

export default ProjectPageHeader;

import { UploadOutlined } from '@ant-design/icons';
import { Button, PageHeader } from 'antd';
import React from 'react';
import { useHistory } from 'react-router-dom';

type ProjectPageHeaderProps = {
  title: string;
  uploadFile: (file: File) => void;
};

const ProjectPageHeader = ({ title, uploadFile }: ProjectPageHeaderProps) => {
  console.log('ProjectPageHeader render');

  const history = useHistory();

  const handleFileUpload = () => {
    alert('Not implemented.');
  };

  return (
    <PageHeader
      ghost={false}
      onBack={() => history.goBack()}
      title={title}
      extra={[
        <Button
          key="upload-button"
          type="link"
          ghost
          icon={<UploadOutlined />}
          title="Upload audio file"
          onClick={handleFileUpload}
        />,
      ]}
    />
  );
};

export default ProjectPageHeader;

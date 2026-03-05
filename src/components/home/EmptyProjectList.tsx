import { Button, Typography } from 'antd';

const { Title, Text } = Typography;

type EmptyProjectListProps = {
  onCreate: () => void;
};

const EmptyProjectList = ({ onCreate }: EmptyProjectListProps) => {
  return (
    <>
      <Title>Mawimbi</Title>
      <Text type="secondary">No projects yet. Create one to get started.</Text>
      <Button type="primary" size="large" onClick={onCreate}>
        Create Project
      </Button>
    </>
  );
};

export default EmptyProjectList;

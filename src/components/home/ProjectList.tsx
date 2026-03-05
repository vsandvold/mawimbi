import { Button, List, Popconfirm, Typography } from 'antd';
import { type StoredProject } from '../../services/ProjectStorageService';
import { formatRelativeTime } from './formatRelativeTime';

const { Text } = Typography;

type ProjectListProps = {
  projects: StoredProject[];
  onOpen: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
};

const ProjectList = ({
  projects,
  onOpen,
  onCreate,
  onDelete,
}: ProjectListProps) => {
  return (
    <div className="home__project-list">
      <List
        header={
          <>
            <Text strong>Projects</Text>
            <Button type="primary" onClick={onCreate}>
              New Project
            </Button>
          </>
        }
        dataSource={projects}
        renderItem={(project) => (
          <List.Item
            className="home__project-item"
            onClick={() => onOpen(project.id)}
            actions={[
              <Popconfirm
                key="delete"
                title="Delete project?"
                description="This will permanently remove the project and all its audio data."
                onConfirm={(e) => {
                  e?.stopPropagation();
                  onDelete(project.id);
                }}
                onCancel={(e) => e?.stopPropagation()}
                okText="Delete"
                cancelText="Cancel"
                okButtonProps={{ danger: true }}
              >
                <Button
                  type="text"
                  danger
                  size="small"
                  onClick={(e) => e.stopPropagation()}
                >
                  Delete
                </Button>
              </Popconfirm>,
            ]}
          >
            <List.Item.Meta
              title={project.title}
              description={
                <div className="home__project-info">
                  <Text type="secondary">
                    {project.tracks.length}{' '}
                    {project.tracks.length === 1 ? 'track' : 'tracks'}
                  </Text>
                  <Text type="secondary">
                    {formatRelativeTime(project.updatedAt)}
                  </Text>
                </div>
              }
            />
          </List.Item>
        )}
      />
    </div>
  );
};

export default ProjectList;

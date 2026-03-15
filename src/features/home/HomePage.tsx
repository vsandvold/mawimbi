import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import {
  deleteProject,
  getStorageEstimate,
  listProjects,
  type StoredProject,
} from '../project/ProjectStorageService';
import { Button } from '../../shared/ui/button';
import { PageContent, PageLayout } from '../../shared/layout/PageLayout';
import EmptyProjectList from './EmptyProjectList';
import ProjectList from './ProjectList';
import StorageUsage from './StorageUsage';
import SettingsButton from './SettingsButton';
import './HomePage.css';

export type StorageInfo = {
  usage: number | undefined;
  quota: number | undefined;
};

const HomePage = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<StoredProject[]>([]);
  const [storage, setStorage] = useState<StorageInfo>({
    usage: undefined,
    quota: undefined,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [projectList, estimate] = await Promise.all([
        listProjects(),
        getStorageEstimate(),
      ]);
      setProjects(projectList);
      setStorage({ usage: estimate.usage, quota: estimate.quota });
    } catch (error) {
      console.error('Failed to load projects', error);
    } finally {
      setIsLoading(false);
    }
  }

  function handleCreate() {
    const id = crypto.randomUUID();
    navigate(`/project/${id}`);
  }

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      const estimate = await getStorageEstimate();
      setStorage({ usage: estimate.usage, quota: estimate.quota });
    },
    [setProjects],
  );

  function handleOpen(id: string) {
    navigate(`/project/${id}`);
  }

  if (isLoading) {
    return (
      <PageLayout>
        <PageContent>
          <div className="home" />
        </PageContent>
      </PageLayout>
    );
  }

  const hasProjects = projects.length > 0;

  return (
    <PageLayout>
      <PageContent>
        <div className="home">
          <div className="home__header">
            <div className="home__header-row">
              <h1 className="home__title">Mawimbi</h1>
              <div className="home__header-actions">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleCreate}
                  aria-label="New project"
                >
                  <Plus size={20} />
                </Button>
                <SettingsButton />
              </div>
            </div>
          </div>
          <div className="home__body">
            <div className="home__list-container">
              {hasProjects ? (
                <ProjectList
                  projects={projects}
                  onOpen={handleOpen}
                  onDelete={handleDelete}
                />
              ) : (
                <EmptyProjectList onCreate={handleCreate} />
              )}
              {hasProjects && (
                <StorageUsage usage={storage.usage} quota={storage.quota} />
              )}
            </div>
          </div>
        </div>
      </PageContent>
    </PageLayout>
  );
};

export default HomePage;

import { Button } from '../ui/button';

type EmptyProjectListProps = {
  onCreate: () => void;
};

const EmptyProjectList = ({ onCreate }: EmptyProjectListProps) => {
  return (
    <div className="home__empty">
      <span className="text-muted-foreground">
        No projects yet. Create one to get started.
      </span>
      <Button size="lg" onClick={onCreate}>
        Create Project
      </Button>
    </div>
  );
};

export default EmptyProjectList;

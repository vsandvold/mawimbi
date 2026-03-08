import { Button } from '../ui/button';

type EmptyProjectListProps = {
  onCreate: () => void;
};

const EmptyProjectList = ({ onCreate }: EmptyProjectListProps) => {
  return (
    <>
      <h1 className="text-4xl font-semibold tracking-tight">Mawimbi</h1>
      <span className="text-muted-foreground">
        No projects yet. Create one to get started.
      </span>
      <Button size="lg" onClick={onCreate}>
        Create Project
      </Button>
    </>
  );
};

export default EmptyProjectList;

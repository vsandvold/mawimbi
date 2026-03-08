import { Progress } from '../ui/progress';
import { formatBytes } from './formatBytes';

type StorageUsageProps = {
  usage: number | undefined;
  quota: number | undefined;
};

const StorageUsage = ({ usage, quota }: StorageUsageProps) => {
  if (usage === undefined || quota === undefined) return null;

  const percent = quota > 0 ? (usage / quota) * 100 : 0;

  return (
    <div className="home__storage">
      <span className="text-muted-foreground">
        Using {formatBytes(usage)} of {formatBytes(quota)}
      </span>
      <Progress value={Number(percent.toFixed(1))} className="h-1.5" />
    </div>
  );
};

export default StorageUsage;

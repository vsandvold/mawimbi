import { Progress } from 'antd';
import { formatBytes } from './formatBytes';

type StorageUsageProps = {
  usage: number | undefined;
  quota: number | undefined;
};

const StorageUsage = ({ usage, quota }: StorageUsageProps) => {
  if (usage === undefined || quota === undefined) return null;

  const percent = quota > 0 ? (usage / quota) * 100 : 0;

  return (
    <div className="home__project-list">
      <span className="text-muted-foreground">
        Using {formatBytes(usage)} of {formatBytes(quota)}
      </span>
      <Progress
        percent={Number(percent.toFixed(1))}
        size="small"
        showInfo={false}
      />
    </div>
  );
};

export default StorageUsage;

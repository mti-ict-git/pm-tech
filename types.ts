export interface Task {
  id: string;
  title: string;
  assetId: string;
  location: string;
  status: 'OVERDUE' | 'IN_PROGRESS' | 'SCHEDULED' | 'DONE';
  priority?: 'HIGH' | 'NORMAL' | 'LOW';
  date?: string;
  timeRange?: string;
  progress: number;
  totalSteps: number;
}

export interface Asset {
  id: string;
  tag: string;
  name: string;
  location: string;
  status: 'OPERATIONAL' | 'IN_REPAIR' | 'DOWN';
  image: string;
}

export interface WorkOrder {
  id: string;
  title: string;
  asset: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'OPEN' | 'IN_PROGRESS' | 'CLOSED';
  createdDate: string;
}

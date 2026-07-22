export type OrderRow = {
  ref: string;
  consignmentId: string;
  recipient: string;
  packages: number;
};

export type SavedOrder = {
  id: string;
  createdAt: string;
  references: string;
  shipments: number;
  packages: number;
  fileName: string;
  sequence?: number;
  rows?: OrderRow[];
  createdBy?: string;
  archivedAt?: string | null;
  archivedBy?: string | null;
};

export type StoredOrder = {
  meta: SavedOrder;
  blob: Blob;
  synced?: boolean;
  syncedAt?: string;
};

export type SyncProgress = {
  pending: number;
  completed: number;
  failed: number;
};

export type ArchiveMetrics = {
  total: number;
  today: number;
  todayShipments: number;
  todayPackages: number;
  monthShipments: number;
  monthPackages: number;
};

export type ArchivePage = {
  orders: SavedOrder[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  metrics: ArchiveMetrics;
};

import type { WorkflowUpdateSeverity } from './types';

export const toUpdateSeverity = (value?: string | null): WorkflowUpdateSeverity | undefined => (
  value === 'fix' || value === 'hotfix' || value === 'feature' ? value : undefined
);

export const isRepairUpdate = (severity?: WorkflowUpdateSeverity | null) => (
  severity === 'fix' || severity === 'hotfix'
);

export const getUpdateLabel = (severity?: WorkflowUpdateSeverity | null) => {
  if (severity === 'hotfix') return '重要修復';
  if (severity === 'fix') return '修正版';
  return '新版';
};

export const getUpdateMessage = (severity?: WorkflowUpdateSeverity | null) => {
  if (severity === 'hotfix') return '這個節點有重要修復，建議盡快更新。';
  if (severity === 'fix') return '這個節點已有修正版，建議手動更新。';
  return '這個節點已有新版，可手動更新。';
};

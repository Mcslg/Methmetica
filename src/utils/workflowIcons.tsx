import type { CSSProperties, ReactNode } from 'react';
import type { WorkflowIcon } from '../community/types';
import { Icons } from '../components/Icons';

type IconRenderer = (props?: { size?: number; style?: CSSProperties }) => ReactNode;

export type WorkflowIconOption = {
  value: string;
  label: string;
  render: IconRenderer;
};

export const DEFAULT_WORKFLOW_ICON: WorkflowIcon = {
  type: 'lucide',
  value: 'Workflow',
  accent: '#4ade80',
};

export const WORKFLOW_ICON_OPTIONS: WorkflowIconOption[] = [
  { value: 'Workflow', label: 'Workflow', render: Icons.Workflow },
  { value: 'Blocks', label: 'Blocks', render: Icons.Blocks },
  { value: 'Calculator', label: 'Calculator', render: Icons.Calculator },
  { value: 'Calculate', label: 'Calculate', render: Icons.Calculate },
  { value: 'Number', label: 'Number', render: Icons.Number },
  { value: 'Decimal', label: 'Decimal', render: Icons.Decimal },
  { value: 'Result', label: 'Result', render: Icons.Result },
  { value: 'Calculus', label: 'Calculus', render: Icons.Calculus },
  { value: 'Code', label: 'Code', render: Icons.Code },
  { value: 'Graph', label: 'Graph', render: Icons.Graph },
  { value: 'Solve', label: 'Solve', render: Icons.Solve },
  { value: 'Balance', label: 'Balance', render: Icons.Balance },
  { value: 'Range', label: 'Range', render: Icons.Range },
  { value: 'Slider', label: 'Slider', render: Icons.Slider },
  { value: 'Gate', label: 'Gate', render: Icons.Gate },
  { value: 'Trigger', label: 'Trigger', render: Icons.Trigger },
  { value: 'ForEach', label: 'For Each', render: Icons.ForEach },
  { value: 'Sparkles', label: 'Sparkles', render: Icons.Sparkles },
  { value: 'Text', label: 'Text', render: Icons.Text },
  { value: 'Image', label: 'Image', render: Icons.Image },
  { value: 'Search', label: 'Search', render: Icons.Search },
  { value: 'Languages', label: 'Languages', render: Icons.Languages },
  { value: 'Sound', label: 'Sound', render: Icons.Sound },
  { value: 'Package', label: 'Package', render: Icons.Package },
  { value: 'Grid', label: 'Grid', render: Icons.Grid },
  { value: 'Append', label: 'Append', render: Icons.Append },
  { value: 'Save', label: 'Save', render: Icons.Save },
  { value: 'Load', label: 'Load', render: Icons.Load },
  { value: 'Check', label: 'Check', render: Icons.Check },
  { value: 'Eye', label: 'Eye', render: Icons.Eye },
  { value: 'Heart', label: 'Heart', render: Icons.Heart },
  { value: 'Bookmark', label: 'Bookmark', render: Icons.Bookmark },
  { value: 'Star', label: 'Star', render: Icons.Star },
  { value: 'Fork', label: 'Fork', render: Icons.Fork },
  { value: 'Comment', label: 'Comment', render: Icons.Comment },
];

export const normalizeWorkflowIcon = (icon?: WorkflowIcon): WorkflowIcon => {
  const matchingOption = WORKFLOW_ICON_OPTIONS.find(option => option.value === icon?.value);
  return {
    type: 'lucide',
    value: matchingOption?.value ?? DEFAULT_WORKFLOW_ICON.value,
    accent: icon?.accent || DEFAULT_WORKFLOW_ICON.accent,
  };
};

export const renderWorkflowIconVisual = (icon?: WorkflowIcon, size = 20, fallback?: ReactNode) => {
  const normalizedIcon = normalizeWorkflowIcon(icon);
  const option = WORKFLOW_ICON_OPTIONS.find(item => item.value === normalizedIcon.value);
  return option?.render({ size, style: { marginRight: 0 } }) ?? fallback ?? <Icons.Workflow size={size} style={{ marginRight: 0 }} />;
};

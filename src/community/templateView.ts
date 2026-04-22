import type {
  CommunityNodeTemplate,
  TemplateBuilderBlock,
  TemplateElementProp,
  TemplateViewOverrides,
} from './types';

export const resolveTemplateViewOverrides = (
  template: CommunityNodeTemplate,
  projectInputs?: Record<string, string>,
): TemplateViewOverrides => {
  const overrides: TemplateViewOverrides = {};

  (template.elementBindings || []).forEach((binding) => {
    if (binding.source !== 'project-input') return;
    const value = projectInputs?.[binding.portId];
    if (value === undefined) return;

    overrides[binding.blockId] = {
      ...(overrides[binding.blockId] || {}),
      [binding.prop]: coerceElementPropValue(binding.prop, value),
    };
  });

  return overrides;
};

export const applyBlockViewOverrides = (
  block: TemplateBuilderBlock,
  overrides?: TemplateViewOverrides,
): TemplateBuilderBlock => {
  const blockOverrides = overrides?.[block.id];
  if (!blockOverrides) return block;

  return {
    ...block,
    ...(blockOverrides.content !== undefined ? {
      content: String(blockOverrides.content),
      contentI18n: undefined,
    } : {}),
  };
};

const coerceElementPropValue = (prop: TemplateElementProp, value: string): unknown => {
  if (prop === 'visible' || prop === 'open') {
    const normalized = value.trim().toLowerCase();
    return !['', '0', 'false', 'no', 'off'].includes(normalized);
  }

  return value;
};

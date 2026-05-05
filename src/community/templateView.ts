import type {
  CommunityNodeTemplate,
  TemplateElementBinding,
  TemplateBuilderBlock,
  TemplateElementProp,
  TemplateViewOverrides,
} from './types';

export const resolveTemplateViewOverridesFromBindings = (
  elementBindings: TemplateElementBinding[] | undefined,
  valuesByPort?: Record<string, string>,
): TemplateViewOverrides => {
  const overrides: TemplateViewOverrides = {};

  (elementBindings || []).forEach((binding) => {
    const value = valuesByPort?.[binding.portId];
    if (value === undefined) return;

    overrides[binding.blockId] = {
      ...(overrides[binding.blockId] || {}),
      [binding.prop]: coerceElementPropValue(binding.prop, value),
    };
  });

  return overrides;
};

export const resolveTemplateViewOverrides = (
  template: CommunityNodeTemplate,
  projectInputs?: Record<string, string>,
): TemplateViewOverrides => resolveTemplateViewOverridesFromBindings(template.elementBindings, projectInputs);

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

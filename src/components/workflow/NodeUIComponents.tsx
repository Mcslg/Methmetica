import React from 'react';
import { MathInput } from '../MathInput';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import type { WorkflowUIComponentSpec } from '../../types/workflowSpec';

interface UIComponentProps {
  spec: WorkflowUIComponentSpec;
  values: Record<string, unknown>;
  onValueChange: (bindKey: string, nextValue: unknown) => void;
}

export const SliderComponent: React.FC<{
  spec: Extract<WorkflowUIComponentSpec, { type: 'slider' }>;
  currentValue: number;
  onChange: (val: number) => void;
}> = ({ spec, currentValue, onChange }) => {
  const min = spec.min ?? 0;
  const max = spec.max ?? 100;
  const step = spec.step ?? 1;
  const val = typeof currentValue === 'number' ? currentValue : (spec.defaultValue ?? min);

  return (
    <div className="nodrag" style={{ marginBottom: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-sub, #94a3b8)', marginBottom: '3px' }}>
        <span>{spec.label || spec.bindInput}</span>
        <span style={{ color: 'var(--accent, #38bdf8)', fontWeight: 600, fontFamily: 'monospace' }}>{val}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={val}
        onChange={(e) => {
          e.stopPropagation();
          onChange(parseFloat(e.target.value));
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        className="nodrag"
        style={{
          width: '100%',
          accentColor: 'var(--accent, #38bdf8)',
          cursor: 'pointer',
          margin: 0,
          padding: 0,
        }}
      />
    </div>
  );
};

export const LatexInputComponent: React.FC<{
  spec: Extract<WorkflowUIComponentSpec, { type: 'latexInput' }>;
  currentValue: string;
  onChange: (val: string) => void;
}> = ({ spec, currentValue, onChange }) => {
  const val = currentValue !== undefined ? String(currentValue) : (spec.defaultValue ?? '');

  return (
    <div className="nodrag" style={{ marginBottom: '8px' }}>
      {spec.label && (
        <div style={{ fontSize: '11px', color: 'var(--text-sub, #94a3b8)', marginBottom: '3px' }}>
          {spec.label}
        </div>
      )}
      <div
        className="nodrag"
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-input, rgba(0, 0, 0, 0.25))',
          border: '1px solid var(--border-input, rgba(255, 255, 255, 0.15))',
          borderRadius: '6px',
          padding: '4px 8px',
        }}
      >
        <MathInput
          value={val}
          onChange={onChange}
          style={{
            fontSize: '14px',
            color: 'var(--text-main, #f8fafc)',
            background: 'transparent',
            border: 'none',
          }}
        />
      </div>
    </div>
  );
};

export const SvgPictureComponent: React.FC<{
  spec: Extract<WorkflowUIComponentSpec, { type: 'svgPicture' }>;
  svgContent?: string;
}> = ({ spec, svgContent }) => {
  const width = spec.width || 200;
  const height = spec.height || 120;

  if (!svgContent) {
    return (
      <div
        style={{
          width: '100%',
          height: `${height}px`,
          background: 'rgba(0, 0, 0, 0.2)',
          border: '1px dashed rgba(255, 255, 255, 0.1)',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '11px',
          color: '#64748b',
          marginBottom: '8px',
        }}
      >
        {spec.label || 'SVG 視圖等待輸入...'}
      </div>
    );
  }

  // 若 svgContent 包含完整 <svg> 標籤，以 dangerouslySetInnerHTML 呈現
  return (
    <div
      style={{
        width: '100%',
        maxWidth: `${width}px`,
        height: `${height}px`,
        background: 'rgba(0, 0, 0, 0.3)',
        borderRadius: '6px',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '8px',
      }}
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  );
};

export const TextComponent: React.FC<{
  spec: Extract<WorkflowUIComponentSpec, { type: 'text' }>;
}> = ({ spec }) => {
  return (
    <div
      style={{
        fontSize: '11px',
        color: '#cbd5e1',
        lineHeight: 1.4,
        marginBottom: '8px',
        background: 'rgba(255, 255, 255, 0.03)',
        padding: '6px 8px',
        borderRadius: '4px',
      }}
    >
      {spec.isMarkdown ? (
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
          {spec.content}
        </ReactMarkdown>
      ) : (
        <span>{spec.content}</span>
      )}
    </div>
  );
};

export const WorkflowUIComponentRenderer: React.FC<UIComponentProps> = ({
  spec,
  values,
  onValueChange,
}) => {
  switch (spec.type) {
    case 'slider':
      return (
        <SliderComponent
          spec={spec}
          currentValue={typeof values[spec.bindInput] === 'number' ? (values[spec.bindInput] as number) : Number(values[spec.bindInput]) || 0}
          onChange={(val) => onValueChange(spec.bindInput, val)}
        />
      );
    case 'latexInput':
      return (
        <LatexInputComponent
          spec={spec}
          currentValue={typeof values[spec.bindInput] === 'string' ? (values[spec.bindInput] as string) : String(values[spec.bindInput] ?? '')}
          onChange={(val) => onValueChange(spec.bindInput, val)}
        />
      );
    case 'svgPicture':
      return (
        <SvgPictureComponent
          spec={spec}
          svgContent={typeof values[spec.bindOutput] === 'string' ? (values[spec.bindOutput] as string) : undefined}
        />
      );
    case 'text':
      return <TextComponent spec={spec} />;
    default:
      return null;
  }
};

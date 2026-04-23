import { useLayoutEffect, useRef } from 'react';
import type { AppNode } from '../store/useStore';

const copyLiveFormState = (source: Element, clone: Element) => {
  const sourceFields = source.querySelectorAll('input, textarea, select');
  const cloneFields = clone.querySelectorAll('input, textarea, select');

  sourceFields.forEach((field, index) => {
    const cloneField = cloneFields[index];
    if (!cloneField) return;

    if (field instanceof HTMLInputElement && cloneField instanceof HTMLInputElement) {
      cloneField.value = field.value;
      cloneField.setAttribute('value', field.value);
      if (field.checked) {
        cloneField.setAttribute('checked', 'checked');
      } else {
        cloneField.removeAttribute('checked');
      }
      return;
    }

    if (field instanceof HTMLTextAreaElement && cloneField instanceof HTMLTextAreaElement) {
      cloneField.value = field.value;
      cloneField.textContent = field.value;
      return;
    }

    if (field instanceof HTMLSelectElement && cloneField instanceof HTMLSelectElement) {
      cloneField.value = field.value;
      Array.from(cloneField.options).forEach((option) => {
        option.selected = option.value === field.value;
      });
    }
  });
};

interface LiveNodePreviewProps {
  node: AppNode;
  className?: string;
  maxWidth?: number;
  maxHeight?: number;
  minHeight?: number;
  fallbackLabel?: string;
}

export function LiveNodePreview({
  node,
  className = '',
  maxWidth = 156,
  maxHeight = 92,
  minHeight = 68,
  fallbackLabel,
}: LiveNodePreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const width = Math.max(120, Math.round(node.measured?.width ?? node.width ?? 220));
  const height = Math.max(70, Math.round(node.measured?.height ?? node.height ?? 120));
  const scale = Math.min(1, maxWidth / width, maxHeight / height);

  useLayoutEffect(() => {
    const target = previewRef.current;
    if (!target) return;

    target.replaceChildren();

    const nodeWrapper = Array.from(document.querySelectorAll<HTMLElement>('.react-flow__node[data-id]'))
      .find((el) => el.getAttribute('data-id') === node.id);
    const liveNode = nodeWrapper?.firstElementChild as HTMLElement | null;

    if (!liveNode) {
      const fallback = document.createElement('div');
      fallback.className = 'live-node-preview-fallback';
      fallback.textContent = fallbackLabel || String(node.data?.label || node.type || 'Node');
      target.appendChild(fallback);
      return;
    }

    const clone = liveNode.cloneNode(true) as HTMLElement;
    copyLiveFormState(liveNode, clone);
    clone.classList.add('live-node-preview-clone');
    clone.querySelectorAll('.react-flow__resize-control, .edge-hitbox').forEach((el) => el.remove());
    clone.querySelectorAll<HTMLElement>('[contenteditable="true"]').forEach((el) => {
      el.setAttribute('contenteditable', 'false');
    });
    clone.querySelectorAll<HTMLElement>('input, textarea, select, button').forEach((el) => {
      el.setAttribute('tabindex', '-1');
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || el instanceof HTMLButtonElement) {
        el.disabled = true;
      }
    });
    clone.style.width = `${width}px`;
    clone.style.height = `${height}px`;
    clone.style.minWidth = '0';
    clone.style.transform = `scale(${scale})`;
    clone.style.transformOrigin = 'top left';
    clone.style.pointerEvents = 'none';
    clone.style.transition = 'none';

    target.appendChild(clone);
  }, [fallbackLabel, height, node, scale, width]);

  return (
    <div className={`live-node-preview ${className}`} style={{ height: Math.ceil(height * scale), minHeight }}>
      <div
        ref={previewRef}
        className="live-node-preview-inner"
        style={{ width: Math.ceil(width * scale), height: Math.ceil(height * scale) }}
      />
    </div>
  );
}

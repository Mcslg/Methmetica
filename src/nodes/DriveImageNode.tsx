import { memo, useEffect, useState } from 'react';
import { type NodeProps, type Node } from '@xyflow/react';
import useStore, { type AppState, type NodeData } from '../store/useStore';
import { NodeFrame } from '../components/NodeFrame';
import { Icons } from '../components/Icons';
import * as driveService from '../utils/googleDriveService';
import type { MathValue } from '../types/mathTypes';

const buildImageValue = (data: NodeData): MathValue | null => {
  if (!data.driveFileId) return null;

  return {
    type: 'image',
    value: {
      source: 'google-drive',
      fileId: data.driveFileId,
      name: data.driveFileName || 'Google Drive image',
      mimeType: data.driveMimeType || 'image/*',
      webViewUrl: data.driveWebViewUrl,
      thumbnailUrl: data.driveThumbnailUrl,
    },
    display: data.driveFileName || data.driveFileId,
    meta: {
      source: 'google-drive',
      name: data.driveFileName,
    },
  };
};

const buildOutputPatch = (data: NodeData): Pick<NodeData, 'value' | 'outputs' | 'typedOutputs'> => {
  const imageValue = buildImageValue(data);

  if (!imageValue) {
    return {
      value: '',
      outputs: { 'h-image': '' },
      typedOutputs: {},
    };
  }

  return {
    value: imageValue.display,
    outputs: {
      'h-image': JSON.stringify(imageValue.value),
    },
    typedOutputs: {
      'h-image': imageValue,
    },
  };
};

export const executeDriveImageNode = (node: Node<NodeData>, state: AppState) => {
  state.updateNodeData(node.id, buildOutputPatch(node.data), { skipGraphEval: true });
  state.evaluateGraph();
};

export const DriveImageNode = memo(function DriveImageNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
  const updateNodeData = useStore((state: AppState) => state.updateNodeData);
  const user = useStore((state: AppState) => state.user);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const normalizedHandles = (data.handles || [])
      .filter(handle => handle.id !== 'h-file-id')
      .map(handle => handle.id === 'h-image'
        ? { ...handle, type: 'output' as const, label: handle.label || 'image', declaredType: 'image' }
        : handle
      );
    const handlesChanged = JSON.stringify(normalizedHandles) !== JSON.stringify(data.handles || []);

    updateNodeData(id, {
      ...(handlesChanged ? { handles: normalizedHandles } : {}),
      ...buildOutputPatch(data),
    }, { skipGraphEval: true });
  }, [
    id,
    updateNodeData,
    data.handles,
    data.driveFileId,
    data.driveFileName,
    data.driveMimeType,
    data.driveWebViewUrl,
    data.driveThumbnailUrl,
  ]);

  useEffect(() => {
    let isCancelled = false;
    let objectUrl: string | null = null;

    async function loadPreview() {
      if (!data.driveFileId) {
        setPreviewUrl(null);
        setStatus(null);
        return;
      }

      setIsLoading(true);
      setStatus(null);
      try {
        const result = await driveService.loadDriveImageObjectUrl(data.driveFileId, { silent: true });
        objectUrl = result.url;
        if (!isCancelled) {
          setPreviewUrl(result.url);
          setStatus(null);
        }
      } catch (err) {
        if (!isCancelled) {
          setPreviewUrl(null);
          setStatus(err instanceof Error ? err.message : 'Unable to preview this Drive image.');
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    loadPreview();

    return () => {
      isCancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [data.driveFileId]);

  const chooseImage = async () => {
    if (!user) {
      setStatus('Sign in before choosing a Google Drive image.');
      return;
    }

    setIsLoading(true);
    setStatus(null);
    try {
      await driveService.ensureDriveReady(user?.email);
      const picked = await driveService.pickDriveImage();
      if (!picked) return;

      const nextData: NodeData = {
        driveFileId: picked.id,
        driveFileName: picked.name,
        driveMimeType: picked.mimeType,
        driveWebViewUrl: picked.webViewUrl,
        driveThumbnailUrl: picked.thumbnailUrl,
      };

      updateNodeData(id, {
        ...nextData,
        ...buildOutputPatch(nextData),
      });
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to choose a Google Drive image.');
    } finally {
      setIsLoading(false);
    }
  };

  const clearImage = () => {
    updateNodeData(id, {
      driveFileId: undefined,
      driveFileName: undefined,
      driveMimeType: undefined,
      driveWebViewUrl: undefined,
      driveThumbnailUrl: undefined,
      ...buildOutputPatch({}),
    });
    setPreviewUrl(null);
    setStatus(null);
  };

  return (
    <NodeFrame
      id={id}
      data={data}
      selected={selected}
      icon={<Icons.Image />}
      defaultLabel="Drive Image"
      className="drive-image-node"
      minWidth={240}
      minHeight={210}
      contentStyle={{ padding: '10px', gap: '8px', alignItems: 'stretch' }}
      customHandleDescriptions={{
        'h-image': 'Google Drive image metadata',
      }}
    >
      <div style={{ display: 'grid', width: '100%', height: '100%' }}>
        <div
          className="nodrag"
          role="button"
          tabIndex={0}
          title={data.driveFileId ? 'Change Google Drive image' : 'Choose Google Drive image'}
          onClick={chooseImage}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              chooseImage();
            }
          }}
          style={{
            minHeight: 150,
            height: '100%',
            border: '1px solid var(--border-node)',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.035)',
            display: 'grid',
            placeItems: 'center',
            overflow: 'hidden',
            cursor: !user || isLoading ? 'not-allowed' : 'pointer',
            opacity: !user || isLoading ? 0.7 : 1,
            position: 'relative',
          }}
        >
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={data.driveFileName || 'Google Drive image'}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                display: 'block',
              }}
            />
          ) : (
            <div style={{ padding: '18px', textAlign: 'center', color: 'var(--text-sub)', fontSize: '0.72rem' }}>
              {isLoading ? 'Loading image...' : data.driveFileId ? 'Preview unavailable' : 'Choose from Drive'}
            </div>
          )}

          {data.driveFileId && !isLoading && (
            <button
              type="button"
              className="nodrag"
              onClick={(event) => {
                event.stopPropagation();
                clearImage();
              }}
              title="Clear image"
              style={{
                position: 'absolute',
                right: 8,
                top: 8,
                width: 30,
                height: 30,
                border: '1px solid var(--border-input)',
                background: 'rgba(10, 14, 24, 0.78)',
                color: 'var(--text-main)',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              <Icons.Clear width={14} height={14} style={{ marginRight: 0 }} />
            </button>
          )}

          {status && (
            <div
              style={{
                position: 'absolute',
                left: 8,
                right: 8,
                bottom: 8,
                color: '#fecaca',
                background: 'rgba(127, 29, 29, 0.72)',
                border: '1px solid rgba(248, 113, 113, 0.35)',
                borderRadius: 6,
                padding: '6px 8px',
                fontSize: '0.66rem',
                lineHeight: 1.35,
              }}
            >
              {status}
            </div>
          )}
        </div>
      </div>
    </NodeFrame>
  );
});

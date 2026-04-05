import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { loadMathlive } from '../utils/loadMathlive';

interface MathInputProps {
    value: string;
    onChange?: (value: string) => void;
    onKeyDown?: (e: React.KeyboardEvent) => void;
    className?: string;
    style?: React.CSSProperties;
    readOnly?: boolean;
    id?: string;
}

export const MathInput = forwardRef<any, MathInputProps>(({ value, onChange, onKeyDown, className, style, readOnly, id }, ref) => {
    const mfRef = useRef<any>(null);
    const isSettingValueRef = useRef(false);
    const valueRef = useRef(value);
    const [isReady, setIsReady] = React.useState(false);

    // Expose the underlying math-field to parent refs
    useImperativeHandle(ref, () => mfRef.current);

    // Keep the ref updated with the latest prop without triggering effects
    useEffect(() => {
        valueRef.current = value;
    }, [value]);

    const onChangeRef = useRef(onChange);
    useEffect(() => {
        onChangeRef.current = onChange;
    }, [onChange]);

    useEffect(() => {
        let isMounted = true;

        loadMathlive().then(() => {
            if (isMounted) setIsReady(true);
        });

        return () => {
            isMounted = false;
        };
    }, []);

    // Setup input listener exactly once
    useEffect(() => {
        if (!isReady) return;
        const mf = mfRef.current;
        if (!mf) return;

        let frameId: number;
        const handleInput = (e: any) => {
            if (isSettingValueRef.current) return; // Prevent fake inputs when syncing from React
            const nextVal = e.target.value;
            if (nextVal !== valueRef.current && onChangeRef.current) {
                // Use RAF to decouple from React render cycle and prevent thrashing
                cancelAnimationFrame(frameId);
                frameId = requestAnimationFrame(() => {
                    onChangeRef.current!(nextVal);
                });
            }
        };

        mf.addEventListener('input', handleInput);
        return () => {
            mf.removeEventListener('input', handleInput);
            cancelAnimationFrame(frameId);
        };
    }, [isReady]); // Bind after mathlive registers the web component

    // Manually sync changes from React store to the Web Component
    useEffect(() => {
        if (!isReady) return;
        const mf = mfRef.current;
        if (!mf) return;

        if (mf.value !== value) {
            isSettingValueRef.current = true;
            mf.value = value;
            isSettingValueRef.current = false;
        }
    }, [value]);

    if (!isReady) {
        return (
            <div
                className={className}
                style={style}
                aria-busy="true"
            />
        );
    }

    return (
        <math-field
            ref={mfRef}
            id={id}
            class={className}
            style={style as any}
            read-only={readOnly ? "true" : undefined}
            onKeyDown={onKeyDown as any}
        />
    );
});

MathInput.displayName = 'MathInput';

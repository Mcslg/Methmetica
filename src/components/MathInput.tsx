import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { loadMathlive } from '../utils/loadMathlive';

interface MathInputProps {
    value: string;
    onChange?: (value: string) => void;
    onKeyDown?: (e: React.KeyboardEvent) => void;
    onBlur?: (e: React.FocusEvent) => void;
    className?: string;
    style?: React.CSSProperties;
    readOnly?: boolean;
    id?: string;
    name?: string;
}

export type MathfieldElement = HTMLElement & {
    value: string;
    executeCommand?: (command: string | string[]) => void;
};

export const MathInput = forwardRef<MathfieldElement, MathInputProps>(({ value, onChange, onKeyDown, onBlur, className, style, readOnly, id, name }, ref) => {
    const mfRef = useRef<MathfieldElement | null>(null);
    const isSettingValueRef = useRef(false);
    const valueRef = useRef(value);
    const [isReady, setIsReady] = React.useState(false);

    // Expose the underlying math-field to parent refs
    useImperativeHandle(ref, () => mfRef.current as MathfieldElement);

    // Keep the ref updated with the latest prop without triggering effects
    useEffect(() => {
        valueRef.current = value;
    }, [value]);

    useEffect(() => {
        const mf = mfRef.current;
        if (!mf || !isReady) return;

        if (name) {
            mf.setAttribute('name', name);
        } else {
            mf.removeAttribute('name');
        }
    }, [name, isReady]);

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
        const handleInput = (e: Event) => {
            if (isSettingValueRef.current) return; // Prevent fake inputs when syncing from React
            const nextVal = (e.target as MathfieldElement | null)?.value ?? '';
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
    }, [value, isReady]);

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
            style={style}
            read-only={readOnly ? "true" : undefined}
            onKeyDown={onKeyDown}
            onBlur={onBlur}
        />
    );
});

MathInput.displayName = 'MathInput';

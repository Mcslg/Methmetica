import React, { useEffect, useRef } from 'react';
import 'mathlive';

interface MathInputProps {
    value: string;
    onChange?: (value: string) => void;
    className?: string;
    style?: React.CSSProperties;
}

export const MathInput: React.FC<MathInputProps> = React.memo(({ value, onChange, className, style }) => {
    const mfRef = useRef<any>(null);
    const isSettingValueRef = useRef(false);
    const valueRef = useRef(value);

    // Keep the ref updated with the latest prop without triggering effects
    useEffect(() => {
        valueRef.current = value;
    }, [value]);

    // Setup input listener exactly once
    useEffect(() => {
        const mf = mfRef.current;
        if (!mf) return;

        const handleInput = (e: any) => {
            if (isSettingValueRef.current) return; // Prevent fake inputs when syncing from React
            const nextVal = e.target.value;
            if (nextVal !== valueRef.current && onChange) {
                onChange(nextVal);
            }
        };

        mf.addEventListener('input', handleInput);
        return () => mf.removeEventListener('input', handleInput);
    }, [onChange]);

    // Manually sync changes from React store to the Web Component
    useEffect(() => {
        const mf = mfRef.current;
        if (!mf) return;

        if (mf.value !== value) {
            isSettingValueRef.current = true;
            mf.value = value;
            isSettingValueRef.current = false;
        }
    }, [value]);

    return (
        <math-field
            ref={mfRef}
            class={className}
            style={style as any}
        />
    );
});

/// <reference types="react" />

declare namespace React {
    namespace JSX {
        interface IntrinsicElements {
            'math-field': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
                ref?: React.RefObject<any>;
                class?: string;
                value?: string;
                style?: React.CSSProperties;
            };
        }
    }
}

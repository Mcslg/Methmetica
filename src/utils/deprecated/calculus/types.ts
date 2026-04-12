export interface CalculusStep {
    label: string;
    latex: string;
}

export interface StepNode {
    rule: string;
    explanationKey: string;
    inputLatex: string;
    outputLatex?: string;
    children: StepNode[];
    meta?: Record<string, string | number | boolean | undefined>;
}

export interface StepTreeResult {
    root: StepNode;
    finalLatex?: string;
}

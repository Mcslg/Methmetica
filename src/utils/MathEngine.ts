// @ts-ignore
const loadNerdamer = async (): Promise<any> => {
    // @ts-ignore
    const nerdamer = await import('nerdamer/all.min');
    return nerdamer.default || nerdamer;
};

let enginePromise: Promise<any> | null = null;

export const getMathEngine = (): Promise<any> => {
    if (!enginePromise) {
        enginePromise = loadNerdamer();
    }
    return enginePromise;
};

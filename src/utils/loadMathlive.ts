let mathliveLoader: Promise<void> | null = null;

export const loadMathlive = () => {
  if (!mathliveLoader) {
    mathliveLoader = import('mathlive').then(() => undefined);
  }

  return mathliveLoader;
};

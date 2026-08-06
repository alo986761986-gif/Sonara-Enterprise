export const ModuleLoader = {
  load: async <T>(importFn: () => Promise<T>): Promise<T> => {
    return await importFn();
  }
};

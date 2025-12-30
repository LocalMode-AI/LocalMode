/**
 * Global Provider Utilities
 *
 * Helper for resolving models from string IDs using global provider.
 *
 * @packageDocumentation
 */

/**
 * Get global provider and resolve model if needed.
 *
 * @param modelOrId - Model object or string ID
 * @param globalProvider - The global provider factory
 * @param domainName - Name of the domain for error messages
 * @returns The provider factory if model is string, throws if no provider
 */
export function getGlobalProvider<T>(
  modelOrId: unknown,
  globalProvider: T | undefined,
  domainName: string
): T {
  if (typeof modelOrId === 'string' && !globalProvider) {
    throw new Error(
      `No global ${domainName} provider configured. ` +
        `Either pass a model object or call setGlobal${domainName}Provider() first.`
    );
  }

  return globalProvider as T;
}


/**
 * @file use-vault.ts
 * @description Hook for managing vault operations (setup, lock, unlock, entries)
 */
'use client';

import { useVaultStore } from '../_store/vault.store';
import {
  initializeVault,
  unlockVault as unlockVaultService,
  lockVault as lockVaultService,
  addEntry as addEntryService,
  deleteEntry as deleteEntryService,
  decryptContent,
  loadEntries,
} from '../_services/vault.service';

/** Hook for vault operations */
export function useVault() {
  const store = useVaultStore();

  // No initialization here — VaultView handles it at the top level

  /**
   * Set up a new vault with a master password
   * @param password - The master password
   */
  const setup = async (password: string) => {
    store.clearError();
    store.setProcessing(true);

    try {
      await initializeVault(password);
      store.setEntries([]);
      store.setVaultState('unlocked');
    } catch (error) {
      console.error('Failed to initialize vault:', error);
      store.setError({
        message: 'Failed to initialize vault. Please try again.',
        code: 'SETUP_FAILED',
        recoverable: true,
      });
    } finally {
      store.setProcessing(false);
    }
  };

  /**
   * Unlock the vault with a password
   * @param password - The master password
   */
  const unlock = async (password: string) => {
    store.clearError();
    store.setProcessing(true);

    try {
      await unlockVaultService(password);
      const entries = loadEntries();
      store.setEntries(entries);
      store.setVaultState('unlocked');
    } catch (error) {
      console.error('Failed to unlock vault:', error);
      const message =
        error instanceof Error && error.message === 'Incorrect password'
          ? 'Incorrect password. Please try again.'
          : 'Failed to unlock vault. Please try again.';
      store.setError({
        message,
        code: 'UNLOCK_FAILED',
        recoverable: true,
      });
    } finally {
      store.setProcessing(false);
    }
  };

  /**
   * Lock the vault and clear in-memory data
   */
  const lock = () => {
    lockVaultService();
    store.reset();
    store.setVaultState('locked');
  };

  /**
   * Add a new encrypted entry to the vault
   * @param title - Entry title
   * @param content - Plaintext content to encrypt
   */
  const addEntry = async (title: string, content: string) => {
    store.clearError();
    store.setProcessing(true);

    try {
      const entry = await addEntryService(title, content);
      store.addEntry(entry);
    } catch (error) {
      console.error('Failed to add entry:', error);
      store.setError({
        message: 'Failed to encrypt and save entry. Please try again.',
        code: 'ADD_FAILED',
        recoverable: true,
      });
    } finally {
      store.setProcessing(false);
    }
  };

  /**
   * Decrypt and view an entry's content
   * @param entry - The vault entry to decrypt
   */
  const viewEntry = async (entryId: string, encryptedContent: string) => {
    store.clearError();

    // Toggle off if already viewing this entry
    if (store.decryptedEntryId === entryId) {
      store.setDecrypted(null, null);
      return;
    }

    store.setProcessing(true);

    try {
      const content = await decryptContent(encryptedContent);
      store.setDecrypted(entryId, content);
    } catch (error) {
      console.error('Failed to decrypt entry:', error);
      store.setError({
        message: 'Failed to decrypt entry.',
        code: 'DECRYPT_FAILED',
        recoverable: true,
      });
    } finally {
      store.setProcessing(false);
    }
  };

  /**
   * Delete an entry from the vault
   * @param id - Entry ID to delete
   */
  const removeEntry = (id: string) => {
    store.clearError();

    try {
      deleteEntryService(id);
      store.removeEntry(id);
    } catch (error) {
      console.error('Failed to delete entry:', error);
      store.setError({
        message: 'Failed to delete entry. Please try again.',
        code: 'DELETE_FAILED',
        recoverable: true,
      });
    }
  };

  return {
    setup,
    unlock,
    lock,
    addEntry,
    viewEntry,
    removeEntry,
  };
}

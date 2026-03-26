/**
 * @file vault-view.tsx
 * @description Main vault view with setup, lock, and unlock screens
 */
'use client';

import { useState, useEffect } from 'react';
import {
  Lock,
  Unlock,
  Shield,
  Key,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  FileText,
  AlertTriangle,
  ArrowLeft,
  ShieldCheck,
} from 'lucide-react';
import { Button, Spinner, StatusDot } from './ui';
import { ErrorBoundary, ErrorAlert } from './error-boundary';
import { useVaultStore } from '../_store/vault.store';
import { useVault } from '../_hooks/use-vault';
import { isVaultInitialized } from '../_services/vault.service';
import { cn, formatDate, validatePassword } from '../_lib/utils';

/** Setup screen for creating a new vault */
function SetupScreen() {
  const { setup } = useVault();
  const { isProcessing, error } = useVaultStore();
  const clearError = useVaultStore((s) => s.clearError);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Derived: password strength indicator
  const passwordLength = password.length;
  const strengthPercent = Math.min(Math.round((passwordLength / 12) * 100), 100);
  const strengthColor =
    passwordLength >= 12 ? 'text-success' : passwordLength >= 8 ? 'text-warning' : 'text-error';
  const strengthLabel =
    passwordLength >= 12 ? 'Strong' : passwordLength >= 8 ? 'Good' : passwordLength > 0 ? 'Weak' : '';

  /** Handle vault creation */
  const handleSetup = async () => {
    setValidationError(null);

    const passwordError = validatePassword(password);
    if (passwordError) {
      setValidationError(passwordError);
      return;
    }

    if (password !== confirmPassword) {
      setValidationError('Passwords do not match');
      return;
    }

    await setup(password);
  };

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-8rem)] px-6">
      <div className="w-full max-w-md space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Header with shield */}
        <div className="text-center space-y-4">
          <div className="relative mx-auto w-fit">
            <div className="w-20 h-20 rounded-2xl bg-poster-accent-teal/10 flex items-center justify-center ring-1 ring-poster-accent-teal/20">
              <Shield className="w-10 h-10 text-poster-accent-teal" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-lg bg-poster-surface flex items-center justify-center ring-1 ring-poster-accent-teal/30">
              <Lock className="w-3.5 h-3.5 text-poster-accent-teal" />
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-poster-text-main">Create Your Vault</h2>
            <p className="text-sm text-poster-text-sub/60 mt-1">
              Set a master password to encrypt your vault
            </p>
          </div>
        </div>

        {/* Error alerts */}
        {error && (
          <ErrorAlert message={error.message} onDismiss={clearError} />
        )}

        {/* Form card */}
        <div className="card bg-poster-surface border border-poster-border/20 shadow-2xl">
          <div className="card-body p-6 space-y-4">
            {/* Master password */}
            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium text-poster-text-sub text-xs uppercase tracking-wider">
                  Master Password
                </span>
              </label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-poster-text-sub/30" />
                <input
                  type="password"
                  placeholder="Enter master password..."
                  className={cn(
                    'input input-bordered w-full pl-10 bg-black/20',
                    'border-poster-border/20 text-poster-text-main',
                    'focus:border-poster-accent-teal/50 placeholder:text-poster-text-sub/30'
                  )}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {/* Strength indicator */}
              {password.length > 0 && (
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1 h-1 rounded-full bg-poster-border/20 overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-300',
                        passwordLength >= 12 ? 'bg-success' : passwordLength >= 8 ? 'bg-warning' : 'bg-error'
                      )}
                      style={{ width: `${strengthPercent}%` }}
                    />
                  </div>
                  <span className={cn('text-[11px] font-medium', strengthColor)}>
                    {strengthLabel}
                  </span>
                </div>
              )}
            </div>

            {/* Confirm password */}
            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium text-poster-text-sub text-xs uppercase tracking-wider">
                  Confirm Password
                </span>
              </label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-poster-text-sub/30" />
                <input
                  type="password"
                  placeholder="Confirm password..."
                  className={cn(
                    'input input-bordered w-full pl-10 bg-black/20',
                    'border-poster-border/20 text-poster-text-main',
                    'focus:border-poster-accent-teal/50 placeholder:text-poster-text-sub/30'
                  )}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSetup()}
                />
              </div>
            </div>

            {/* Validation error */}
            {validationError && (
              <div className="alert alert-error py-2 px-3">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-xs">{validationError}</span>
              </div>
            )}

            {/* Create button */}
            <button
              onClick={handleSetup}
              disabled={!password || !confirmPassword || isProcessing}
              className={cn(
                'btn btn-md w-full gap-2 text-white font-semibold mt-2',
                'bg-gradient-to-r from-poster-accent-teal to-poster-accent-teal/80',
                'hover:shadow-poster-accent-teal/25 hover:shadow-lg transition-all duration-200',
                'disabled:opacity-40 disabled:cursor-not-allowed'
              )}
            >
              {isProcessing ? (
                <Spinner size="sm" />
              ) : (
                <Shield className="w-4 h-4" />
              )}
              Create Vault
            </button>
          </div>
        </div>

        {/* Security badges */}
        <div className="flex items-center justify-center gap-3">
          <span className="px-2.5 py-1 rounded-md bg-poster-accent-teal/8 text-[11px] font-medium text-poster-accent-teal/70 border border-poster-accent-teal/15">
            <ShieldCheck className="w-3 h-3 inline mr-1 -mt-px" />
            AES-256 Encrypted
          </span>
          <span className="px-2.5 py-1 rounded-md bg-poster-surface text-[11px] font-medium text-poster-text-sub/50 border border-poster-border/15">
            <Lock className="w-3 h-3 inline mr-1 -mt-px" />
            Data never leaves your device
          </span>
        </div>

        {/* Warning */}
        <div className="alert bg-warning/8 border border-warning/15 py-3 px-4">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
          <span className="text-xs text-warning/80">
            <strong>Warning:</strong> If you lose your password, your data cannot be recovered.
            All encryption happens locally on your device.
          </span>
        </div>
      </div>
    </div>
  );
}

/** Locked screen for entering password */
function LockedScreen() {
  const { unlock } = useVault();
  const { isProcessing, error } = useVaultStore();
  const clearError = useVaultStore((s) => s.clearError);

  const [password, setPassword] = useState('');

  /** Handle vault unlock */
  const handleUnlock = async () => {
    if (!password) return;
    await unlock(password);
  };

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-8rem)] px-6">
      <div className="w-full max-w-md space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Lock icon with keyhole animation */}
        <div className="text-center space-y-4">
          <div className="relative mx-auto w-fit">
            <div className="w-24 h-24 rounded-2xl bg-poster-surface border border-poster-border/20 flex items-center justify-center shadow-2xl">
              <Lock className="w-12 h-12 text-poster-accent-teal animate-pulse" style={{ animationDuration: '3s' }} />
            </div>
            {/* Keyhole glow effect */}
            <div className="absolute inset-0 rounded-2xl bg-poster-accent-teal/5 animate-pulse" style={{ animationDuration: '3s' }} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-poster-text-main">Vault Locked</h2>
            <p className="text-sm text-poster-text-sub/60 mt-1">
              Enter your master password to decrypt your vault
            </p>
          </div>
        </div>

        {/* Error alerts */}
        {error && (
          <ErrorAlert message={error.message} onDismiss={clearError} />
        )}

        {/* Form card */}
        <div className="card bg-poster-surface border border-poster-border/20 shadow-2xl">
          <div className="card-body p-6 space-y-4">
            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium text-poster-text-sub text-xs uppercase tracking-wider">
                  Master Password
                </span>
              </label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-poster-text-sub/30" />
                <input
                  type="password"
                  placeholder="Enter password..."
                  className={cn(
                    'input input-bordered w-full pl-10 bg-black/20',
                    'border-poster-border/20 text-poster-text-main',
                    'focus:border-poster-accent-teal/50 placeholder:text-poster-text-sub/30'
                  )}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                  autoFocus
                />
              </div>
            </div>

            <button
              onClick={handleUnlock}
              disabled={!password || isProcessing}
              className={cn(
                'btn btn-md w-full gap-2 text-white font-semibold',
                'bg-gradient-to-r from-poster-accent-teal to-poster-accent-teal/80',
                'hover:shadow-poster-accent-teal/25 hover:shadow-lg transition-all duration-200',
                'disabled:opacity-40 disabled:cursor-not-allowed'
              )}
            >
              {isProcessing ? (
                <Spinner size="sm" />
              ) : (
                <Key className="w-4 h-4" />
              )}
              Unlock Vault
            </button>
          </div>
        </div>

        {/* Security notice */}
        <div className="flex items-center justify-center gap-3">
          <span className="px-2.5 py-1 rounded-md bg-poster-accent-teal/8 text-[11px] font-medium text-poster-accent-teal/70 border border-poster-accent-teal/15">
            <ShieldCheck className="w-3 h-3 inline mr-1 -mt-px" />
            AES-256 Encrypted
          </span>
        </div>
      </div>
    </div>
  );
}

/** Unlocked screen showing entries and add form */
function UnlockedScreen() {
  const { addEntry, viewEntry, removeEntry, lock } = useVault();
  const {
    entries,
    decryptedEntryId,
    decryptedContent,
    isProcessing,
    error,
  } = useVaultStore();
  const clearError = useVaultStore((s) => s.clearError);

  // Local state for add entry form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');

  /** Handle adding a new entry */
  const handleAddEntry = async () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    await addEntry(newTitle.trim(), newContent.trim());
    setNewTitle('');
    setNewContent('');
    setShowAddForm(false);
  };

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Error Alert */}
        {error && (
          <ErrorAlert message={error.message} onDismiss={clearError} />
        )}

        {/* Add Entry Form */}
        {showAddForm && (
          <ErrorBoundary>
            <div className="card bg-poster-surface border border-poster-accent-teal/20 shadow-lg animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="card-body p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-poster-accent-teal" />
                    <span className="text-sm font-semibold">New Encrypted Entry</span>
                  </div>
                  <button
                    className="btn btn-ghost btn-xs text-poster-text-sub/40 hover:text-poster-text-main"
                    onClick={() => setShowAddForm(false)}
                  >
                    Cancel
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Entry title..."
                  className={cn(
                    'input input-bordered w-full bg-black/20',
                    'border-poster-border/20 text-poster-text-main',
                    'focus:border-poster-accent-teal/50 placeholder:text-poster-text-sub/30'
                  )}
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  autoFocus
                />
                <textarea
                  placeholder="Secret content to encrypt..."
                  className={cn(
                    'textarea textarea-bordered w-full bg-black/20',
                    'border-poster-border/20 text-poster-text-main',
                    'focus:border-poster-accent-teal/50 placeholder:text-poster-text-sub/30',
                    'min-h-[120px] resize-none'
                  )}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                />
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-poster-text-sub/40">
                    <Lock className="w-3 h-3 inline mr-1 -mt-px" />
                    Will be encrypted with AES-256-GCM
                  </span>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleAddEntry}
                    loading={isProcessing}
                    disabled={!newTitle.trim() || !newContent.trim() || isProcessing}
                    className="bg-poster-accent-teal hover:bg-poster-accent-teal/90 border-poster-accent-teal"
                  >
                    <Shield className="w-4 h-4 mr-1" />
                    Encrypt & Save
                  </Button>
                </div>
              </div>
            </div>
          </ErrorBoundary>
        )}

        {/* Entries List */}
        {entries.length > 0 ? (
          <ErrorBoundary>
            <div className="space-y-3">
              {entries.map((entry, index) => {
                const isDecrypted = decryptedEntryId === entry.id;
                return (
                  <div
                    key={entry.id}
                    className={cn(
                      'card bg-poster-surface border shadow-sm transition-all duration-200',
                      'animate-in fade-in',
                      isDecrypted
                        ? 'border-poster-accent-teal/30 shadow-poster-accent-teal/5 shadow-md'
                        : 'border-poster-border/20 hover:border-poster-border/40'
                    )}
                    style={{ animationDelay: `${index * 40}ms`, animationFillMode: 'both' }}
                  >
                    <div className="card-body p-4 space-y-0">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          'w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors',
                          isDecrypted
                            ? 'bg-poster-accent-teal/15 ring-1 ring-poster-accent-teal/30'
                            : 'bg-poster-surface border border-poster-border/20'
                        )}>
                          <FileText className={cn(
                            'w-4 h-4',
                            isDecrypted ? 'text-poster-accent-teal' : 'text-poster-text-sub/50'
                          )} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-sm text-poster-text-main truncate">
                            {entry.title}
                          </h3>
                          <p className="text-[11px] text-poster-text-sub/40">
                            {formatDate(entry.createdAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => viewEntry(entry.id, entry.encryptedContent)}
                            className={cn(
                              'btn btn-xs gap-1 transition-colors',
                              isDecrypted
                                ? 'btn-ghost text-poster-accent-teal'
                                : 'btn-ghost text-poster-text-sub/60 hover:text-poster-accent-teal'
                            )}
                          >
                            {isDecrypted ? (
                              <>
                                <EyeOff className="w-3 h-3" />
                                Hide
                              </>
                            ) : (
                              <>
                                <Eye className="w-3 h-3" />
                                View
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => removeEntry(entry.id)}
                            className="btn btn-ghost btn-xs text-poster-text-sub/20 hover:text-error transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* Decrypted content with reveal animation */}
                      {isDecrypted && decryptedContent && (
                        <div className="mt-3 animate-in fade-in slide-in-from-top-1 duration-300">
                          <div className="bg-black/20 rounded-xl p-4 border border-poster-accent-teal/15">
                            <div className="flex items-center gap-1.5 mb-2">
                              <Unlock className="w-3 h-3 text-poster-accent-teal" />
                              <span className="text-[11px] font-medium text-poster-accent-teal/70 uppercase tracking-wider">
                                Decrypted Content
                              </span>
                            </div>
                            <p className="text-sm text-poster-text-main whitespace-pre-wrap leading-relaxed">
                              {decryptedContent}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ErrorBoundary>
        ) : (
          /* Empty State */
          <div className="text-center py-16 animate-in fade-in duration-500">
            <div className="w-16 h-16 rounded-2xl bg-poster-surface border border-poster-border/20 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-poster-text-sub/20" />
            </div>
            <h3 className="text-lg font-bold mb-2 text-poster-text-main">Vault is empty</h3>
            <p className="text-sm text-poster-text-sub/50 max-w-sm mx-auto mb-5">
              Add encrypted entries to securely store sensitive information.
              Everything is encrypted with AES-256-GCM locally on your device.
            </p>
            {!showAddForm && (
              <button
                onClick={() => setShowAddForm(true)}
                className={cn(
                  'btn btn-sm gap-1.5 text-white font-medium',
                  'bg-gradient-to-r from-poster-accent-teal to-poster-accent-teal/80',
                  'hover:shadow-poster-accent-teal/25 hover:shadow-lg transition-all duration-200'
                )}
              >
                <Plus className="w-4 h-4" />
                Add First Entry
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Main vault view with all screens */
export function VaultView() {
  const { vaultState, entries } = useVaultStore();
  const { lock } = useVault();

  // Initialize vault state once on mount (top-level only)
  useEffect(() => {
    if (isVaultInitialized()) {
      useVaultStore.getState().setVaultState('locked');
    } else {
      useVaultStore.getState().setVaultState('setup');
    }
  }, []);

  // Local state for add form toggle (passed down)
  const [showAddForm, setShowAddForm] = useState(false);

  return (
    <div className="h-[calc(100vh-4rem)] bg-poster-bg text-poster-text-main font-sans selection:bg-poster-accent-teal/30 relative overflow-hidden">
      {/* Background grid */}
      <div className="bg-grid fixed inset-0 z-0 pointer-events-none opacity-50" />

      <div className="relative z-10 flex flex-col h-full">
        {/* Header */}
        <div className="h-14 min-h-14 border-b border-poster-border/20 flex items-center justify-between px-5 bg-poster-surface/60 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <a
              href="/"
              className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-poster-surface-lighter/50 text-poster-text-sub hover:text-poster-text-main transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </a>
            <div className="w-px h-5 bg-poster-border/20" />
            <div className="flex items-center gap-2.5">
              <div className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center ring-1',
                vaultState === 'unlocked'
                  ? 'bg-success/15 ring-success/30'
                  : 'bg-poster-accent-teal/15 ring-poster-accent-teal/30'
              )}>
                {vaultState === 'unlocked' ? (
                  <Unlock className="w-4 h-4 text-success" />
                ) : (
                  <Shield className="w-4 h-4 text-poster-accent-teal" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-sm font-semibold text-poster-text-main leading-tight">
                    Encrypted Vault
                  </h1>
                  {vaultState === 'unlocked' && (
                    <StatusDot color="teal" pulse size="sm" />
                  )}
                </div>
                <p className="text-[11px] text-poster-text-sub/60 leading-tight">
                  {vaultState === 'unlocked' ? 'Vault Unlocked' : 'AES-256-GCM Encryption'}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-md bg-poster-accent-teal/10 text-[11px] font-medium text-poster-accent-teal border border-poster-accent-teal/20">
              AES-256-GCM
            </span>
            {vaultState === 'unlocked' && (
              <>
                <span className="px-2.5 py-1 rounded-md bg-poster-surface text-[11px] font-medium text-poster-text-sub border border-poster-border/20">
                  <FileText className="w-3 h-3 inline mr-1 -mt-px" />
                  {entries.length} entries
                </span>
                <Button variant="ghost" size="xs" onClick={() => setShowAddForm(true)}>
                  <Plus className="w-3 h-3 mr-1" />
                  Add
                </Button>
                <button
                  onClick={lock}
                  className="btn btn-xs gap-1 bg-error/10 text-error border border-error/20 hover:bg-error/20 transition-colors"
                >
                  <Lock className="w-3 h-3" />
                  Lock
                </button>
              </>
            )}
          </div>
        </div>

        {/* Content based on vault state */}
        <ErrorBoundary>
          {vaultState === 'setup' && <SetupScreen />}
          {vaultState === 'locked' && <LockedScreen />}
          {vaultState === 'unlocked' && <UnlockedScreen />}
        </ErrorBoundary>
      </div>
    </div>
  );
}

import React from 'react';
import { useOpenCard } from './useOpenCard.js';

export function AuthButton({
  className,
  signInLabel = 'Sign in',
  signOutLabel = 'Sign out',
  authenticatingLabel = 'Signing in...',
  onSignIn,
  onSignOut,
}) {
  const { isAuthenticated, isAuthenticating, user, signIn, signOut } = useOpenCard();

  const handleClick = async () => {
    try {
      if (isAuthenticated) {
        await signOut();
        onSignOut?.();
      } else {
        await signIn();
        onSignIn?.();
      }
    } catch (error) {
      console.error('Authentication action failed:', error);
    }
  };

  const getButtonText = () => {
    if (isAuthenticating) return authenticatingLabel;
    if (isAuthenticated && user?.name) return user.name;
    if (isAuthenticated) return signOutLabel;
    return signInLabel;
  };

  return (
    <button
      className={className}
      onClick={handleClick}
      disabled={isAuthenticating}
      aria-busy={isAuthenticating}
    >
      {getButtonText()}
    </button>
  );
}
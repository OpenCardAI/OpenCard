import { useContext } from 'react';
import { OpenCardContext } from './OpenCardContext';
import type { OpenCardContextValue } from '../types';

export function useOpenCard(): OpenCardContextValue {
  const context = useContext(OpenCardContext);
  
  if (!context) {
    throw new Error('useOpenCard must be used within an OpenCardProvider');
  }
  
  return context;
}
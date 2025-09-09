import { useContext } from 'react';
import { OpenCardContext } from './OpenCardContext.jsx';

export function useOpenCard() {
  const context = useContext(OpenCardContext);
  
  if (!context) {
    throw new Error('useOpenCard must be used within an OpenCardProvider');
  }
  
  return context;
}
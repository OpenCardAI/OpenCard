import { createContext } from 'react';
import type { OpenCardContextValue } from '../types';

export const OpenCardContext = createContext<OpenCardContextValue | undefined>(undefined);
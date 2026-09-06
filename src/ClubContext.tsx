import { createContext, useContext } from 'react';
import type { Club } from './clubs';
export const ClubContext = createContext<Club | null>(null);
export const useClub = (): Club | null => useContext(ClubContext);

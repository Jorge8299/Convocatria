export type ClubRole = 'entrenador' | 'coordinador' | 'superadmin';

export interface ClubAccount {
  id: string;
  name: string;
  role: ClubRole;
  teamLabel: string;
  pinHash?: string;
  active: boolean;
  createdAt: string;
}

export const clubDataKey = (accountId: string, area: 'team' | 'stats' | 'journeys' | 'rivals') => `convo_account_${accountId}_${area}`;
export const clubBoardKey = (accountId: string) => `pizarra_futbol8_pro_v1_${accountId}`;

export type ClubRole = 'entrenador' | 'coordinador' | 'admin' | 'superadmin';
export type FootballStage = 'querubin' | 'prebenjamin' | 'benjamin' | 'alevin' | 'infantil' | 'cadete' | 'juvenil';
export type CoordinatorScope = 'f8' | 'f11' | 'all';
export type TrainingYear = 'primero' | 'segundo' | 'mixto';

export const footballStages: FootballStage[] = ['querubin', 'prebenjamin', 'benjamin', 'alevin', 'infantil', 'cadete', 'juvenil'];
export const football8Stages: FootballStage[] = ['querubin', 'prebenjamin', 'benjamin', 'alevin'];
export const football11Stages: FootballStage[] = ['infantil', 'cadete', 'juvenil'];
export const stagesInScope = (scope: CoordinatorScope | null | undefined): FootballStage[] | null =>
  scope === 'f8' ? football8Stages : scope === 'f11' ? football11Stages : null;

export interface ClubAccount {
  id: string;
  club_id?: string | null;
  name: string;
  role: ClubRole;
  teamLabel: string;
  footballStage: FootballStage | null;
  trainingYear: TrainingYear | null;
  scope: CoordinatorScope | null;
  pinHash?: string;
  active: boolean;
  createdAt: string;
}

export const clubDataKey = (accountId: string, area: 'team' | 'stats' | 'journeys' | 'rivals') => `convo_account_${accountId}_${area}`;
export const clubBoardKey = (accountId: string) => `pizarra_futbol8_pro_v1_${accountId}`;

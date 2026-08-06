export interface RosterRow {
  studentId: string;
  name: string;
  email: string;
  section?: string;
  teamCode?: string;
}

export interface ProvisionedCredential {
  studentId: string;
  name: string;
  email: string;
  teamCode: string;
  rawKey: string;
}

export interface ProvisioningResult {
  offeringCode: string;
  teams: { teamCode: string; databaseName: string; members: string[] }[];
  credentials: ProvisionedCredential[];
}

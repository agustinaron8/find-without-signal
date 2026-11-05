import Dexie, { type Table } from 'dexie';

export interface Member {
  id: string;
  name: string;
  color: string;
  phone?: string;
}

export interface MeetingPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  description?: string;
  isPrimary?: boolean;
}

export interface OfflineArea {
  bbox: [number, number, number, number];
  minZoom: number;
  maxZoom: number;
  tileCount: number;
  downloadedAt: number;
  tilesetVersionUrl: string;
}

export interface Group {
  id: string;
  name: string;
  createdAt: number;
  members: Member[];
  meetingPoints: MeetingPoint[];
  plan?: string;
  planTimes?: string[];
  notes?: string;
  offlineArea?: OfflineArea;
  myMemberId?: string;
}

export interface TrackPoint {
  id?: number;
  groupId: string;
  lat: number;
  lng: number;
  acc: number;
  t: number;
}

export interface PersonalPoint {
  id: string;
  groupId: string;
  name: string;
  lat: number;
  lng: number;
  createdAt: number;
}

export interface MemberLocation {
  groupId: string;
  memberId: string;
  lat: number;
  lng: number;
  acc: number;
  t: number;
}

class ReencuentroDB extends Dexie {
  groups!: Table<Group, string>;
  trackPoints!: Table<TrackPoint, number>;
  personalPoints!: Table<PersonalPoint, string>;
  memberLocations!: Table<MemberLocation, [string, string]>;

  constructor() {
    super('reencuentro');
    this.version(1).stores({
      groups: 'id, createdAt',
      trackPoints: '++id, groupId, t',
      personalPoints: 'id, groupId',
    });
    this.version(2).stores({
      memberLocations: '[groupId+memberId], groupId',
    });
  }
}

export const db = new ReencuentroDB();

export async function deleteGroup(id: string): Promise<void> {
  await db.transaction('rw', [db.groups, db.trackPoints, db.personalPoints, db.memberLocations], async () => {
    await db.groups.delete(id);
    await db.trackPoints.where('groupId').equals(id).delete();
    await db.personalPoints.where('groupId').equals(id).delete();
    await db.memberLocations.where('groupId').equals(id).delete();
  });
}

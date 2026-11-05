import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useRef, useState } from 'react';
import { db, type Group } from '../db';
import {
  decryptLocation,
  deriveLocationKeys,
  encryptLocation,
  exchangeLocations,
  LOCATION_MAX_AGE_MS,
  memberTag,
  newestLocations,
  nextSyncDelay,
  type SyncWrite,
} from '../lib/lastKnown';
import type { Position } from './useGeolocation';

// A worse fix would send people to the wrong side of the grounds.
const MAX_SHARED_ACCURACY_M = 200;
const OFF_PENDING = 'off';

const sharingKey = (groupId: string) => `share-location-${groupId}`;

export function useLastKnown(group: Group | null | undefined, position: Position | null) {
  const groupId = group?.id;
  const stored = useLiveQuery(
    () => (groupId ? db.memberLocations.where('groupId').equals(groupId).toArray() : []),
    [groupId],
  );
  const [sharing, setSharingState] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [failing, setFailing] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const latest = useRef({ group, position, sharing });
  latest.current = { group, position, sharing };
  const runRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (groupId) setSharingState(localStorage.getItem(sharingKey(groupId)) === '1');
  }, [groupId]);

  useEffect(() => {
    if (!groupId) return undefined;
    let cancelled = false;
    let inFlight = false;
    let rerun = false;
    let failures = 0;
    let timer: number | undefined;

    const exchange = async () => {
      const { group: current, position: fix, sharing: isSharing } = latest.current;
      if (!current) return;
      const { channel, key } = await deriveLocationKeys(groupId);
      const me = current.myMemberId;
      const pendingOff = localStorage.getItem(sharingKey(groupId)) === OFF_PENDING;

      let write: SyncWrite | undefined;
      if (me && isSharing && fix && fix.accuracy <= MAX_SHARED_ACCURACY_M) {
        const d = await encryptLocation(key, { memberId: me, lat: fix.lat, lng: fix.lng, acc: fix.accuracy, t: fix.t });
        write = { m: await memberTag(channel, me), d };
      } else if (me && pendingOff) {
        write = { m: await memberTag(channel, me), d: null };
      }

      const entries = await exchangeLocations(channel, write);
      if (pendingOff && write?.d === null) localStorage.removeItem(sharingKey(groupId));

      const fixes = (await Promise.all(entries.map((data) => decryptLocation(key, data)))).filter((f) => f !== null);
      const allowed = new Set(current.members.filter((m) => m.id !== me).map((m) => m.id));
      const existing = await db.memberLocations.where('groupId').equals(groupId).toArray();
      const updates = newestLocations(groupId, fixes, existing, allowed);
      if (updates.length) await db.memberLocations.bulkPut(updates);
    };

    const run = async () => {
      if (cancelled || document.hidden) return;
      // Asked during an exchange (opt-in, first GPS fix): that one already read stale values.
      if (inFlight) {
        rerun = true;
        return;
      }
      window.clearTimeout(timer);
      inFlight = true;
      setSyncing(true);
      let ok = false;
      // navigator.onLine is only trusted when false: "true" says nothing on a saturated network.
      if (navigator.onLine) {
        try {
          await exchange();
          ok = true;
        } catch {
          // Failing is the normal case in a crowd; the next attempt comes from the timer below.
        }
      }
      inFlight = false;
      if (cancelled) return;
      setSyncing(false);
      setFailing(!ok);
      if (ok) setLastSync(Date.now());
      failures = ok ? 0 : failures + 1;
      if (rerun) {
        rerun = false;
        run();
        return;
      }
      timer = window.setTimeout(run, nextSyncDelay(failures));
    };
    runRef.current = run;

    const onVisibility = () => {
      if (!document.hidden) run();
    };
    run();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', run);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      runRef.current = () => undefined;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', run);
    };
  }, [groupId]);

  // The first exchange usually happens before the GPS has a fix.
  const hasFix = !!position;
  useEffect(() => {
    if (hasFix && sharing) runRef.current();
  }, [hasFix, sharing]);

  const setSharing = useCallback(
    (value: boolean) => {
      if (!groupId) return;
      localStorage.setItem(sharingKey(groupId), value ? '1' : OFF_PENDING);
      setSharingState(value);
      // Runs on the next tick so the exchange sees the new value.
      window.setTimeout(() => runRef.current(), 0);
    },
    [groupId],
  );

  const syncNow = useCallback(() => runRef.current(), []);

  const locations = (stored ?? []).filter(
    (l) => l.memberId !== group?.myMemberId && Date.now() - l.t < LOCATION_MAX_AGE_MS && group?.members.some((m) => m.id === l.memberId),
  );

  return { locations, sharing, setSharing, lastSync, failing, syncing, syncNow };
}

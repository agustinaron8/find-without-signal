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
  sharingKey,
  type SyncWrite,
} from '../lib/lastKnown';
import type { Position } from './useGeolocation';

// A worse fix would send people to the wrong side of the grounds.
const MAX_SHARED_ACCURACY_M = 200;
const OFF_PENDING = 'off';

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

    const locationWrite = async (channel: string, key: CryptoKey): Promise<SyncWrite | undefined> => {
      const { group: current, position: fix, sharing: isSharing } = latest.current;
      const me = current?.members.find((m) => m.id === current.myMemberId);
      if (!me || !isSharing || !fix || fix.accuracy > MAX_SHARED_ACCURACY_M) return undefined;
      const d = await encryptLocation(key, { memberId: me.id, lat: fix.lat, lng: fix.lng, acc: fix.accuracy, t: fix.t, name: me.name, color: me.color, phone: me.phone });
      return { m: await memberTag(channel, me.id), d };
    };

    const exchange = async () => {
      const { group: current } = latest.current;
      if (!current) return;
      const { channel, key } = await deriveLocationKeys(groupId);
      const me = current.myMemberId;
      const pendingOff = localStorage.getItem(sharingKey(groupId)) === OFF_PENDING;

      let write = await locationWrite(channel, key);
      if (!write && me && pendingOff) {
        write = { m: await memberTag(channel, me), d: null };
      }

      const entries = await exchangeLocations(channel, write);
      if (pendingOff && write?.d === null) localStorage.removeItem(sharingKey(groupId));

      const fixes = (await Promise.all(entries.map((data) => decryptLocation(key, data)))).filter((f) => f !== null);
      const existing = await db.memberLocations.where('groupId').equals(groupId).toArray();
      const updates = newestLocations(groupId, fixes, existing, me);
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

    // Web apps stop when the phone locks, so this is the last chance to leave a fresh location.
    const flushBeforeLock = async () => {
      try {
        const { channel, key } = await deriveLocationKeys(groupId);
        const write = await locationWrite(channel, key);
        if (write) await exchangeLocations(channel, write, (url, init) => fetch(url, { ...init, keepalive: true }));
      } catch {
        // Nothing else can be done from here; the next exchange happens when the screen comes back.
      }
    };

    const onVisibility = () => {
      if (document.hidden) flushBeforeLock();
      else run();
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
    (l) => l.memberId !== group?.myMemberId && Date.now() - l.t < LOCATION_MAX_AGE_MS && (!!l.name || group?.members.some((m) => m.id === l.memberId)),
  );

  return { locations, sharing, setSharing, lastSync, failing, syncing, syncNow };
}

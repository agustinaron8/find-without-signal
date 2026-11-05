import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  OFF_PENDING,
  sendWithoutWaiting,
  sharedAsKey,
  sharingKey,
  statusKey,
  type SyncWrite,
} from '../lib/lastKnown';
import type { Position } from './useGeolocation';

// A worse fix would send people to the wrong side of the grounds.
const MAX_SHARED_ACCURACY_M = 200;
// The last send has to leave without waiting for encryption, so it stays ready.
const PREPARE_EVERY_MS = 10 * 1000;

export function useLastKnown(group: Group | null | undefined, position: Position | null) {
  const groupId = group?.id;
  const stored = useLiveQuery(
    () => (groupId ? db.memberLocations.where('groupId').equals(groupId).toArray() : []),
    [groupId],
  );
  const [sharing, setSharingState] = useState(false);
  const [status, setStatusState] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [failing, setFailing] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const latest = useRef({ group, position, sharing });
  latest.current = { group, position, sharing };
  const runRef = useRef<() => void>(() => undefined);
  const prepared = useRef<{ channel: string; write: SyncWrite; at: number; me: string } | null>(null);

  useEffect(() => {
    if (!groupId) return;
    setSharingState(localStorage.getItem(sharingKey(groupId)) === '1');
    setStatusState(localStorage.getItem(statusKey(groupId)));
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
      const d = await encryptLocation(key, { memberId: me.id, lat: fix.lat, lng: fix.lng, acc: fix.accuracy, t: fix.t, name: me.name, color: me.color, phone: me.phone, status: localStorage.getItem(statusKey(groupId)) ?? undefined });
      return { m: await memberTag(channel, me.id), d };
    };

    const exchange = async () => {
      const { group: current } = latest.current;
      if (!current) return;
      const { channel, key } = await deriveLocationKeys(groupId);
      const me = current.myMemberId;
      const pendingOff = localStorage.getItem(sharingKey(groupId)) === OFF_PENDING;
      const sharedAs = localStorage.getItem(sharedAsKey(groupId));

      // Changed identity while sharing: the old name must not stay behind as a stale location.
      if (sharedAs && sharedAs !== me && !pendingOff) {
        await exchangeLocations(channel, { m: await memberTag(channel, sharedAs), d: null });
        localStorage.removeItem(sharedAsKey(groupId));
      }

      let write = await locationWrite(channel, key);
      const toRemove = sharedAs ?? me;
      if (!write && toRemove && pendingOff) {
        write = { m: await memberTag(channel, toRemove), d: null };
      }

      const entries = await exchangeLocations(channel, write);
      if (write?.d && me) localStorage.setItem(sharedAsKey(groupId), me);
      if (pendingOff && write?.d === null) {
        localStorage.removeItem(sharingKey(groupId));
        localStorage.removeItem(sharedAsKey(groupId));
      }

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
    const onVisibility = () => {
      if (!document.hidden) return void run();
      const ready = prepared.current;
      if (ready && latest.current.sharing && ready.me === latest.current.group?.myMemberId && navigator.onLine) {
        localStorage.setItem(sharedAsKey(groupId), ready.me);
        sendWithoutWaiting(ready.channel, ready.write);
      }
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

  // The first exchange usually happens before the GPS has a fix good enough to share.
  const canShareFix = !!position && position.accuracy <= MAX_SHARED_ACCURACY_M;
  useEffect(() => {
    if (canShareFix && sharing) runRef.current();
  }, [canShareFix, sharing]);

  const myMemberId = group?.myMemberId;
  useEffect(() => {
    if (!sharing || !canShareFix || !groupId || !myMemberId) {
      prepared.current = null;
      return;
    }
    if (prepared.current?.me === myMemberId && Date.now() - prepared.current.at < PREPARE_EVERY_MS) return;
    const { group: current, position: fix } = latest.current;
    const me = current?.members.find((m) => m.id === myMemberId);
    if (!me || !fix) return;
    const at = Date.now();
    (async () => {
      const { channel, key } = await deriveLocationKeys(groupId);
      const d = await encryptLocation(key, { memberId: me.id, lat: fix.lat, lng: fix.lng, acc: fix.accuracy, t: fix.t, name: me.name, color: me.color, phone: me.phone, status: localStorage.getItem(statusKey(groupId)) ?? undefined });
      prepared.current = { channel, write: { m: await memberTag(channel, me.id), d }, at, me: me.id };
    })().catch(() => undefined);
  }, [position, sharing, canShareFix, groupId, myMemberId, status]);

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

  const setStatus = useCallback(
    (value: string | null) => {
      if (!groupId) return;
      if (value) localStorage.setItem(statusKey(groupId), value);
      else localStorage.removeItem(statusKey(groupId));
      prepared.current = null;
      setStatusState(value);
      window.setTimeout(() => runRef.current(), 0);
    },
    [groupId],
  );

  const syncNow = useCallback(() => runRef.current(), []);

  // Memoized because the compass re-renders Meet many times per second, and a new array would rebuild the map.
  const members = group?.members;
  const locations = useMemo(
    () =>
      (stored ?? []).filter(
        (l) => l.memberId !== myMemberId && Date.now() - l.t < LOCATION_MAX_AGE_MS && (!!l.name || members?.some((m) => m.id === l.memberId)),
      ),
    [stored, myMemberId, members],
  );

  return { locations, sharing, setSharing, status, setStatus, lastSync, failing, syncing, syncNow };
}

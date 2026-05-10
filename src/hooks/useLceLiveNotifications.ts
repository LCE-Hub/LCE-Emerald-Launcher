import { useState, useEffect, useRef } from "react";
import { lceLiveService } from "../services/LceLiveService";
export function useLceLiveNotifications() {
  const [friendRequestMessage, setFriendRequestMessage] = useState<string | null>(null);
  const [gameInviteMessage, setGameInviteMessage] = useState<string | null>(null);
  const seenRequests = useRef<Set<string>>(new Set());
  const seenInvites = useRef<Set<string>>(new Set());
  useEffect(() => {
    let pollInterval: any;
    const init = async () => {
      if (lceLiveService.signedIn) {
        try {
          await lceLiveService.refreshSession();
        } catch (e) { }
      }

      if (lceLiveService.signedIn) {
        try {
          const [reqs, invs] = await Promise.all([
            lceLiveService.getPendingRequests(),
            lceLiveService.getGameInvites()
          ]);
          reqs.incoming.forEach((r: any) => seenRequests.current.add(r.accountId));
          invs.filter((i: any) => i.status === "pending").forEach((i: any) => seenInvites.current.add(i.inviteId));
        } catch (e) { }
      }

      pollInterval = setInterval(async () => {
        if (!lceLiveService.signedIn) return;
        try {
          const [reqs, invs] = await Promise.all([
            lceLiveService.getPendingRequests(),
            lceLiveService.getGameInvites()
          ]);

          reqs.incoming.forEach((r: any) => {
            if (!seenRequests.current.has(r.accountId)) {
              seenRequests.current.add(r.accountId);
              setFriendRequestMessage(`New request from ${r.displayName}`);
            }
          });

          invs.filter((i: any) => i.status === "pending").forEach((i: any) => {
            if (!seenInvites.current.has(i.inviteId)) {
              seenInvites.current.add(i.inviteId);
              const fromName = typeof i.from === 'string' ? "Unknown" : i.from.displayName;
              setGameInviteMessage(`${fromName} invited you to play!`);
            }
          });
        } catch (e) { }
      }, 10000);
    };

    init();
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, []);

  return {
    friendRequestMessage,
    gameInviteMessage,
    clearFriendRequestMessage: () => setFriendRequestMessage(null),
    clearGameInviteMessage: () => setGameInviteMessage(null),
  };
}

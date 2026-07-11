import { useState, useEffect, useRef } from "react";
import { lceOnlineService } from "../services/LceOnlineService";
export function useLceOnlineNotifications() {
  const [friendRequestMessage, setFriendRequestMessage] = useState<
    string | null
  >(null);
  const [InviteMessage, setInviteMessage] = useState<string | null>(null);
  const [invites, setInvites] = useState<
    Array<{
      inviteid: string;
      from: { uuid: string; username: string };
      sessionid: string;
    }>
  >([]);
  const seenRequests = useRef<Set<string>>(new Set());
  const seenInvites = useRef<Set<string>>(new Set());
  useEffect(() => {
    let pollInterval: ReturnType<typeof setInterval>;

    const poll = async () => {
      if (!lceOnlineService.signedIn) return;
      try {
        const lists = await lceOnlineService.getSocialLists();
        lists.requests.forEach((r: string) => {
          if (!seenRequests.current.has(r)) {
            seenRequests.current.add(r);
            setFriendRequestMessage(`New Friend request from ${r}`);
          }
        });
      } catch (e) {}
      try {
        const invitesData = await lceOnlineService.getInvites();
        setInvites(invitesData);
        invitesData.forEach((i) => {
          if (!seenInvites.current.has(i.inviteid)) {
            seenInvites.current.add(i.inviteid);
            setInviteMessage(`New invite from ${i.from.username}`);
          }
        });
      } catch {}
    };

    const init = async () => {
      if (lceOnlineService.signedIn) {
        try {
          const lists = await lceOnlineService.getSocialLists();
          lists.requests.forEach((r: string) => {
            if (!seenRequests.current.has(r)) {
              seenRequests.current.add(r);
              setFriendRequestMessage(`New Friend request from ${r}`);
            }
          });
        } catch (e) {}
        try {
          const invitesData = await lceOnlineService.getInvites();
          setInvites(invitesData);
          invitesData.forEach((i) => {
            if (!seenInvites.current.has(i.inviteid)) {
              seenInvites.current.add(i.inviteid);
              setInviteMessage(`New invite from ${i.from.username}`);
            }
          });
        } catch {}
      }
      pollInterval = setInterval(poll, 3000);
    };

    init();
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, []);

  return {
    friendRequestMessage,
    InviteMessage,
    clearFriendRequestMessage: () => setFriendRequestMessage(null),
    clearInviteMessage: () => setInviteMessage(null),
    invites,
  };
}

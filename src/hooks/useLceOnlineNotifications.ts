import { useState, useEffect, useRef } from "react";
import { lceOnlineService, SocialEntry, InviteEntry } from "../services/LceOnlineService";
export function useLceOnlineNotifications() {
  const [friendRequestMessage, setFriendRequestMessage] = useState<
    string | null
  >(null);
  const [InviteMessage, setInviteMessage] = useState<string | null>(null);
  const [invites, setInvites] = useState<InviteEntry[]>([]);
  const [requests, setRequests] = useState<SocialEntry[]>([]);
  const seenRequests = useRef<Set<string>>(new Set());
  const seenInvites = useRef<Set<string>>(new Set());
  useEffect(() => {
    let pollInterval: ReturnType<typeof setInterval>;

    const poll = async () => {
      if (!lceOnlineService.signedIn) return;
      try {
        const requestsData = await lceOnlineService.getSocialLists();
        setRequests(requestsData.requests);
        requestsData.requests.forEach((r) => {
          if (!seenRequests.current.has(r.username)) {
            seenRequests.current.add(r.username);
            setFriendRequestMessage(`${r.displayName} wants to be friends!`);
          }
        });
      } catch (e) {}
      try {
        const invitesData = await lceOnlineService.getInvites();
        setInvites(invitesData);
        invitesData.forEach((i) => {
          if (!seenInvites.current.has(i.inviteid)) {
            seenInvites.current.add(i.inviteid);
            setInviteMessage(`${i.from.displayName} invited you to play!`);
          }
        });
      } catch {}
    };

    const init = async () => {
      if (lceOnlineService.signedIn) {
        try {
          const requestData = await lceOnlineService.getSocialLists();
          setRequests(requestData.requests);
          requestData.requests.forEach((r) => {
            if (!seenRequests.current.has(r.username)) {
              seenRequests.current.add(r.username);
            }
          });
        } catch (e) {}
        try {
          const invitesData = await lceOnlineService.getInvites();
          setInvites(invitesData);
          invitesData.forEach((i) => {
            if (!seenInvites.current.has(i.inviteid)) {
              seenInvites.current.add(i.inviteid);
              setInviteMessage(`${i.from.displayName} invited you to play!`);
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
    requests,
  };
}

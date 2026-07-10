import { useState, useEffect, useRef } from "react";
import { lceOnlineService } from "../services/LceOnlineService";
export function useLceOnlineNotifications() {
  const [friendRequestMessage, setFriendRequestMessage] = useState<string | null>(null);
  const seenRequests = useRef<Set<string>>(new Set());
  useEffect(() => {
    let pollInterval: ReturnType<typeof setInterval>;

    const init = async () => {
      if (lceOnlineService.signedIn) {
        try {
          const lists = await lceOnlineService.getSocialLists();
          lists.requests.forEach((r: string) => seenRequests.current.add(r));
        } catch (e) { }
      }

      pollInterval = setInterval(async () => {
        if (!lceOnlineService.signedIn) return;
        try {
          const lists = await lceOnlineService.getSocialLists();
          lists.requests.forEach((r: string) => {
            if (!seenRequests.current.has(r)) {
              seenRequests.current.add(r);
              setFriendRequestMessage(`New request from ${r}`);
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
    clearFriendRequestMessage: () => setFriendRequestMessage(null),
  };
}

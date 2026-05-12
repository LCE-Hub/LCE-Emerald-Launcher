import { useState, useEffect, useRef, useMemo, memo } from "react";
import { motion } from "framer-motion";
import {
  useUI,
  useConfig,
  useAudio,
  useGame,
} from "../../context/LauncherContext";
import {
  lceLiveService,
  LceLiveAccount,
  FriendRequest,
  GameInvite,
} from "../../services/LceLiveService";
import { TauriService } from "../../services/TauriService";
import ChooseInstanceModal from "../modals/ChooseInstanceModal";

const LceLiveView = memo(function LceLiveView() {
  const { setActiveView } = useUI();
  const { animationsEnabled } = useConfig();
  const { playPressSound, playBackSound } = useAudio();
  const { editions, installs } = useGame();
  const [isSignedIn, setIsSignedIn] = useState(lceLiveService.signedIn);
  const [currentTab, setCurrentTab] = useState<
    "friends" | "requests" | "invites" | "device_link"
  >("friends");
  const [focusIndex, setFocusIndex] = useState<number | null>(0);
  const [acceptInvite, setAcceptInvite] = useState<GameInvite | null>(null);
  const [friends, setFriends] = useState<LceLiveAccount[]>([]);
  const [incomingReqs, setIncomingReqs] = useState<FriendRequest[]>([]);
  const [outgoingReqs, setOutgoingReqs] = useState<FriendRequest[]>([]);
  const [invites, setInvites] = useState<GameInvite[]>([]);
  const [linkData, setLinkData] = useState<any>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [isHosting, setIsHosting] = useState(false);
  const [hostStatus, setHostStatus] = useState("");
  const [hostIp, setHostIp] = useState("");
  const [hostPort, setHostPort] = useState(19132);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [invitedFriends, setInvitedFriends] = useState<Set<string>>(new Set());
  const [showHostMethodPicker, setShowHostMethodPicker] = useState(false);
  const [hostSessionId, setHostSessionId] = useState<string>("");
  const [hostMethodPick, setHostMethodPick] = useState<"direct" | "relay">(
    "direct",
  );
  const [relayStarted, setRelayStarted] = useState(false);
  const [isAddingFriend, setIsAddingFriend] = useState(false);
  const [addFriendUsername, setAddFriendUsername] = useState("");
  const addFriendInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fetchSocialData = async () => {
    console.log(outgoingReqs); //neo: dont judge. typescript wanted a use so i provided a use.
    if (!lceLiveService.signedIn) return;
    try {
      const [f, reqs, invs] = await Promise.all([
        lceLiveService.getFriends(),
        lceLiveService.getPendingRequests(),
        lceLiveService.getGameInvites(),
      ]);
      setFriends(f);
      setIncomingReqs(reqs.incoming);
      setOutgoingReqs(reqs.outgoing);
      setInvites(invs.filter((i: GameInvite) => i.status === "pending"));
    } catch (e: any) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (isSignedIn) {
      if (currentTab === "device_link") setCurrentTab("friends");
      fetchSocialData();
      const pollInvites = setInterval(async () => {
        try {
          const invs = await lceLiveService.getGameInvites();
          setInvites(invs.filter((i: GameInvite) => i.status === "pending"));
        } catch (e) {
          console.warn("Failed to poll invites", e);
        }
      }, 5000);

      return () => clearInterval(pollInvites);
    } else {
      setCurrentTab("device_link");
    }
  }, [isSignedIn, currentTab]);

  useEffect(() => {
    if (currentTab !== "device_link") return;
    let mounted = true;
    let pollInterval: any = null;
    const startLink = async () => {
      try {
        if (!linkData) {
          const data = await lceLiveService.startDeviceLink();
          if (mounted) setLinkData(data);
        }
      } catch (e: any) {
        if (mounted) setLinkError(e.message);
      }
    };

    startLink();
    if (linkData?.deviceCode) {
      pollInterval = setInterval(
        async () => {
          try {
            const res = await lceLiveService.pollDeviceLink(
              linkData.deviceCode,
            );
            if (res.isLinked && mounted) {
              setIsSignedIn(true);
              setLinkData(null);
              clearInterval(pollInterval);
            }
          } catch (e: any) {
            console.warn("Poll failed", e);
          }
        },
        Math.max(linkData.intervalSeconds * 1000, 2000),
      );
    }

    return () => {
      mounted = false;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [currentTab, linkData]);

  const handleLogout = () => {
    playPressSound();
    lceLiveService.logoutLocal();
    setIsSignedIn(false);
    setLinkData(null);
  };

  const handleAction = async (action: () => Promise<void>) => {
    playPressSound();
    try {
      await action();
      fetchSocialData();
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  const handleStartHosting = () => {
    playPressSound();
    setRelayStarted(false);
    setShowHostMethodPicker(true);
  };

  const handleHostDirect = async () => {
    setShowHostMethodPicker(false);
    setIsDiscovering(true);
    setHostStatus("Discovering external IP...");
    try {
      const endpoint = await TauriService.stunDiscover();
      setHostIp(endpoint.ip);
      setHostPort(25565);
      setIsHosting(true);
      setHostStatus(`Hosting at ${endpoint.ip}:25565`);
      setInvitedFriends(new Set());
      setHostSessionId("");
    } catch (e: any) {
      const msg = typeof e === "string" ? e : e?.message || "Unknown error";
      alert("STUN discovery failed: " + msg);
      setHostStatus("");
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleHostRelay = async () => {
    setShowHostMethodPicker(false);
    setIsDiscovering(true);
    setHostStatus("Discovering external IP for invite...");
    const sessionId = crypto.randomUUID();
    setHostSessionId(sessionId);
    try {
      const endpoint = await TauriService.stunDiscover();
      setHostIp(endpoint.ip);
      setHostPort(25565);
    } catch {
      setHostIp("127.0.0.1");
      setHostPort(25565);
    }
    setRelayStarted(false);
    setIsHosting(true);
    setHostStatus("Relay ready - invite friends to activate");
    setInvitedFriends(new Set());
    setIsDiscovering(false);
  };

  const handleStopHosting = async () => {
    playPressSound();
    try {
      await TauriService.stopProxy();
      await lceLiveService.deactivateGameInvites();
    } catch (e: any) {
      console.warn("Stop hosting failed", e);
    }
    setIsHosting(false);
    setHostStatus("");
    setHostIp("");
    setInvitedFriends(new Set());
    setHostSessionId("");
    setRelayStarted(false);
  };

  const handleInviteFriend = async (friend: LceLiveAccount) => {
    playPressSound();
    const name = lceLiveService.displayUsername;
    try {
      await lceLiveService.sendGameInvite(
        friend.accountId,
        hostIp,
        hostPort,
        name,
        hostSessionId || undefined,
      );
      setInvitedFriends((prev) => new Set(prev).add(friend.accountId));
      if (hostSessionId && !relayStarted) {
        setRelayStarted(true);
        setHostStatus("Connecting relay...");
        const baseUrl = lceLiveService.apiBaseUrl;
        const accessToken = lceLiveService.accessToken ?? "";
        TauriService.startHostRelay(baseUrl, accessToken, hostSessionId, 25565)
          .then(() => setHostStatus("Relay active"))
          .catch((relayErr: any) => {
            const relayMsg =
              typeof relayErr === "string"
                ? relayErr
                : relayErr?.message || "Unknown error";
            console.warn("Relay failed:", relayMsg);
            setHostStatus("Relay disconnected");
          });
      }
    } catch (e: any) {
      const msg = typeof e === "string" ? e : e?.message || "Unknown error";
      alert("Failed to send invite: " + msg);
    }
  };

  type MenuItem = {
    id: string;
    type: "button" | "friend" | "request_in" | "request_out" | "invite";
    label: string;
    onClick: () => void;
    onClickSecondary?: () => void;
  };

  const menuItems = useMemo<MenuItem[]>(() => {
    const items: MenuItem[] = [];
    if (currentTab === "device_link") {
      if (linkData) {
        items.push({
          id: "link_retry",
          type: "button",
          label: "Restart Link",
          onClick: () => {
            setLinkData(null);
            playPressSound();
          },
        });
      }
    } else if (currentTab === "friends") {
      if (!isDiscovering && !showHostMethodPicker) {
        if (!isHosting) {
          items.push({
            id: "host_game",
            type: "button",
            label: "Host Game",
            onClick: handleStartHosting,
          });
        } else {
          items.push({
            id: "stop_hosting",
            type: "button",
            label: "Stop Hosting",
            onClick: handleStopHosting,
          });
        }
      }
      items.push({
        id: "add_friend",
        type: "button",
        label: "Add Friend",
        onClick: () => {
          playPressSound();
          setIsAddingFriend(true);
          setAddFriendUsername("");
        },
      });
      items.push({
        id: "sign_out",
        type: "button",
        label: "Sign Out",
        onClick: handleLogout,
      });
      friends.forEach((f) => {
        items.push({
          id: `friend_${f.accountId}`,
          type: "friend",
          label: f.displayName,
          onClick: isHosting
            ? () => handleInviteFriend(f)
            : () =>
                handleAction(() => lceLiveService.removeFriend(f.accountId)),
          onClickSecondary: isHosting
            ? () => handleAction(() => lceLiveService.removeFriend(f.accountId))
            : undefined,
        });
      });
    } else if (currentTab === "requests") {
      incomingReqs.forEach((r) => {
        items.push({
          id: `req_in_${r.accountId}`,
          type: "request_in",
          label: r.displayName,
          onClick: () =>
            handleAction(() => lceLiveService.acceptFriendRequest(r.accountId)),
          onClickSecondary: () =>
            handleAction(() =>
              lceLiveService.declineFriendRequest(r.accountId),
            ),
        });
      });
    } else if (currentTab === "invites") {
      invites.forEach((inv) => {
        items.push({
          id: `inv_${inv.inviteId}`,
          type: "invite",
          label:
            typeof inv.from === "string" ? "Unknown" : inv.from.displayName,
          onClick: () => {
            playPressSound();
            setAcceptInvite(inv);
          },
          onClickSecondary: () =>
            handleAction(() => lceLiveService.declineGameInvite(inv.inviteId)),
        });
      });
    }

    return items;
  }, [
    currentTab,
    friends,
    incomingReqs,
    invites,
    linkData,
    playPressSound,
    isHosting,
    isDiscovering,
    showHostMethodPicker,
  ]);

  const tabs = ["friends", "requests", "invites"];
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isAddingFriend) {
        if (e.key === "Escape") {
          setIsAddingFriend(false);
          playBackSound();
        } else if (e.key === "Enter") {
          if (addFriendUsername.trim() !== "") {
            handleAction(() =>
              lceLiveService.sendFriendRequest(addFriendUsername.trim()),
            );
            setIsAddingFriend(false);
          }
        }
        return;
      }

      if (showHostMethodPicker) {
        if (e.key === "Escape" || e.key === "Backspace") {
          setShowHostMethodPicker(false);
          playBackSound();
        } else if (
          e.key === "ArrowLeft" ||
          e.key === "ArrowRight" ||
          e.key === "q" ||
          e.key === "Q" ||
          e.key === "e" ||
          e.key === "E"
        ) {
          setHostMethodPick((prev: "direct" | "relay") =>
            prev === "direct" ? "relay" : "direct",
          );
          playPressSound();
        } else if (e.key === "Enter") {
          if (hostMethodPick === "direct") handleHostDirect();
          else handleHostRelay();
        }
        return;
      }

      if (e.key === "Escape" || e.key === "Backspace") {
        playBackSound();
        setActiveView("main");
        return;
      }

      if (currentTab !== "device_link") {
        const curIdx = tabs.indexOf(currentTab);
        if (e.key === "q" || e.key === "Q" || e.key === "ArrowLeft") {
          const next = curIdx > 0 ? tabs[curIdx - 1] : tabs[tabs.length - 1];
          setCurrentTab(next as any);
          setFocusIndex(0);
          playPressSound();
          return;
        }
        if (e.key === "e" || e.key === "E" || e.key === "ArrowRight") {
          const next = curIdx < tabs.length - 1 ? tabs[curIdx + 1] : tabs[0];
          setCurrentTab(next as any);
          setFocusIndex(0);
          playPressSound();
          return;
        }
      }

      const itemCount = menuItems.length;
      if (itemCount > 0) {
        if (e.key === "ArrowDown") {
          setFocusIndex((prev) =>
            prev === null || prev >= itemCount - 1 ? 0 : prev + 1,
          );
        } else if (e.key === "ArrowUp") {
          setFocusIndex((prev) =>
            prev === null || prev <= 0 ? itemCount - 1 : prev - 1,
          );
        } else if (e.key === "Enter" && focusIndex !== null) {
          menuItems[focusIndex]?.onClick();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    focusIndex,
    menuItems,
    currentTab,
    playBackSound,
    setActiveView,
    isAddingFriend,
    addFriendUsername,
    showHostMethodPicker,
    hostMethodPick,
    handleHostDirect,
    handleHostRelay,
  ]);

  useEffect(() => {
    if (isAddingFriend && addFriendInputRef.current) {
      addFriendInputRef.current.focus();
    } else if (focusIndex !== null) {
      const el = containerRef.current?.querySelector(
        `[data-index="${focusIndex}"]`,
      ) as HTMLElement;
      if (el) {
        el.focus();
        if (scrollRef.current) {
          const rect = el.getBoundingClientRect();
          const scrollRect = scrollRef.current.getBoundingClientRect();
          if (rect.bottom > scrollRect.bottom || rect.top < scrollRect.top) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }
      }
    }
  }, [focusIndex, isAddingFriend]);
  const renderContent = () => {
    if (currentTab === "device_link") {
      return (
        <div className="flex flex-col items-center justify-center space-y-6 flex-1 text-center py-20">
          {!linkData ? (
            <p className="text-xl text-[#2a2a2a] font-bold">
              {linkError || "Starting device link..."}
            </p>
          ) : (
            <>
              <p className="text-2xl text-[#2a2a2a] font-bold">
                Open this link in your browser:
              </p>
              <p className="text-[#111] text-3xl font-bold tracking-widest break-words bg-black/10 px-6 py-2 rounded shadow-inner">
                {linkData.verificationUri}
              </p>
              <p className="text-2xl text-[#2a2a2a] font-bold mt-8">
                And enter the code:
              </p>
              <p className="text-[#111] text-6xl tracking-[0.2em] font-bold mt-2 bg-black/10 px-8 py-4 rounded shadow-inner">
                {linkData.userCode}
              </p>
            </>
          )}
        </div>
      );
    }

    const topButtons = menuItems.filter((m) => m.type === "button");
    const listItems = menuItems.filter((m) => m.type !== "button");
    return (
      <div className="flex flex-col h-full space-y-4">
        {showHostMethodPicker ? (
          <div className="flex gap-4 flex-wrap">
            <button
              onClick={handleHostDirect}
              className={`flex-1 h-12 flex items-center justify-center text-xl font-bold uppercase tracking-widest outline-none border-none transition-all ${hostMethodPick === "direct" ? "text-[#FFFF55] mc-text-shadow scale-[1.02] z-10 relative drop-shadow-md" : "text-white mc-text-shadow hover:text-gray-200"}`}
              style={{
                backgroundImage:
                  hostMethodPick === "direct"
                    ? "url('/images/button_highlighted.png')"
                    : "url('/images/Button_Background.png')",
                backgroundSize: "100% 100%",
                imageRendering: "pixelated",
              }}
            >
              Direct (STUN)
            </button>
            <button
              onClick={handleHostRelay}
              className={`flex-1 h-12 flex items-center justify-center text-xl font-bold uppercase tracking-widest outline-none border-none transition-all ${hostMethodPick === "relay" ? "text-[#FFFF55] mc-text-shadow scale-[1.02] z-10 relative drop-shadow-md" : "text-white mc-text-shadow hover:text-gray-200"}`}
              style={{
                backgroundImage:
                  hostMethodPick === "relay"
                    ? "url('/images/button_highlighted.png')"
                    : "url('/images/Button_Background.png')",
                backgroundSize: "100% 100%",
                imageRendering: "pixelated",
              }}
            >
              Relay
            </button>
            <button
              onClick={() => {
                setShowHostMethodPicker(false);
                playBackSound();
              }}
              className="flex-1 h-12 flex items-center justify-center text-xl font-bold uppercase tracking-widest outline-none border-none transition-all text-white mc-text-shadow hover:text-gray-200"
              style={{
                backgroundImage: "url('/images/Button_Background.png')",
                backgroundSize: "100% 100%",
                imageRendering: "pixelated",
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          topButtons.length > 0 && (
            <div className="flex gap-4 flex-wrap">
              {topButtons.map((btn) => {
                const idx = menuItems.indexOf(btn);
                const isFocused = focusIndex === idx;
                return (
                  <button
                    key={btn.id}
                    data-index={idx}
                    onMouseEnter={() => setFocusIndex(idx)}
                    onClick={btn.onClick}
                    className={`flex-1 h-12 flex items-center justify-center text-xl font-bold uppercase tracking-widest outline-none border-none transition-all ${isFocused ? "text-[#FFFF55] mc-text-shadow scale-[1.02] z-10 relative drop-shadow-md" : "text-white mc-text-shadow hover:text-gray-200"}`}
                    style={{
                      backgroundImage: isFocused
                        ? "url('/images/button_highlighted.png')"
                        : "url('/images/Button_Background.png')",
                      backgroundSize: "100% 100%",
                      imageRendering: "pixelated",
                    }}
                  >
                    {btn.label}
                  </button>
                );
              })}
            </div>
          )
        )}
        {hostStatus && (
          <div className="text-center text-sm text-[#FFFF55] mc-text-shadow py-1 tracking-wider">
            {hostStatus}
          </div>
        )}

        <div className="flex flex-col flex-1 bg-black/5 shadow-inner rounded overflow-hidden border-4 border-[#222]">
          <div className="bg-black/10 px-4 py-3 text-[#2a2a2a] font-bold tracking-widest uppercase border-b-4 border-[#222] flex justify-between shadow-sm z-10">
            <span>
              {currentTab === "friends"
                ? "Joinable Friends"
                : currentTab === "requests"
                  ? "Pending Requests"
                  : "Game Invites"}
            </span>
            <span className="text-[#111]">{listItems.length}</span>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto w-full">
            {listItems.length === 0 ? (
              <div className="flex items-center justify-center h-[200px] text-[#555] font-bold">
                None available
              </div>
            ) : (
              <div className="flex flex-col p-2 space-y-2">
                {listItems.map((item) => {
                  const idx = menuItems.indexOf(item);
                  const isFocused = focusIndex === idx;
                  return (
                    <div
                      key={item.id}
                      data-index={idx}
                      onMouseEnter={() => setFocusIndex(idx)}
                      className={`w-full flex items-center justify-between px-4 py-3 relative outline-none border-none rounded transition-all ${isFocused ? "bg-black/15 shadow-inner" : "bg-transparent hover:bg-black/5"}`}
                      tabIndex={-1}
                    >
                      <div className="flex items-center w-full">
                        <div className="flex flex-col ml-2 flex-1 min-w-0">
                          <span className="text-[#2a2a2a] font-bold text-2xl truncate pr-4">
                            {item.label}
                          </span>
                          <span className="text-[#555] text-base font-bold truncate">
                            @
                            {menuItems.find((m) => m.id === item.id)?.type ===
                            "friend"
                              ? friends.find(
                                  (f) => `friend_${f.accountId}` === item.id,
                                )?.username
                              : item.type === "request_in"
                                ? incomingReqs.find(
                                    (f) => `req_in_${f.accountId}` === item.id,
                                  )?.username
                                : "Invite"}
                          </span>
                        </div>
                      </div>
                      <div className="flex space-x-3 pr-2 shrink-0">
                        {item.type === "friend" && !isHosting && (
                          <button
                            className={`px-6 h-12 flex items-center justify-center font-bold text-base outline-none uppercase tracking-widest mc-text-shadow transition-transform ${isFocused ? "text-white scale-105 shadow-md" : "text-gray-300"}`}
                            style={{
                              backgroundImage:
                                "url('/images/Button_Background.png')",
                              backgroundSize: "100% 100%",
                              imageRendering: "pixelated",
                            }}
                            onClick={item.onClick}
                          >
                            REMOVE
                          </button>
                        )}
                        {item.type === "friend" && isHosting && (
                          <>
                            <button
                              className={`px-6 h-12 flex items-center justify-center font-bold text-base outline-none uppercase tracking-widest mc-text-shadow transition-transform ${isFocused ? "text-white scale-105 shadow-md" : "text-gray-300"}`}
                              style={{
                                backgroundImage:
                                  "url('/images/button_highlighted.png')",
                                backgroundSize: "100% 100%",
                                imageRendering: "pixelated",
                              }}
                              onClick={item.onClick}
                            >
                              {invitedFriends.has(
                                item.id.replace("friend_", ""),
                              )
                                ? "INVITED"
                                : "INVITE"}
                            </button>
                            <button
                              className={`px-6 h-12 flex items-center justify-center font-bold text-base outline-none uppercase tracking-widest mc-text-shadow transition-transform ${isFocused ? "text-white scale-105 shadow-md" : "text-gray-300"}`}
                              style={{
                                backgroundImage:
                                  "url('/images/Button_Background.png')",
                                backgroundSize: "100% 100%",
                                imageRendering: "pixelated",
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                item.onClickSecondary?.();
                              }}
                            >
                              REMOVE
                            </button>
                          </>
                        )}
                        {(item.type === "request_in" ||
                          item.type === "invite") && (
                          <>
                            <button
                              className={`px-6 h-12 flex items-center justify-center font-bold text-base outline-none uppercase tracking-widest mc-text-shadow transition-transform ${isFocused ? "text-white scale-105 shadow-md" : "text-gray-300"}`}
                              style={{
                                backgroundImage:
                                  "url('/images/button_highlighted.png')",
                                backgroundSize: "100% 100%",
                                imageRendering: "pixelated",
                              }}
                              onClick={item.onClick}
                            >
                              ACCEPT
                            </button>
                            <button
                              className={`px-6 h-12 flex items-center justify-center font-bold text-base outline-none uppercase tracking-widest mc-text-shadow transition-transform ${isFocused ? "text-white scale-105 shadow-md" : "text-gray-300"}`}
                              style={{
                                backgroundImage:
                                  "url('/images/Button_Background.png')",
                                backgroundSize: "100% 100%",
                                imageRendering: "pixelated",
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                item.onClickSecondary?.();
                              }}
                            >
                              DECLINE
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <motion.div
      ref={containerRef}
      tabIndex={-1}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: animationsEnabled ? 0.3 : 0 }}
      className="flex flex-col items-center justify-center w-full h-full absolute inset-0 outline-none p-12"
    >
      <div className="w-full max-w-5xl h-full flex flex-col mt-[4vh] mb-[4vh] relative drop-shadow-2xl">
        {currentTab !== "device_link" && (
          <div
            className="flex z-10 space-x-2 px-12 relative w-full items-end"
            style={{ marginBottom: "-4px" }}
          >
            {tabs.map((t) => (
              <button
                key={t}
                className={`flex-1 font-bold text-xl outline-none uppercase transition-all duration-200 ease-in-out ${currentTab === t ? "text-[#2a2a2a] z-20 pb-6 pt-5 text-2xl drop-shadow-[5px_-5px_15px_rgba(0,0,0,0.3)] rounded-t border-4 border-[#222] border-b-0" : "text-[#555] mt-2 py-4 hover:bg-black/30 bg-black/10 hover:text-[#222] border-4 border-transparent border-b-0"}`}
                style={{
                  backgroundImage: "url('/images/background.png')",
                  backgroundSize: "100% 100%",
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "bottom",
                  imageRendering: "pixelated",
                }}
                onClick={() => {
                  setCurrentTab(t as any);
                  setFocusIndex(0);
                  playPressSound();
                }}
              >
                <div className="flex items-center justify-center">
                  {t}
                  {t === "requests" && incomingReqs.length > 0 && (
                    <span
                      className={`ml-3 text-white text-base px-3 py-1 rounded-full shadow-inner border-2 font-normal ${currentTab === t ? "bg-[#d72f2f] border-[#8a1a1a]" : "bg-[#a81f1f] border-[#111]"}`}
                    >
                      {incomingReqs.length}
                    </span>
                  )}
                  {t === "invites" && invites.length > 0 && (
                    <span
                      className={`ml-3 text-white text-base px-3 py-1 rounded-full shadow-inner border-2 font-normal ${currentTab === t ? "bg-[#30872a] border-[#1b5e16]" : "bg-[#23681d] border-[#111]"}`}
                    >
                      {invites.length}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        <div
          className="flex-1 flex flex-col p-8 z-10 relative overflow-hidden rounded-b shadow-[0_0_30px_rgba(0,0,0,0.6)] border-4 border-[#222] border-t-0"
          style={{
            backgroundImage: "url('/images/background.png')",
            backgroundSize: "100% auto",
            backgroundRepeat: "repeat",
            backgroundPosition: "top",
            imageRendering: "pixelated",
          }}
        >
          {renderContent()}
        </div>
      </div>

      {isAddingFriend && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-50 bg-black/60">
          <div
            className="p-8 flex flex-col items-center max-w-xl w-full shadow-[0_0_30px_rgba(0,0,0,0.8)] relative rounded border-4 border-[#222]"
            style={{
              backgroundImage: "url('/images/background.png')",
              backgroundSize: "100% 100%",
              backgroundRepeat: "no-repeat",
              imageRendering: "pixelated",
            }}
          >
            <h3 className="text-4xl text-[#2a2a2a] mb-8 tracking-widest uppercase font-bold mc-text-shadow-light">
              Add Friend
            </h3>
            <input
              ref={addFriendInputRef}
              type="text"
              className="bg-black/10 border-4 border-[#222] text-[#2a2a2a] p-4 w-full text-3xl font-bold font-mojangles outline-none focus:bg-black/15 transition-colors placeholder:text-[#555] mb-10 shadow-inner rounded"
              placeholder="Username"
              value={addFriendUsername}
              onChange={(e) => setAddFriendUsername(e.target.value)}
            />
            <div className="flex gap-6 w-full">
              <button
                className="h-12 flex-1 flex items-center justify-center text-white mc-text-shadow text-xl font-bold uppercase tracking-widest transition-transform hover:text-[#FFFF55] hover:scale-105 shadow-md outline-none"
                style={{
                  backgroundImage: "url('/images/button_highlighted.png')",
                  backgroundSize: "100% 100%",
                  imageRendering: "pixelated",
                }}
                onClick={() => {
                  playPressSound();
                  if (addFriendUsername.trim() !== "") {
                    handleAction(() =>
                      lceLiveService.sendFriendRequest(
                        addFriendUsername.trim(),
                      ),
                    );
                    setIsAddingFriend(false);
                  }
                }}
              >
                Send
              </button>
              <button
                className="h-12 flex-1 flex items-center justify-center text-white mc-text-shadow text-xl font-bold uppercase tracking-widest transition-transform hover:text-[#FFFF55] hover:scale-105 shadow-md outline-none"
                style={{
                  backgroundImage: "url('/images/Button_Background.png')",
                  backgroundSize: "100% 100%",
                  imageRendering: "pixelated",
                }}
                onClick={() => {
                  setIsAddingFriend(false);
                  playBackSound();
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <ChooseInstanceModal
        isOpen={acceptInvite !== null}
        onClose={() => {
          setAcceptInvite(null);
          fetchSocialData();
        }}
        playPressSound={playPressSound}
        playBackSound={playBackSound}
        editions={editions}
        installs={installs}
        invite={acceptInvite}
      />
    </motion.div>
  );
});

export default LceLiveView;

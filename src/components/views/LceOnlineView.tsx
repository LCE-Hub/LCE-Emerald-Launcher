import { useState, useEffect, useRef, useMemo, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUI, useConfig, useAudio } from "../../context/LauncherContext";
import { lceOnlineService } from "../../services/LceOnlineService";
import { TauriService } from "../../services/TauriService";
interface LceOnlineViewProps {
  addFriendTarget?: string | null;
  onClearAddFriendTarget?: () => void;
}
const LceOnlineView = memo(function LceOnlineView({
  addFriendTarget,
  onClearAddFriendTarget,
}: LceOnlineViewProps) {
  const { setActiveView } = useUI();
  const { animationsEnabled } = useConfig();
  const { playPressSound, playBackSound } = useAudio();
  const [isSignedIn, setIsSignedIn] = useState(lceOnlineService.signedIn);
  const [currentTab, setCurrentTab] = useState<"friends" | "requests">(
    "friends",
  );
  const [focusIndex, setFocusIndex] = useState<number | null>(0);
  const [friends, setFriends] = useState<string[]>([]);
  const [incomingReqs, setIncomingReqs] = useState<string[]>([]);
  const [outgoingReqs, setOutgoingReqs] = useState<string[]>([]);
  const [isHosting, setIsHosting] = useState(false);
  const [_hostStatus, setHostStatus] = useState("");
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isAddingFriend, setIsAddingFriend] = useState(false);
  const [addFriendUsername, setAddFriendUsername] = useState("");
  const addFriendInputRef = useRef<HTMLInputElement>(null);
  const [errorModal, setErrorModal] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const authUserRef = useRef<HTMLInputElement>(null);
  const authPassRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fetchSocialData = async () => {
    if (!lceOnlineService.signedIn) return;
    try {
      const lists = await lceOnlineService.getSocialLists();
      setFriends(lists.friends);
      setIncomingReqs(lists.requests);
      setOutgoingReqs([]);
    } catch (e: unknown) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (isSignedIn) {
      fetchSocialData();
    }
  }, [isSignedIn]);

  useEffect(() => {
    if (!addFriendTarget) return;
    setCurrentTab("friends");
    handleAction(() => lceOnlineService.sendFriendRequest(addFriendTarget));
    onClearAddFriendTarget?.();
  }, [addFriendTarget, onClearAddFriendTarget]);

  const handleLogout = () => {
    playPressSound();
    lceOnlineService.logoutLocal();
    setIsSignedIn(false);
  };

  const handleAction = async (action: () => Promise<void>) => {
    playPressSound();
    try {
      await action();
      fetchSocialData();
    } catch (e: unknown) {
      setErrorModal(e instanceof Error ? e.message : "An error occurred");
    }
  };

  const handleStartHosting = async () => {
    playPressSound();
    setIsDiscovering(true);
    setHostStatus("Starting relay...");
    try {
      await TauriService.stunDiscover();
    } catch {}
    setIsHosting(true);
    setHostStatus("Relay ready");
    setIsDiscovering(false);
  };

  const handleStopHosting = async () => {
    playPressSound();
    try {
      await TauriService.stopAllProxies();
    } catch (e: unknown) {
      console.warn("Stop hosting failed", e);
    }
    setIsHosting(false);
    setHostStatus("");
  };

  const handleAuth = async () => {
    if (!authUsername.trim() || !authPassword.trim()) return;
    setIsAuthLoading(true);
    try {
      if (authMode === "login") {
        await lceOnlineService.login(authUsername.trim(), authPassword);
      } else {
        await lceOnlineService.register(authUsername.trim(), authPassword);
      }
      setIsSignedIn(true);
    } catch (e: unknown) {
      setErrorModal(e instanceof Error ? e.message : "Authentication failed");
    } finally {
      setIsAuthLoading(false);
    }
  };

  type MenuItem = {
    id: string;
    type: "button" | "friend" | "request_in" | "request_out";
    label: string;
    onClick: () => void;
    onClickSecondary?: () => void;
  };

  const menuItems = useMemo<MenuItem[]>(() => {
    const items: MenuItem[] = [];
    if (currentTab === "friends") {
      if (!isDiscovering) {
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
          id: `friend_${f}`,
          type: "friend",
          label: f,
          onClick: () => handleAction(() => lceOnlineService.removeFriend(f)),
        });
      });
    } else if (currentTab === "requests") {
      incomingReqs.forEach((r) => {
        items.push({
          id: `req_in_${r}`,
          type: "request_in",
          label: r,
          onClick: () =>
            handleAction(() => lceOnlineService.acceptFriendRequest(r)),
          onClickSecondary: () =>
            handleAction(() => lceOnlineService.declineFriendRequest(r)),
        });
      });
      outgoingReqs.forEach((r) => {
        items.push({
          id: `req_out_${r}`,
          type: "request_out",
          label: r,
          onClick: () =>
            handleAction(() => lceOnlineService.declineFriendRequest(r)),
        });
      });
    }

    return items;
  }, [
    currentTab,
    friends,
    incomingReqs,
    outgoingReqs,
    playPressSound,
    isHosting,
    isDiscovering,
  ]);

  const tabs: ("friends" | "requests")[] = ["friends", "requests"];
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (errorModal) {
        if (e.key === "Escape" || e.key === "Enter") {
          setErrorModal(null);
        }
        return;
      }

      if (isAddingFriend) {
        if (e.key === "Escape") {
          setIsAddingFriend(false);
          playBackSound();
        } else if (e.key === "Enter") {
          if (addFriendUsername.trim() !== "") {
            handleAction(() =>
              lceOnlineService.sendFriendRequest(addFriendUsername.trim()),
            );
            setIsAddingFriend(false);
          }
        }
        return;
      }

      if (!isSignedIn) {
        if (e.key === "Escape" || e.key === "Backspace") {
          playBackSound();
          setActiveView("main");
          return;
        }
        if (e.key === "Tab") {
          e.preventDefault();
          if (document.activeElement === authUserRef.current) {
            authPassRef.current?.focus();
          } else {
            authUserRef.current?.focus();
          }
          return;
        }
        if (e.key === "Enter") {
          handleAuth();
          return;
        }
        return;
      }

      if (e.key === "Escape" || e.key === "Backspace") {
        playBackSound();
        setActiveView("main");
        return;
      }

      const curIdx = tabs.indexOf(currentTab);
      if (e.key === "q" || e.key === "Q" || e.key === "ArrowLeft") {
        const next = curIdx > 0 ? tabs[curIdx - 1] : tabs[tabs.length - 1];
        setCurrentTab(next);
        setFocusIndex(0);
        playPressSound();
        return;
      }
      if (e.key === "e" || e.key === "E" || e.key === "ArrowRight") {
        const next = curIdx < tabs.length - 1 ? tabs[curIdx + 1] : tabs[0];
        setCurrentTab(next);
        setFocusIndex(0);
        playPressSound();
        return;
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
    errorModal,
    handleAuth,
    isSignedIn,
    authUsername,
    authPassword,
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
    if (!isSignedIn) {
      return (
        <div className="flex flex-col items-center justify-center flex-1 text-center py-12">
          <h2 className="text-[#FFFF55] text-3xl mc-text-shadow mb-8 border-b-2 border-[#373737] pb-2 w-full text-center uppercase tracking-widest">
            {authMode === "login" ? "Sign In" : "Register"}
          </h2>
          <input
            ref={authUserRef}
            type="text"
            className="bg-black/20 border-4 border-[#555] text-white p-4 w-full max-w-sm text-2xl font-bold outline-none focus:border-[#FFFF55] transition-colors placeholder:text-[#888] mb-4 mc-text-shadow"
            placeholder="Username"
            value={authUsername}
            onChange={(e) => setAuthUsername(e.target.value)}
            disabled={isAuthLoading}
          />
          <input
            ref={authPassRef}
            type="password"
            className="bg-black/20 border-4 border-[#555] text-white p-4 w-full max-w-sm text-2xl font-bold outline-none focus:border-[#FFFF55] transition-colors placeholder:text-[#888] mb-6 mc-text-shadow"
            placeholder="Password"
            value={authPassword}
            onChange={(e) => setAuthPassword(e.target.value)}
            disabled={isAuthLoading}
          />
          <div className="flex gap-4 w-full max-w-sm">
            <button
              className={`h-12 flex-1 flex items-center justify-center text-white mc-text-shadow text-xl font-bold uppercase tracking-widest hover:text-[#FFFF55] outline-none border-none ${isAuthLoading ? "opacity-50 pointer-events-none" : ""}`}
              style={{
                backgroundImage: "url('/images/button_highlighted.png')",
                backgroundSize: "100% 100%",
                imageRendering: "pixelated",
              }}
              onClick={handleAuth}
              disabled={isAuthLoading}
            >
              {isAuthLoading
                ? "..."
                : authMode === "login"
                  ? "Login"
                  : "Register"}
            </button>
            <button
              className={`h-12 flex-1 flex items-center justify-center text-white mc-text-shadow text-xl font-bold uppercase tracking-widest hover:text-[#FFFF55] outline-none border-none ${isAuthLoading ? "opacity-50 pointer-events-none" : ""}`}
              style={{
                backgroundImage: "url('/images/Button_Background.png')",
                backgroundSize: "100% 100%",
                imageRendering: "pixelated",
              }}
              onClick={() => {
                playPressSound();
                setAuthMode(authMode === "login" ? "register" : "login");
              }}
              disabled={isAuthLoading}
            >
              {authMode === "login" ? "Register" : "Login"}
            </button>
          </div>
        </div>
      );
    }

    const topButtons = menuItems.filter((m) => m.type === "button");
    const listItems = menuItems.filter((m) => m.type !== "button");
    return (
      <div className="flex flex-col h-full space-y-4">
        {topButtons.length > 0 && (
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
        )}

        <div className="flex flex-col flex-1 bg-black/5 shadow-inner rounded overflow-hidden border-4 border-[#222]">
          <div className="bg-black/10 px-4 py-3 text-[#2a2a2a] font-bold tracking-widest uppercase border-b-4 border-[#222] flex justify-between shadow-sm z-10">
            <span>
              {currentTab === "friends" ? "Friends" : "Pending Requests"}
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
                      className={`w-full flex items-center justify-between px-4 py-3 relative outline-none border-none rounded ${isFocused ? "bg-black/15 shadow-inner" : "bg-transparent"}`}
                      tabIndex={-1}
                    >
                      <div className="flex items-center w-full">
                        <div className="flex flex-col ml-2 flex-1 min-w-0">
                          <span className="text-[#2a2a2a] font-bold text-2xl truncate pr-4">
                            {item.label}
                          </span>
                        </div>
                      </div>
                      <div className="flex space-x-3 pr-2 shrink-0">
                        {item.type === "friend" && (
                          <button
                            className={`px-6 h-12 flex items-center justify-center font-bold text-base outline-none uppercase tracking-widest mc-text-shadow ${isFocused ? "text-white shadow-md" : "text-gray-300"}`}
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
                        {item.type === "request_out" && (
                          <button
                            className={`px-6 h-12 flex items-center justify-center font-bold text-base outline-none uppercase tracking-widest mc-text-shadow ${isFocused ? "text-white shadow-md" : "text-gray-300"}`}
                            style={{
                              backgroundImage:
                                "url('/images/Button_Background.png')",
                              backgroundSize: "100% 100%",
                              imageRendering: "pixelated",
                            }}
                            onClick={item.onClick}
                          >
                            CANCEL
                          </button>
                        )}
                        {item.type === "request_in" && (
                          <>
                            <button
                              className={`px-6 h-12 flex items-center justify-center font-bold text-base outline-none uppercase tracking-widest mc-text-shadow ${isFocused ? "text-white shadow-md" : "text-gray-300"}`}
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
                              className={`px-6 h-12 flex items-center justify-center font-bold text-base outline-none uppercase tracking-widest mc-text-shadow ${isFocused ? "text-white shadow-md" : "text-gray-300"}`}
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
        {isSignedIn && (
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
                  setCurrentTab(t);
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
            backgroundRepeat: "no-repeat",
            backgroundPosition: "top",
            imageRendering: "pixelated",
          }}
        >
          {renderContent()}
        </div>
      </div>

      <AnimatePresence>
        {isAddingFriend && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm outline-none border-none"
          >
            <div
              className="relative w-[420px] p-8 flex flex-col items-center shadow-2xl"
              style={{
                backgroundImage: "url('/images/frame_background.png')",
                backgroundSize: "100% 100%",
                imageRendering: "pixelated",
              }}
            >
              <h2 className="text-[#FFFF55] text-3xl mc-text-shadow mb-6 border-b-2 border-[#373737] pb-2 w-full text-center uppercase tracking-widest">
                Add Friend
              </h2>
              <input
                ref={addFriendInputRef}
                type="text"
                className="bg-black/20 border-4 border-[#555] text-white p-4 w-full text-2xl font-bold outline-none focus:border-[#FFFF55] transition-colors placeholder:text-[#888] mb-6 mc-text-shadow"
                placeholder="Username"
                value={addFriendUsername}
                onChange={(e) => setAddFriendUsername(e.target.value)}
              />
              <div className="flex gap-4 w-full">
                <button
                  className="h-12 flex-1 flex items-center justify-center text-white mc-text-shadow text-xl font-bold uppercase tracking-widest hover:text-[#FFFF55] outline-none border-none"
                  style={{
                    backgroundImage: "url('/images/button_highlighted.png')",
                    backgroundSize: "100% 100%",
                    imageRendering: "pixelated",
                  }}
                  onClick={() => {
                    playPressSound();
                    if (addFriendUsername.trim() !== "") {
                      handleAction(() =>
                        lceOnlineService.sendFriendRequest(
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
                  className="h-12 flex-1 flex items-center justify-center text-white mc-text-shadow text-xl font-bold uppercase tracking-widest hover:text-[#FFFF55] outline-none border-none"
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
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {errorModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm outline-none border-none"
          >
            <div
              className="relative w-[400px] p-8 flex flex-col items-center shadow-2xl"
              style={{
                backgroundImage: "url('/images/frame_background.png')",
                backgroundSize: "100% 100%",
                imageRendering: "pixelated",
              }}
            >
              <h2 className="text-[#FFFF55] text-2xl mc-text-shadow mb-4 border-b-2 border-[#373737] pb-2 w-full text-center uppercase tracking-widest">
                Error
              </h2>
              <p className="text-white text-lg mc-text-shadow text-center mb-6">
                {errorModal}
              </p>
              <button
                className="h-12 w-48 flex items-center justify-center text-white mc-text-shadow text-xl font-bold uppercase tracking-widest hover:text-[#FFFF55] outline-none border-none"
                style={{
                  backgroundImage: "url('/images/button_highlighted.png')",
                  backgroundSize: "100% 100%",
                  imageRendering: "pixelated",
                }}
                onClick={() => setErrorModal(null)}
              >
                OK
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

export default LceOnlineView;

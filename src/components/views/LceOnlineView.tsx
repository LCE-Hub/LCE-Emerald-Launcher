import { useState, useEffect, useRef, useMemo, memo } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import {
  useUI,
  useConfig,
  useAudio,
  useGame,
} from "../../context/LauncherContext";
import ChooseInstanceModal from "../modals/ChooseInstanceModal";
import { usePlatform } from "../../hooks/usePlatform";
import { lceOnlineService, SocialEntry } from "../../services/LceOnlineService";
import { TauriService } from "../../services/TauriService";
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { listen } from "@tauri-apps/api/event";
interface LceOnlineViewProps {
  addFriendTarget?: string | null;
  onClearAddFriendTarget?: () => void;
  invites?: Array<{
    inviteid: string;
    from: { uuid: string; username: string };
    sessionid: string;
  }>;
}
const LceOnlineView = memo(function LceOnlineView({
  addFriendTarget,
  onClearAddFriendTarget,
  invites: invitesProp,
}: LceOnlineViewProps) {
  const { t } = useTranslation();
  const { setActiveView, setIsUiHidden } = useUI();
  const { animationsEnabled } = useConfig();
  const { playPressSound, playBackSound } = useAudio();
  const { isAndroid } = usePlatform();
  const game = useGame();
  const [isSignedIn, setIsSignedIn] = useState(lceOnlineService.signedIn);
  const opened = useRef(false);
  const [currentTab, setCurrentTab] = useState<
    "friends" | "requests" | "invites"
  >("friends");
  const [focusIndex, setFocusIndex] = useState<number | null>(0);
  const [friends, setFriends] = useState<SocialEntry[]>([]);
  const [incomingReqs, setIncomingReqs] = useState<SocialEntry[]>([]);
  const [outgoingReqs, setOutgoingReqs] = useState<SocialEntry[]>([]);
  const invites = invitesProp ?? [];
  const [isHosting, setIsHosting] = useState(lceOnlineService.isHosting);
  const [isAddingFriend, setIsAddingFriend] = useState(false);
  const [addFriendUsername, setAddFriendUsername] = useState("");
  const addFriendInputRef = useRef<HTMLInputElement>(null);
  const [errorModal, setErrorModal] = useState<string | null>(null);
  const [joinTarget, setJoinTarget] = useState<{
    inviteid: string;
    sessionId: string;
    hostName: string;
  } | null>(null);
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
    return lceOnlineService.onSessionChange(() => {
      setIsSignedIn(lceOnlineService.signedIn);
      setIsHosting(lceOnlineService.isHosting);
    });
  }, []);

  useEffect(() => {
    if (isSignedIn) return;

    if (!opened.current) {
      opened.current = true;
      if (isAndroid) {
        TauriService.startLceOnlineAuth()
          .then((token) => {
            lceOnlineService
              .loginWithTokenAndFetchAccount(token)
              .catch((e) => console.error(e));
            setIsSignedIn(true);
          })
          .catch((e) => console.error("LCE Online auth failed", e));
      } else {
        new WebviewWindow('LCEOnline', {
          url: "https://mclegacyedition.xyz/internal/auth?appId=emerald_launcher",
          width: 400,
          height: 570,
          resizable: false,
          title: 'Emerald Legacy Launcher - LCEOnline',
        });
      }
    };

    const unlisten = listen<string[]>('deep-link', async (event) => {
      const authUrl = event.payload.find(u => u.startsWith('emerald://'));
      if (!authUrl) return;
      const token = new URL(authUrl).searchParams.get('token');
      if (token) {
        lceOnlineService
          .loginWithTokenAndFetchAccount(token)
          .catch((e) => console.error(e));
        setIsSignedIn(true);
      }
      (await WebviewWindow.getByLabel('LCEOnline'))?.close();
    });

    return () => { unlisten.then(f => f()); };
  }, [isSignedIn, isAndroid]);

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

  const handleStartHosting = async () => {
    playPressSound();
    try {
      const token = lceOnlineService.accessToken ?? "";
      if (!token) return;
      TauriService.startHostRelay(token, 25565).catch(() => {});
      lceOnlineService.isHosting = true;
    } catch (e: unknown) {
      setErrorModal(e instanceof Error ? e.message : t("lceOnline.failedToStartHosting"));
    }
  };

  const handleStopHosting = async () => {
    playPressSound();
    try {
      await TauriService.stopAllProxies();
    } catch (e: unknown) {
      console.warn("Stop hosting failed", e);
    }
    lceOnlineService.isHosting = false;
  };

  const handleAction = async (action: () => Promise<void>) => {
    playPressSound();
    try {
      await action();
      fetchSocialData();
    } catch (e: unknown) {
      setErrorModal(e instanceof Error ? e.message : t("lceOnline.anErrorOccurred"));
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
    if (currentTab === "friends") {
      if (!isHosting) {
        items.push({
          id: "host_game",
          type: "button",
          label: t("lceOnline.hostGame"),
          onClick: handleStartHosting,
        });
      } else {
        items.push({
          id: "stop_hosting",
          type: "button",
          label: t("lceOnline.stopHosting"),
          onClick: handleStopHosting,
        });
      }
      items.push({
        id: "add_friend",
        type: "button",
        label: t("lceOnline.addFriend"),
        onClick: () => {
          playPressSound();
          setIsAddingFriend(true);
          setAddFriendUsername("");
        },
      });
      items.push({
        id: "sign_out",
        type: "button",
        label: t("lceOnline.signOut"),
        onClick: handleLogout,
      });
      friends.forEach((f) => {
        items.push({
          id: `friend_${f.username}`,
          type: "friend",
          label: f.displayName || f.username,
          onClick: () => handleAction(() => lceOnlineService.removeFriend(f.username)),
          onClickSecondary: isHosting
            ? () => handleAction(() => lceOnlineService.sendInvite(f.username))
            : undefined,
        });
      });
    } else if (currentTab === "requests") {
      incomingReqs.forEach((r) => {
        items.push({
          id: `req_in_${r.username}`,
          type: "request_in",
          label: r.displayName || r.username,
          onClick: () =>
            handleAction(() => lceOnlineService.acceptFriendRequest(r.username)),
          onClickSecondary: () =>
            handleAction(() => lceOnlineService.declineFriendRequest(r.username)),
        });
      });
      outgoingReqs.forEach((r) => {
        items.push({
          id: `req_out_${r.username}`,
          type: "request_out",
          label: r.displayName || r.username,
          onClick: () =>
            handleAction(() => lceOnlineService.declineFriendRequest(r.username)),
        });
      });
    } else if (currentTab === "invites") {
      invites.forEach((inv) => {
        items.push({
          id: `invite_${inv.inviteid}`,
          type: "invite",
          label: inv.from.username,
          onClick: () =>
            handleAction(async () => {
              const sessionId = await lceOnlineService.acceptInvite(
                inv.from.username,
              );
              setJoinTarget({
                inviteid: inv.inviteid,
                sessionId,
                hostName: inv.from.username,
              });
            }),
          onClickSecondary: () =>
            handleAction(() =>
              lceOnlineService.declineInvite(inv.from.username),
            ),
        });
      });
    }

    return items;
  }, [
    currentTab,
    friends,
    incomingReqs,
    outgoingReqs,
    invites,
    playPressSound,
    isHosting,
    t,
  ]);

  const tabs: ("friends" | "requests" | "invites")[] = [
    "friends",
    "requests",
    "invites",
  ];
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
    isSignedIn,
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

  const touhouOverlayRef = useRef<HTMLDivElement | null>(null);
  const touhouBlobUrlRef = useRef<string | null>(null);
  const touhouAudioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const GIF_URL =
      "https://raw.githubusercontent.com/neoapps-dev/neoapps-dev/main/badapple_small.gif";
    const MP3_URL =
      "https://raw.githubusercontent.com/Soldr/bad-apple-but-its-node.js/master/bad-apple.mp3";

    const stopAudio = () => {
      if (touhouAudioRef.current) {
        touhouAudioRef.current.pause();
        touhouAudioRef.current.src = "";
        touhouAudioRef.current = null;
      }
    };

    const onlineUser = lceOnlineService.account?.username;
    if (onlineUser === "TOUHOU") {
      if (!touhouOverlayRef.current) {
        setIsUiHidden(true);
        const overlay = document.createElement("div");
        overlay.style.cssText =
          "position:fixed;inset:0;z-index:99999;background:#000;display:flex;align-items:center;justify-content:center;cursor:pointer";
        const spinner = document.createElement("div");
        spinner.textContent = "Loading...";
        spinner.style.cssText =
          "color:#fff;font-family:'Mojangles',monospace;font-size:24px;letter-spacing:4px";
        overlay.appendChild(spinner);
        document.body.appendChild(overlay);
        const img = document.createElement("img");
        img.style.cssText = "width:100%;height:100%;object-fit:contain";
        const audio = new Audio(MP3_URL);
        audio.loop = true;
        audio.volume = 0.5;
        touhouAudioRef.current = audio;
        const audioReady = new Promise<void>((resolve) => {
          if (audio.readyState >= 3) resolve();
          else {
            audio.oncanplaythrough = () => resolve();
            audio.onerror = () => resolve();
          }
        });

        const gifReady = fetch(GIF_URL)
          .then((r) => r.arrayBuffer())
          .then((buf) => {
            const blob = new Blob([buf], { type: "image/gif" });
            const url = URL.createObjectURL(blob);
            touhouBlobUrlRef.current = url;
            img.src = url;
            return new Promise<void>((resolve) => {
              if (img.complete) resolve();
              else {
                img.onload = () => resolve();
                img.onerror = () => resolve();
              }
            });
          })
          .catch(() => {
            img.src = GIF_URL;
            return new Promise<void>((resolve) => {
              if (img.complete) resolve();
              else {
                img.onload = () => resolve();
                img.onerror = () => resolve();
              }
            });
          });

        Promise.all([gifReady, audioReady]).then(() => {
          spinner.remove();
          overlay.appendChild(img);
          audio.currentTime = 2;
          audio.play().catch(() => {});
        });

        const cleanup = () => {
          stopAudio();
          setIsUiHidden(false);
          if (overlay.parentNode) overlay.remove();
          touhouOverlayRef.current = null;
          if (touhouBlobUrlRef.current) {
            URL.revokeObjectURL(touhouBlobUrlRef.current);
            touhouBlobUrlRef.current = null;
          }
        };
        overlay.onclick = cleanup;
        touhouOverlayRef.current = overlay;
      }
    } else {
      if (touhouOverlayRef.current) {
        stopAudio();
        touhouOverlayRef.current.remove();
        touhouOverlayRef.current = null;
        if (touhouBlobUrlRef.current) {
          URL.revokeObjectURL(touhouBlobUrlRef.current);
          touhouBlobUrlRef.current = null;
        }
        setIsUiHidden(false);
      }
    }
    return () => {
      stopAudio();
      setIsUiHidden(false);
      if (touhouOverlayRef.current) {
        touhouOverlayRef.current.remove();
        touhouOverlayRef.current = null;
        if (touhouBlobUrlRef.current) {
          URL.revokeObjectURL(touhouBlobUrlRef.current);
          touhouBlobUrlRef.current = null;
        }
      }
    };
  }, [isSignedIn, setIsUiHidden]);

  const renderContent = () => {
    if (!isSignedIn) {
      return (
        <div className="flex flex-col items-center justify-center flex-1 text-center py-12">
          <h2 className="text-[#FFFF55] text-3xl mc-text-shadow mb-8 pb-2 w-full text-center uppercase tracking-widest">
            <img
              src="/images/lceonline.png"
              alt="LCE Online"
              className="h-16 mx-auto"
            />
          </h2>
          <p className="text-white text-lg mc-text-shadow mb-8 max-w-sm">
            {t("lceOnline.awaitingAuthentication")}
          </p>
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
              {currentTab === "friends"
                ? t("lceOnline.friends")
                : currentTab === "invites"
                  ? t("lceOnline.invites")
                  : t("lceOnline.pendingRequests")}
            </span>
            <span className="text-[#111]">{listItems.length}</span>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto w-full">
            {listItems.length === 0 ? (
              <div className="flex items-center justify-center h-[200px] text-[#555] font-bold">
                {t("lceOnline.noneAvailable")}
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
                          <span className="text-[#555] text-base font-bold truncate">
                            @
                            {item.type === "friend"
                              ? friends.find((f) => `friend_${f.username}` === item.id)?.username
                              : item.type === "request_in"
                                ? incomingReqs.find((r) => `req_in_${r.username}` === item.id)?.username
                                : item.type === "request_out"
                                  ? outgoingReqs.find((r) => `req_out_${r.username}` === item.id)?.username
                                  : t("lceOnline.invite")}
                          </span>
                        </div>
                      </div>
                      <div className="flex space-x-3 pr-2 shrink-0">
                        {item.type === "friend" && (
                          <>
                            {item.onClickSecondary && (
                              <button
                                className={`px-6 h-12 flex items-center justify-center font-bold text-base outline-none uppercase tracking-widest mc-text-shadow ${isFocused ? "text-white shadow-md" : "text-gray-300"}`}
                                style={{
                                  backgroundImage:
                                    "url('/images/button_highlighted.png')",
                                  backgroundSize: "100% 100%",
                                  imageRendering: "pixelated",
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  item.onClickSecondary?.();
                                }}
                              >
                                {t("lceOnline.invite").toUpperCase()}
                              </button>
                            )}
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
                              {t("lceOnline.remove").toUpperCase()}
                            </button>
                          </>
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
                            {t("lceOnline.cancel").toUpperCase()}
                          </button>
                        )}
                        {item.type === "invite" && (
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
                              {t("lceOnline.accept").toUpperCase()}
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
                              {t("lceOnline.decline").toUpperCase()}
                            </button>
                          </>
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
                              {t("lceOnline.accept").toUpperCase()}
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
                              {t("lceOnline.decline").toUpperCase()}
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
            {tabs.map((tab) => (
              <button
                key={tab}
                className={`flex-1 font-bold text-xl outline-none uppercase transition-all duration-200 ease-in-out ${currentTab === tab ? "text-[#2a2a2a] z-20 pb-6 pt-5 text-2xl drop-shadow-[5px_-5px_15px_rgba(0,0,0,0.3)] rounded-t border-4 border-[#222] border-b-0" : "text-[#555] mt-2 py-4 hover:bg-black/30 bg-black/10 hover:text-[#222] border-4 border-transparent border-b-0"}`}
                style={{
                  backgroundImage: "url('/images/background.png')",
                  backgroundSize: "100% 100%",
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "bottom",
                  imageRendering: "pixelated",
                }}
                onClick={() => {
                  setCurrentTab(tab);
                  setFocusIndex(0);
                  playPressSound();
                }}
              >
                <div className="flex items-center justify-center">
                  {tab === "friends"
                    ? t("lceOnline.friends")
                    : tab === "requests"
                      ? t("lceOnline.requests")
                      : t("lceOnline.invites")}
                  {tab === "requests" && incomingReqs.length > 0 && (
                    <span
                      className={`ml-3 text-white text-base px-3 py-1 rounded-full shadow-inner border-2 font-normal ${currentTab === tab ? "bg-[#d72f2f] border-[#8a1a1a]" : "bg-[#a81f1f] border-[#111]"}`}
                    >
                      {incomingReqs.length}
                    </span>
                  )}
                  {tab === "invites" && invites.length > 0 && (
                    <span
                      className={`ml-3 text-white text-base px-3 py-1 rounded-full shadow-inner border-2 font-normal ${currentTab === tab ? "bg-[#d72f2f] border-[#8a1a1a]" : "bg-[#a81f1f] border-[#111]"}`}
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
            backgroundRepeat: "no-repeat",
            backgroundPosition: "top",
            imageRendering: "pixelated",
          }}
        >
          {renderContent()}
        </div>
          <div className="flex justify-center pt-4 pb-2">
          <img
            src="/images/lceonline.png"
            alt="LCEOnline"
            className="h-5 opacity-70 cursor-pointer"
            onClick={() => TauriService.openUrl("https://mclegacyedition.xyz/")}
          />
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
                {t("lceOnline.addFriend")}
              </h2>
              <input
                ref={addFriendInputRef}
                type="text"
                className="bg-black/20 border-4 border-[#555] text-white p-4 w-full text-2xl font-bold outline-none focus:border-[#FFFF55] transition-colors placeholder:text-[#888] mb-6 mc-text-shadow"
                placeholder={t("lceOnline.username")}
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
                    {t("lceOnline.send")}
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
                    {t("lceOnline.cancel")}
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
                {t("lceOnline.error")}
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
                {t("lceOnline.ok")}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {joinTarget && (
        <ChooseInstanceModal
          isOpen={true}
          onClose={() => setJoinTarget(null)}
          playPressSound={playPressSound}
          playBackSound={playBackSound}
          editions={game.editions}
          installs={game.installs}
          invite={{
            inviteId: joinTarget.inviteid,
            from: joinTarget.hostName,
            hostIp: "",
            hostPort: 0,
            hostName: joinTarget.hostName,
            sessionId: joinTarget.sessionId,
            status: "pending",
          }}
        />
      )}
    </motion.div>
  );
});

export default LceOnlineView;

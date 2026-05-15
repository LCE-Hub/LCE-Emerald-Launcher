import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { TauriService } from "../../services/TauriService";
import { lceLiveService, GameInvite } from "../../services/LceLiveService";

export default function ChooseInstanceModal({
  isOpen,
  onClose,
  playPressSound,
  playBackSound,
  editions,
  installs,
  invite,
}: {
  isOpen: boolean;
  onClose: () => void;
  playPressSound: (s?: string) => void;
  playBackSound: (s?: string) => void;
  editions: any[];
  installs: string[];
  invite: GameInvite | null;
}) {
  const [selectedInstance, setSelectedInstance] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isJoining, setIsJoining] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);

  const validInstances = editions.filter((e: any) =>
    installs.includes(e.instanceId)
  );

  useEffect(() => {
    if (!isOpen) {
      setSelectedInstance("");
      setStatus("");
      setError("");
      setIsJoining(false);
      setFocusIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && validInstances.length > 0 && !selectedInstance) {
      setSelectedInstance(validInstances[0].instanceId);
    }
  }, [isOpen, validInstances, selectedInstance]);

  const handleJoin = async () => {
    if (!invite || !selectedInstance) return;
    playPressSound();
    setIsJoining(true);
    setError("");
    setStatus("Accepting invite...");
    try {
      const inviteData = await lceLiveService.acceptGameInvite(invite.inviteId);
      const hostIp = inviteData.hostIp || (typeof invite.from !== 'string' && (invite as any).from?.hostIp);
      const hostPort = inviteData.hostPort || invite.hostPort;
      const sessionId = inviteData.signalingSessionId || invite.signalingSessionId || "";

      if (sessionId) {
        setStatus("Connecting via relay...");
        const baseUrl = lceLiveService.apiBaseUrl;
        const accessToken = lceLiveService.accessToken ?? "";
        const port = await TauriService.startRelayProxy(baseUrl, accessToken, sessionId);
        setStatus("Launching game...");
        await TauriService.launchGame(selectedInstance, [
          { name: invite.hostName || "LCELive Game", ip: "127.0.0.1", port }
        ]);
      } else {
        setStatus("Launching game...");
        await TauriService.stopProxy();
        await TauriService.launchGame(selectedInstance, [
          { name: invite.hostName || "LCELive Game", ip: hostIp, port: hostPort }
        ]);
      }
      onClose();
    } catch (e: any) {
      setError(e.toString());
      setStatus("");
      setIsJoining(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        playBackSound();
        if (isJoining) return;
        onClose();
      } else if (e.key === "ArrowDown" || e.key === "Tab") {
        e.preventDefault();
        const max = 1 + (validInstances.length > 0 ? 1 : 0) + 1;
        setFocusIndex((prev) => (prev + 1) % max);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const max = 1 + (validInstances.length > 0 ? 1 : 0) + 1;
        setFocusIndex((prev) => (prev - 1 + max) % max);
      } else if (e.key === "Enter") {
        if (focusIndex === 0 && validInstances.length > 0) {
          const currentIdx = validInstances.findIndex((i: any) => i.instanceId === selectedInstance);
          const next = (currentIdx + 1) % validInstances.length;
          setSelectedInstance(validInstances[next].instanceId);
          playPressSound();
        } else if (focusIndex === 1 && !isJoining) {
          handleJoin();
        } else if (focusIndex === (validInstances.length > 0 ? 2 : 1) && !isJoining) {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, focusIndex, selectedInstance, validInstances, isJoining]);

  if (!isOpen) return null;

  const hostName = invite ? (typeof invite.from === 'string' ? invite.from : invite.from.displayName) : "";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 w-screen h-screen z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md outline-none border-none"
    >
      <div
        className="relative w-[450px] p-6 flex flex-col items-center shadow-2xl"
        style={{
          backgroundImage: "url('/images/frame_background.png')",
          backgroundSize: "100% 100%",
          imageRendering: "pixelated",
        }}
      >
        {!isJoining ? (
          <>
            <h2 className="text-[#FFFF55] text-2xl mc-text-shadow mb-2 border-b-2 border-[#373737] pb-2 w-full text-center uppercase">
              Join Game
            </h2>
            <p className="text-white text-sm mc-text-shadow mb-4 text-center">
              Joining {hostName}'s game. Choose an instance:
            </p>

            {validInstances.length > 0 ? (
              <div className="w-full mb-4 flex flex-col gap-2 max-h-[300px] overflow-y-auto"
                style={{ scrollbarWidth: "thin", scrollbarColor: "#373737 transparent" }}>
                {validInstances.map((inst: any) => {
                  const isSelected = selectedInstance === inst.instanceId;
                  return (
                    <div
                      key={inst.instanceId}
                      onClick={() => { playPressSound(); setSelectedInstance(inst.instanceId); }}
                      onMouseEnter={() => setFocusIndex(0)}
                      className={`w-full px-4 py-3 cursor-pointer flex items-center gap-3 transition-all outline-none border-none ${isSelected ? "bg-white/15 border-l-4 border-[#FFFF55]" : "bg-black/20 hover:bg-black/30 border-l-4 border-transparent"}`}
                      style={{ imageRendering: "pixelated" }}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isSelected ? "border-[#FFFF55]" : "border-gray-500"}`}>
                        {isSelected && <div className="w-2 h-2 rounded-full bg-[#FFFF55]" />}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-white text-lg font-bold mc-text-shadow">{inst.name}</span>
                        {inst.selectedBranch && (
                          <span className="text-gray-400 text-xs">{inst.selectedBranch}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-red-400 text-sm mc-text-shadow mb-4 text-center">
                No installed instances available. Install a version first.
              </p>
            )}

            {error && (
              <div className="text-red-500 text-center mc-text-shadow uppercase text-xs tracking-widest mb-3">
                {error}
              </div>
            )}

            <div className="flex gap-4 w-full justify-center">
              <button
                onMouseEnter={() => {
                  const cancelIdx = validInstances.length > 0 ? 2 : 1;
                  setFocusIndex(cancelIdx);
                }}
                onClick={() => { playBackSound(); onClose(); }}
                className={`w-32 h-10 flex items-center justify-center text-xl mc-text-shadow transition-colors outline-none border-none ${(() => {
                  const cancelIdx = validInstances.length > 0 ? 2 : 1;
                  return focusIndex === cancelIdx ? "text-[#FFFF55]" : "text-white";
                })()}`}
                style={{
                  backgroundImage: (() => {
                    const cancelIdx = validInstances.length > 0 ? 2 : 1;
                    return focusIndex === cancelIdx
                      ? "url('/images/button_highlighted.png')"
                      : "url('/images/Button_Background.png')";
                  })(),
                  backgroundSize: "100% 100%",
                  imageRendering: "pixelated",
                }}
              >
                Cancel
              </button>
              {validInstances.length > 0 && (
                <button
                  onMouseEnter={() => setFocusIndex(1)}
                  onClick={handleJoin}
                  className={`w-32 h-10 flex items-center justify-center text-xl mc-text-shadow transition-colors outline-none border-none ${focusIndex === 1 ? "text-[#FFFF55]" : "text-white"}`}
                  style={{
                    backgroundImage: focusIndex === 1
                      ? "url('/images/button_highlighted.png')"
                      : "url('/images/Button_Background.png')",
                    backgroundSize: "100% 100%",
                    imageRendering: "pixelated",
                  }}
                >
                  Join
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <h2 className="text-[#FFFF55] text-2xl mc-text-shadow mb-4 border-b-2 border-[#373737] pb-2 w-full text-center uppercase">
              Joining Game
            </h2>
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="w-12 h-12 border-4 border-[#FFFF55] border-t-transparent rounded-full animate-spin" />
              <p className="text-white text-lg mc-text-shadow text-center">{status}</p>
            </div>
            {error && (
              <div className="text-red-500 text-center mc-text-shadow uppercase text-xs tracking-widest mb-3">
                {error}
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}

import { useEffect, useRef, useState, useCallback } from 'react';
export interface UseGamepadProps {
  playSfx: (file: string) => void;
  isWindowVisible: boolean;
}

export const useGamepad = ({ playSfx, isWindowVisible }: UseGamepadProps) => {
  const [connected, setConnected] = useState(false);
  const requestRef = useRef<number | undefined>(undefined);
  const focusedRef = useRef(document.hasFocus());
  const lastButtons = useRef<Record<number, boolean>>({});
  const lastAxes = useRef<Record<number, number>>({});
  const stateRef = useRef({ playSfx });

  useEffect(() => {
    const onFocus = () => { focusedRef.current = true; };
    const onBlur = () => {
      focusedRef.current = false;
      lastButtons.current = {};
      lastAxes.current = {};
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  useEffect(() => {
    stateRef.current = { playSfx };
  }, [playSfx]);

  const dispatchKey = (key: string, shiftKey = false) => {
    window.dispatchEvent(new KeyboardEvent('keydown', {
      key, shiftKey, bubbles: true, cancelable: true, view: window
    }));
    window.dispatchEvent(new KeyboardEvent('keyup', {
      key, shiftKey, bubbles: true, cancelable: true, view: window
    }));
  };

  const update = useCallback(() => {
    if (!focusedRef.current) {
      requestRef.current = requestAnimationFrame(update);
      return;
    }
    try {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : null;
      if (gamepads) {
        for (const gp of gamepads) {
          if (!gp) continue;
          const btnVal = (i: number): number => {
            const btn = gp.buttons[i];
            if (!btn) return 0;
            return typeof btn === "object" ? btn.value : (btn as any) ?? 0;
          };
          const justPressed = (i: number) => btnVal(i) > 0.5 && !lastButtons.current[i];
          if (justPressed(1)) dispatchKey('Enter');
          if (justPressed(2)) dispatchKey('Escape');
          if (justPressed(4)) dispatchKey('Tab', true);
          if (justPressed(5)) dispatchKey('Tab');
          const newButtons: Record<number, boolean> = {};
          gp.buttons.forEach((btn, i) => {
            newButtons[i] = (typeof btn === "object" ? btn.value : btn) > 0.5;
          });
          lastButtons.current = newButtons;
          const deadzone = 0.5;
          const axisY = gp.axes[2] ?? 0;
          const prevY = lastAxes.current[2] ?? 0;
          if (Math.abs(axisY) > deadzone && Math.abs(prevY) <= deadzone) {
            dispatchKey(axisY < 0 ? 'ArrowDown' : 'ArrowUp');
          }
          lastAxes.current[2] = axisY;
          const axisX = gp.axes[1] ?? 0;
          const prevX = lastAxes.current[1] ?? 0;
          if (Math.abs(axisX) > deadzone && Math.abs(prevX) <= deadzone) {
            dispatchKey(axisX > 0 ? 'ArrowRight' : 'ArrowLeft');
          }
          lastAxes.current[1] = axisX;
        }
      }
    } catch (e) {
      console.error(e);
    }
    requestRef.current = requestAnimationFrame(update);
  }, []);

  useEffect(() => {
    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      const hasGamepads = Array.from(gamepads).some(gp => gp !== null);
      setConnected(hasGamepads);
    };

    window.addEventListener("gamepadconnected", handleConnect);
    window.addEventListener("gamepaddisconnected", handleDisconnect);
    const initialGamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    if (Array.from(initialGamepads).some(gp => gp !== null)) {
      setConnected(true);
    }

    return () => {
      window.removeEventListener("gamepadconnected", handleConnect);
      window.removeEventListener("gamepaddisconnected", handleDisconnect);
    };
  }, []);

  useEffect(() => {
    if (connected && isWindowVisible) {
      requestRef.current = requestAnimationFrame(update);
    } else if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [connected, update, isWindowVisible]);

  return { connected };
};
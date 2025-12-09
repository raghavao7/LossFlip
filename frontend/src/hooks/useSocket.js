import { useEffect, useRef } from "react";
import io from "socket.io-client";

export default function useSocket(who) {
  const socketRef = useRef(null);

  const playPing = () => {
    const audio = document.getElementById("notif-audio");
    if (audio) {
      try {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } catch (_) {}
    }
  };

  useEffect(() => {
    const s = io("http://localhost:3000", {
      transports: ["websocket"],
      query: { who },
    });

    socketRef.current = s;

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [who]);

  const socket = {
    emit: (...args) => socketRef.current?.emit(...args),

    // Chat events
    on: (...args) => socketRef.current?.on(...args),
    off: (...args) => socketRef.current?.off(...args),

    // Thread Systems
    onThreadNew: (handler) => {
      socketRef.current?.on("thread:new", handler);
    },

    onThreadUpdated: (handler) => {
      socketRef.current?.on("thread:updated", handler);
    },

    playPing,
  };

  return { socket, playPing };
}

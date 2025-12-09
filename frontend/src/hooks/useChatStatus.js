import { useState } from "react";

export default function useChatStatus() {
  const [unread, setUnread] = useState({});

  const markThreadRead = (orderId) => {
    setUnread((prev) => {
      const c = { ...prev };
      delete c[orderId];
      return c;
    });
  };

  // handler factory
  const handleThreadUpdate =
    (playPing, refreshThreads) =>
    (payload = {}) => {
      if (!payload.orderId) return;

      // mark unread
      setUnread((prev) => ({
        ...prev,
        [payload.orderId]: true,
      }));

      playPing();
      refreshThreads();
    };

  return { unread, markThreadRead, handleThreadUpdate };
}

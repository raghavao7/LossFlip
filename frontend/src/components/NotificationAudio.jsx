import { useEffect, useRef } from "react";

export default function NotificationAudio() {
  const audioRef = useRef(null);

  // unlock audio after any click
  useEffect(() => {
    const unlock = () => {
      if (audioRef.current) {
        audioRef.current.volume = 1;
      }
      window.removeEventListener("click", unlock);
    };

    window.addEventListener("click", unlock);
  }, []);

  return (
    <audio
      ref={audioRef}
      src="/notification.mp3"
      preload="auto"
      id="notif-audio"
    />
  );
}

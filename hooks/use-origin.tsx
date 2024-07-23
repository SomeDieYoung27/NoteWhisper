import { useState, useEffect } from "react";

export const useOrigin = () => {
  const [mounted, setIsMounted] = useState(false);

  const origin =
    typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : "";

  useEffect(() => {
    setIsMounted(true);
  }, []);
  if (!mounted) {
    return "";
  }
  return origin;
};

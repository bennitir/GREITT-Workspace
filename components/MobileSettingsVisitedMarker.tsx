"use client";

import { useEffect } from "react";

import { mobileSettingsSeenCookieName } from "@/lib/core/mobile-settings-visit";

type Props = {
  userId: number;
};

export default function MobileSettingsVisitedMarker({ userId }: Props) {
  useEffect(() => {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${mobileSettingsSeenCookieName(userId)}=1; Max-Age=31536000; Path=/mobile; SameSite=Lax${secure}`;
  }, [userId]);

  return null;
}

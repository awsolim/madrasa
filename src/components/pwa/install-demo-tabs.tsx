"use client";

import { useState } from "react";
import { AndroidInstallDemo } from "@/components/pwa/android-install-demo";
import { IosInstallDemo } from "@/components/pwa/ios-install-demo";
import { useDeferredInstallPrompt } from "@/lib/pwa/install";

type Platform = "ios" | "android";

export function InstallDemoTabs({ siteLabel, appName }: { siteLabel: string; appName: string }) {
  const [platform, setPlatform] = useState<Platform>("ios");
  const { available: installAvailable, promptInstall } = useDeferredInstallPrompt();
  const [installing, setInstalling] = useState(false);

  async function handleInstall() {
    setInstalling(true);
    await promptInstall();
    setInstalling(false);
  }

  return (
    <div>
      <div className="mx-auto flex w-fit items-center rounded-full bg-[#F2F4F5] p-1">
        <button
          type="button"
          onClick={() => setPlatform("ios")}
          className={`min-h-9 rounded-full px-5 text-sm font-semibold transition-colors ${platform === "ios" ? "bg-white text-[#26323A] shadow-[0_4px_10px_rgba(38,50,58,0.12)]" : "text-[#6B747B]"}`}
        >
          iPhone
        </button>
        <button
          type="button"
          onClick={() => setPlatform("android")}
          className={`min-h-9 rounded-full px-5 text-sm font-semibold transition-colors ${platform === "android" ? "bg-white text-[#26323A] shadow-[0_4px_10px_rgba(38,50,58,0.12)]" : "text-[#6B747B]"}`}
        >
          Android
        </button>
      </div>

      {platform === "android" && installAvailable ? (
        <button
          type="button"
          onClick={() => void handleInstall()}
          disabled={installing}
          className="mx-auto mt-5 flex min-h-12 w-full max-w-[248px] items-center justify-center rounded-2xl bg-[#171717] px-5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {installing ? "Installing..." : "Install App"}
        </button>
      ) : null}

      <div className="mt-6">{platform === "ios" ? <IosInstallDemo siteLabel={siteLabel} appName={appName} /> : <AndroidInstallDemo siteLabel={siteLabel} appName={appName} />}</div>
    </div>
  );
}

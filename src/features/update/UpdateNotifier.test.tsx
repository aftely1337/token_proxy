import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UpdateNotifier } from "@/features/update/UpdateNotifier";

const mocks = vi.hoisted(() => ({
  checkForUpdate: vi.fn(async () => undefined),
  downloadAndInstall: vi.fn(async () => undefined),
  relaunchApp: vi.fn(async () => undefined),
  navigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    dismiss: vi.fn(),
    loading: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@/features/update/updater", () => ({
  formatBytes: (value: number) => `${value} B`,
  useUpdater: () => ({
    state: {
      status: "idle" as const,
      statusMessage: "",
      lastCheckedAt: "",
      updateInfo: null,
      updateHandle: null,
      downloadState: { downloaded: 0, total: 0 },
      lastCheckSource: null,
      appProxyUrl: "",
      appProxyUrlReady: true,
    },
    actions: {
      setAppProxyUrl: vi.fn(),
      checkForUpdate: mocks.checkForUpdate,
      downloadAndInstall: mocks.downloadAndInstall,
      relaunchApp: mocks.relaunchApp,
    },
  }),
}));

describe("update/UpdateNotifier", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not auto-check for updates on mount", async () => {
    render(<UpdateNotifier />);

    await new Promise((resolve) => {
      window.setTimeout(resolve, 0);
    });

    expect(mocks.checkForUpdate).not.toHaveBeenCalled();
  });
});
